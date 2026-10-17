// Spike S2 (P0, viewers plan): popups from a sandboxed content frame with `allow-popups`. Does the
// shell's setWindowOpenHandler see them (URL, details)? Are popups without user activation
// blocked before it? Without `allow-popups`? Hidden window: real clicks reach the frame.
export const env = { TIE_SPIKE: 'nav' }
export const hiddenWindow = true

export default async (ctx, h) => {
  const p = await h.probe(ctx)
  try {
    const page = ctx.page
    // Raw probe-viewer frames (nav lock: exact viewer URL), with and without allow-popups.
    const make = async (sandbox, left) => {
      const { url } = await page.evaluate((root) => window.tie.content.open(root, 'probe'), process.cwd())
      await page.evaluate(
        ({ url, sandbox, left }) => {
          const f = Object.assign(document.createElement('iframe'), { src: url })
          f.setAttribute('sandbox', sandbox)
          Object.assign(f.style, { position: 'absolute', left: left + 'px', top: '200px', width: '300px', height: '200px', zIndex: 50 })
          document.body.append(f)
        },
        { url, sandbox, left },
      )
      await ctx.sleep(800)
      return page.frames().find((f) => f.url() === url)
    }
    const withPopups = await make('allow-scripts allow-popups', 200)
    const without = await make('allow-scripts', 600)
    // Script in the frame, with or without a user gesture (CDP Runtime.evaluate userGesture).
    const run = async (fr, expr, userGesture) => {
      const s = await page.context().newCDPSession(fr)
      await s.send('Runtime.evaluate', { expression: expr, userGesture })
      await s.detach()
      await ctx.sleep(300)
    }
    const open = (u) => `window.open(${JSON.stringify(u)})`
    const blank = (u) => `(() => { const a = Object.assign(document.createElement('a'), { href: ${JSON.stringify(u)}, target: '_blank', textContent: 'blank' }); document.body.append(a); a.click() })()`
    await run(withPopups, open(p.url + '/p-open-nogesture'), false)
    await run(withPopups, open(p.url + '/p-open-gesture'), true)
    await run(withPopups, blank(p.url + '/p-blank-nogesture'), false)
    await run(without, open(p.url + '/n-open-gesture'), true)
    await run(without, blank(p.url + '/n-blank-gesture'), true)
    // Real click on a target=_blank link.
    await withPopups.evaluate((u) => {
      const a = Object.assign(document.createElement('a'), { href: u + '/p-blank-click', target: '_blank', textContent: 'CLICK', id: 'real' })
      document.body.replaceChildren(a)
    }, p.url)
    await h.clickIn(ctx, withPopups, '#real')
    await ctx.sleep(300)

    const log = ctx.appLog()
    const seen = (path) => log.includes(`blocked window.open ${p.url}${path}`)
    const details = log.split('\n').filter((l) => l.includes('[spike] window.open')).map((l) => l.slice(l.indexOf('{')))
    const facts = Object.fromEntries(['/p-open-nogesture', '/p-open-gesture', '/p-blank-nogesture', '/n-open-gesture', '/n-blank-gesture', '/p-blank-click'].map((x) => [x, seen(x)]))
    ctx.log(JSON.stringify({ facts, details }, null, 2))
    await p.assertUntouched('popups')
    h.assert(facts['/p-open-gesture'] && facts['/p-blank-click'], 'allow-popups + gesture: handler sees the URL')
    h.assert(facts['/p-open-nogesture'] && facts['/p-blank-nogesture'], 'allow-popups, no gesture: handler fires too (no popup blocker in Electron)')
    h.assert(details.every((d) => !/frame|origin|gesture|activation/i.test(Object.keys(JSON.parse(d)).filter((k) => k !== 'frameName').join())), 'details name no opener frame and no activation')
    h.assert(!facts['/n-open-gesture'] && !facts['/n-blank-gesture'], 'no allow-popups: blocked before the handler')
    return { facts, details }
  } finally {
    await p.close()
  }
}
