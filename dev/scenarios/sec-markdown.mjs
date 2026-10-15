// Security: markdown tiles. Raw HTML shown as text, never run; DOMPurify on the final HTML; remote
// images never requested; images outside the file's folder refused; task toggles write only the
// line the viewer saw at the revision it saw; link and toggle requests need the frame focused.
// Hidden window: real clicks focus the frame.
import { mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

export const hiddenWindow = true

export default async (ctx, h) => {
  const p = await h.probe(ctx)
  const base = join(process.cwd(), 'tmp', `secmd-${process.pid}`)
  const dir = join(base, 'docs')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(base, 'outside.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>')
  symlinkSync(join(base, 'outside.svg'), join(dir, 'link.svg'))
  const f = join(dir, 'doc.md')
  const doc = [
    '# Doc',
    '',
    '<img src=x onerror="window.__xss = 1"> <script>window.__xss = 2</script>',
    '',
    '[js](javascript:window.__xss=3) <a href="javascript:window.__xss=4">a</a>',
    '',
    `![remote](${p.url}/remote.png) ![up](../outside.svg) ![link](link.svg)`,
    '',
    '- [ ] alpha',
    '- [ ] beta',
    '',
    `[out](${p.url}/clicked)`,
    '',
  ].join('\n')
  writeFileSync(f, doc)
  const file = () => readFileSync(f, 'utf8')
  try {
    const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
    const id = (await ctx.tie('open', f, '--at', a, '--side', 'r')).id
    await h.waitFor(ctx, async () => (await h.mdState(ctx, id)).text.includes('alpha'), 'render')
    const fr = await h.contentFrame(ctx, id)

    // Raw HTML: escaped text, no elements, nothing ran.
    const dom = await fr.evaluate(() => ({
      text: document.getElementById('doc').innerText,
      scripts: document.querySelectorAll('#doc script').length,
      handlers: [...document.querySelectorAll('#doc *')].filter((e) => [...e.attributes].some((x) => x.name.startsWith('on'))).length,
      imgs: [...document.querySelectorAll('#doc img')].map((i) => i.getAttribute('src')),
      jsLinks: [...document.querySelectorAll('#doc a')].filter((a) => /^javascript:/i.test(a.getAttribute('href') ?? '')).length,
      xss: window.__xss,
    }))
    h.assert(dom.text.includes('<script>window.__xss = 2</script>') && dom.text.includes('<img src=x onerror='), `raw HTML shown as text: ${dom.text.slice(0, 200)}`)
    h.assert(dom.scripts === 0 && dom.handlers === 0 && dom.jsLinks === 0 && dom.xss === undefined, `no markup from the document: ${JSON.stringify(dom)}`)

    // DOMPurify on the final HTML: with markdown-it's raw HTML turned on (as if escaping failed),
    // the next render (live reload) still strips scripts and handlers.
    await fr.evaluate(() => window.markdown.md.set({ html: true }))
    writeFileSync(f, doc + '\n<b id="purify-probe">bold</b>\n')
    await h.waitFor(ctx, () => fr.evaluate(() => !!document.querySelector('[id$="purify-probe"]')), 'html-enabled render')
    const purified = await fr.evaluate(() => ({
      scripts: document.querySelectorAll('#doc script').length,
      handlers: [...document.querySelectorAll('#doc *')].filter((e) => [...e.attributes].some((x) => x.name.startsWith('on'))).length,
      bold: document.querySelector('[id$="purify-probe"]')?.id,
      xss: window.__xss,
    }))
    h.assert(purified.scripts === 0 && purified.handlers === 0 && purified.xss === undefined && purified.bold === 'user-content-purify-probe', `DOMPurify active: ${JSON.stringify(purified)}`)
    await fr.evaluate(() => window.markdown.md.set({ html: false }))
    writeFileSync(f, doc)
    await h.waitFor(ctx, async () => !(await h.mdState(ctx, id)).html.includes('purify-probe'), 'back to escaped')

    // Images: remote → placeholder, never requested; ../ → placeholder; symlink out → refused by main.
    const imgs = await fr.evaluate(() => ({
      srcs: [...document.querySelectorAll('#doc img')].map((i) => i.getAttribute('src')),
      blocked: [...document.querySelectorAll('#doc .img-blocked')].map((s) => s.textContent),
    }))
    h.assert(imgs.srcs.length === 1 && /^tie-content:\/\/[0-9a-f]{32}\/link\.svg$/.test(imgs.srcs[0]), `only the in-folder image is an <img>: ${JSON.stringify(imgs)}`)
    h.assert(imgs.blocked.some((t) => t.includes('remote')) && imgs.blocked.some((t) => t.includes('up')), `placeholders: ${imgs.blocked}`)
    await p.assertUntouched('remote image')
    h.assert(/refused content outside root tie-content:\/\/\w+\/link\.svg/.test(ctx.appLog()), 'symlink out of the folder refused by main')

    // Without focus (terminal active): link and toggle requests refused, nothing opened or written.
    await ctx.tie('focus', a)
    await ctx.sleep(200)
    h.assert((await ctx.page.evaluate(() => document.activeElement?.tagName)) !== 'IFRAME', 'frame not focused')
    const rev = (await h.mdState(ctx, id)).rev
    const post = (m) => fr.evaluate((m) => window.markdown.port.postMessage(m), m)
    await post({ verb: 'followLink', href: `${p.url}/nofocus`, newTile: false })
    await post({ verb: 'toggleTask', line: 8, expected: '- [ ] alpha', rev })
    await ctx.sleep(500)
    h.assert((ctx.appLog().match(/refused request without focus t\d+ (followLink|toggleTask)/g) ?? []).length === 2, 'both refused without focus')
    h.assert(!ctx.appLog().includes(`${p.url}/nofocus`) && file() === doc, 'nothing opened, file unchanged')

    // Focused (real click in the frame): a real click on a box toggles it (control).
    const box = await fr.locator('input.task-box').first().boundingBox()
    await ctx.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await h.waitFor(ctx, async () => file().includes('- [x] alpha'), 'real click toggles')
    h.assert(file() === doc.replace('- [ ] alpha', '- [x] alpha'), 'only that line changed')
    await h.waitFor(ctx, () => fr.evaluate(() => document.querySelector('input.task-box').checked), 'box shows the file')
    h.assert((await ctx.page.evaluate(() => document.activeElement?.tagName)) === 'IFRAME', 'frame focused')

    // Stale revision, changed line, not a task line: refused, file unchanged.
    const now = file()
    const cur = (await h.mdState(ctx, id)).rev
    for (const [why, m] of [
      ['stale revision', { verb: 'toggleTask', line: 9, expected: '- [ ] beta', rev }],
      ['line changed', { verb: 'toggleTask', line: 9, expected: '- [ ] gamma', rev: cur }],
      ['not a task', { verb: 'toggleTask', line: 0, expected: '# Doc', rev: cur }],
      ['no such line', { verb: 'toggleTask', line: 999, expected: '', rev: cur }],
    ]) {
      await post(m)
      await h.waitFor(ctx, async () => ctx.appLog().includes(`refused toggleTask ${why}`), `refused: ${why}`)
      h.assert(file() === now, `${why}: file unchanged`)
    }

    // Links: only http(s) out (main logs it); other schemes refused; never in-app.
    for (const href of ['smb://host/share.md', 'file:///etc/hosts', 'javascript:alert(1)', 'x-app://run', '//evil.example/x.md']) await post({ verb: 'followLink', href, newTile: false })
    await post({ verb: 'followLink', href: `${p.url}/focused`, newTile: false })
    await ctx.sleep(500)
    const log = ctx.appLog()
    h.assert((log.match(/\[security\] refused link t\d+/g) ?? []).length === 5, 'other schemes refused')
    h.assert(log.includes(`external open ${p.url}/focused`), 'http(s) goes to the system browser (harness: logged)')
    await p.assertUntouched('links', 300)
    h.assert((await h.list(ctx)).tiles.length === 2, 'no tiles opened')
  } finally {
    await p.close()
    rmSync(base, { recursive: true, force: true })
  }
}
