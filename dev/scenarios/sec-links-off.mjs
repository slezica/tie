// Security: with the link-out confirm turned off (settings `confirmExternal: false`), http(s) links go
// straight to main's openExternal, no dialog; everything else still holds: terminal links open on
// cmd-click only, http(s) only; content frames still need focus (gesture rule); main still refuses
// other schemes. Harness instances log `external open` instead of opening the system browser.
export const settings = { confirmExternal: false }

export default async (ctx, h) => {
  const p = await h.probe(ctx)
  try {
    const opened = () => ctx.appLog().match(/\[security\] external open .*/g) || []
    const link = (url, text) => `printf '\\033]8;;${url}\\033\\\\${text}\\033]8;;\\033\\\\\\n'`
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    await ctx.page.keyboard.type(`clear; ${link(p.url + '/osc', 'web-link')}; ${link('file:///etc/hosts', 'file-link')}`)
    await ctx.page.keyboard.press('Enter')
    // Center of a word printed in the terminal (DOM renderer rows), not on the command line.
    const pointOf = (word) =>
      ctx.page.evaluate((word) => {
        for (const row of document.querySelectorAll('.xterm-rows > div')) {
          const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
          for (let n; (n = walker.nextNode()); ) {
            const i = n.textContent.indexOf(word)
            if (i < 0 || row.textContent.includes('printf')) continue
            const r = document.createRange()
            r.setStart(n, i)
            r.setEnd(n, i + word.length)
            const b = r.getBoundingClientRect()
            return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
          }
        }
        return null
      }, word)
    const [web, file] = await h.waitFor(ctx, async () => {
      if ((await h.screen(ctx, t0)).includes('printf')) return null
      const w = await pointOf('web-link')
      const f = await pointOf('file-link')
      return w && f && [w, f]
    }, 'links printed')

    // Plain click: nothing (cmd-click only, setting or not).
    await ctx.page.mouse.click(web.x, web.y)
    await ctx.sleep(500) // absence: a plain click opens nothing
    h.assert(!opened().length && !(await ctx.page.isVisible('.dialog-backdrop')), 'plain click opens nothing')

    // cmd-click: file: still refused (terminal link handler: http(s) only); http: straight out, no dialog.
    await ctx.page.keyboard.down('Meta')
    await ctx.page.mouse.click(file.x, file.y)
    await ctx.page.mouse.click(web.x, web.y)
    await ctx.page.keyboard.up('Meta')
    await h.waitFor(ctx, async () => opened().length === 1, 'cmd-click: external open, no confirm')
    h.assert(opened()[0].endsWith(p.url + '/osc') && !(await ctx.page.isVisible('.dialog-backdrop')), `only the http link went out, no dialog: ${opened()}`)
    h.assert(/\[external\] open \(no confirm\)/.test(ctx.appLog()), 'renderer took the no-confirm path (external.ts)')
    h.assert(!/refused external/.test(ctx.appLog()), 'file: link stopped by the terminal link handler (never sent to main)')

    // Content frame: the gesture rule holds without the confirm (no focus → refused).
    const pr = (await ctx.tie('add', 'probe', '--at', t0, '--side', 'r')).id
    const f = await h.probeFrame(ctx, pr)
    await h.waitFor(ctx, () => ctx.page.evaluate(() => document.activeElement?.tagName !== 'IFRAME'), 'frame not focused')
    await f.evaluate((u) => window.probe.port.postMessage({ verb: 'openLink', url: u + '/nofocus' }), p.url)
    await h.waitLog(ctx, /refused request without focus t[a-z2-9]+ openLink/)
    h.assert(!ctx.appLog().includes(`${p.url}/nofocus`), 'unfocused frame: nothing opened')
    // Focused (as a click in it would): http(s) out without a dialog; other schemes refused by main.
    await ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] iframe`).focus(), pr)
    await f.evaluate((u) => {
      for (const url of ['file:///etc/hosts', 'x-app://run?cmd=id', u + '/frame']) window.probe.port.postMessage({ verb: 'openLink', url })
    }, p.url)
    await h.waitFor(ctx, async () => opened().length === 2, 'focused frame: external open')
    h.assert(opened()[1].endsWith(p.url + '/frame') && !(await ctx.page.isVisible('.dialog-backdrop')), `frame link out, no dialog: ${opened()}`)
    for (const u of ['file:///etc/hosts', 'x-app://run?cmd=id']) h.assert(ctx.appLog().includes(`[security] refused external ${u}`), `main refused ${u}`)
    await p.assertUntouched('links out (handed to the OS, never loaded in-app)', 300)
  } finally {
    await p.close()
  }
}
