// Security: markdown tiles. Raw HTML shown as text, never run (body, footnotes, front matter); DOMPurify on the final HTML; remote
// images never requested; images outside the file's folder refused; read-only (task boxes inert,
// write-shaped requests dropped, no doc write API); link requests need the frame focused.
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
    '---',
    'title: <script>window.__xss = 5</script>',
    '---',
    '',
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
    'Noted.[^x]',
    '',
    '[^x]: <img src=x onerror="window.__xss = 6"> <b>bold</b>',
    '',
  ].join('\n')
  const lineOf = (s) => doc.split('\n').indexOf(s)
  writeFileSync(f, doc)
  const file = () => readFileSync(f, 'utf8')
  try {
    const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
    const id = (await ctx.tie('add', f, '--at', a, '--side', 'r')).id
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
    const parts = await fr.evaluate(() => ({
      front: document.querySelector('#doc pre.front-matter')?.textContent,
      note: document.querySelector('#doc .footnote-item')?.textContent,
      bold: document.querySelectorAll('#doc .footnote-item b').length,
    }))
    h.assert(parts.front?.includes('<script>window.__xss = 5</script>'), `front matter: raw HTML as text: ${parts.front}`)
    h.assert(parts.note?.includes('<img src=x onerror=') && parts.note.includes('<b>bold</b>') && parts.bold === 0, `footnote: raw HTML as text: ${JSON.stringify(parts)}`)

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

    // Without focus (terminal active): link requests refused, nothing opened.
    await ctx.tie('focus', a)
    await h.eventually(ctx, async () => h.assert((await ctx.page.evaluate(() => document.activeElement?.tagName)) !== 'IFRAME', 'frame not focused'))
    const rev = (await h.mdState(ctx, id)).rev
    const post = (m) => fr.evaluate((m) => window.markdown.port.postMessage(m), m)
    await post({ verb: 'followLink', href: `${p.url}/nofocus`, newTile: false })
    await h.eventually(ctx, async () => h.assert(/refused request without focus t[a-z2-9]+ followLink/.test(ctx.appLog()), 'link refused without focus'))
    h.assert(!ctx.appLog().includes(`${p.url}/nofocus`), 'nothing opened')

    // Read-only: a real click on a task box (focuses the frame) changes nothing; boxes are inert.
    const box = await fr.locator('input.task-box').first().boundingBox()
    await ctx.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await h.eventually(ctx, async () => h.assert((await ctx.page.evaluate(() => document.activeElement?.tagName)) === 'IFRAME', 'frame focused'))
    await ctx.sleep(500) // absence: the click toggles nothing
    const boxes = await fr.evaluate(() => [...document.querySelectorAll('input.task-box')].map((b) => ({ disabled: b.disabled, checked: b.checked })))
    h.assert(boxes.length === 2 && boxes.every((b) => b.disabled && !b.checked), `task boxes display-only: ${JSON.stringify(boxes)}`)
    h.assert(file() === doc, 'click on a task box: file unchanged')

    // Write-shaped requests, frame focused (gesture rule satisfied): unknown verbs, dropped; file unchanged.
    const before = (ctx.appLog().match(/dropped request/g) ?? []).length
    const writes = [
      { verb: 'toggleTask', line: lineOf('- [ ] alpha'), expected: '- [ ] alpha', rev },
      { verb: 'writeFile', path: f, text: 'pwned' },
      { verb: 'saveDoc', text: 'pwned' },
    ]
    for (const m of writes) await post(m)
    await h.eventually(ctx, async () => {
      const dropped = ctx.appLog().match(/dropped request t[a-z2-9]+ .*/g) ?? []
      h.assert(dropped.length - before === writes.length && dropped.some((l) => l.includes('toggleTask')), `write-shaped requests dropped as unknown verbs: ${dropped.slice(before)}`)
    })
    h.assert(!/refused toggleTask|\[docs\] toggled/.test(ctx.appLog()), 'no write path reached')
    h.assert(file() === doc, 'file unchanged')

    // No write channel for docs in the UI bridge either.
    const api = await ctx.page.evaluate(() => ({ doc: Object.keys(window.tie.doc).sort(), all: JSON.stringify(window.tie, (k, v) => (typeof v === 'function' ? k : v)) }))
    h.assert(JSON.stringify(api.doc) === JSON.stringify(['close', 'onChange', 'open', 'pick', 'viewer']), `tie.doc: read-only API: ${api.doc}`)
    h.assert(!/toggle|write|save/i.test(api.all.replace(/"write":"write"/, '')), `no doc write method anywhere: ${api.all}`)

    // Links: only http(s) out (main logs it); other schemes refused; never in-app.
    for (const href of ['smb://host/share.md', 'file:///etc/hosts', 'javascript:alert(1)', 'x-app://run', '//evil.example/x.md']) await post({ verb: 'followLink', href, newTile: false })
    await post({ verb: 'followLink', href: `${p.url}/focused`, newTile: false })
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.external-open'), 'http(s): confirm dialog first')
    h.assert(!ctx.appLog().includes(`external open ${p.url}/focused`), 'nothing opened before the confirm')
    await ctx.page.click('.dialog .confirm')
    await h.waitFor(ctx, async () => ctx.appLog().includes(`external open ${p.url}/focused`), 'http(s) goes to the system browser after Open (harness: logged)')
    const log = ctx.appLog()
    h.assert((log.match(/\[security\] refused link t[a-z2-9]+/g) ?? []).length === 5, 'other schemes refused')
    await p.assertUntouched('links', 300)
    h.assert((await h.list(ctx)).tiles.length === 2, 'no tiles opened')
  } finally {
    await p.close()
    rmSync(base, { recursive: true, force: true })
  }
}
