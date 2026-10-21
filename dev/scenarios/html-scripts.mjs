// Html tiles start static (setting htmlScripts, default off): the page's own scripts (inline,
// handlers, files, modules) don't run, the bootstrap still does (links, hover strip), the title-bar
// pill says "Scripts: off"; clicking it reloads the page with scripts, remembered per file for the
// session; the page never names its tile. Hidden window: real clicks.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const hiddenWindow = true

export default async (ctx, h) => {
  const dir = join(process.cwd(), 'tmp', `htmlscripts-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'app.js'), 'window.__file = 1')
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><title>Dash</title><script src="app.js"></script></head><body>
<h1 id="h" onclick="window.__handler = 1">Dash</h1><a id="b" href="b.html">b</a><a id="w" href="https://example.com/w">w</a><p id="out">static</p>
<script>window.__inline = 1; document.getElementById('out').textContent = 'scripted'</script>
<script type="module">window.__module = 1</script>
</body></html>`,
  )
  writeFileSync(join(dir, 'b.html'), '<!doctype html><title>B</title><h1>B</h1>')
  try {
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const id = (await ctx.tie('open', join(dir, 'index.html'), '--at', t0, '--side', 'r')).id
    const pill = () => ctx.page.evaluate((id) => { const p = document.querySelector(`.tile[data-id="${id}"] .pill`); return { text: p?.textContent, on: p?.classList.contains('on'), hidden: p?.hidden } }, id)
    const ran = (f) => f.evaluate(() => ({ inline: window.__inline, file: window.__file, module: window.__module, out: document.getElementById('out').textContent }))
    let fr = await h.htmlFrame(ctx, id)
    const r0 = await ran(fr)
    h.assert(!r0.inline && !r0.file && !r0.module && r0.out === 'static', `static by default: ${JSON.stringify(r0)}`)
    h.assert((await h.tileOf(ctx, id)).page.scripts === false && (await h.tileOf(ctx, id)).title === 'index.html', 'tie list: scripts false, title = file name')
    let p = await pill()
    h.assert(p.text === 'Scripts: off' && !p.on && !p.hidden, `pill off: ${JSON.stringify(p)}`)
    // Bootstrap still works: a click runs no handler; the link strip shows the hovered target.
    await h.clickIn(ctx, fr, '#h')
    h.assert(!(await fr.evaluate(() => window.__handler)), 'inline handler did not run')
    const wb = await fr.locator('#w').boundingBox()
    await ctx.page.mouse.move(wb.x + 5, wb.y + wb.height / 2)
    await h.waitFor(ctx, async () => (await ctx.page.textContent(`.tile[data-id="${id}"] .link-strip`)) === 'https://example.com/w', 'link strip')
    await ctx.shot('static')

    // Pill: scripts on, page reloaded, scripts ran.
    await ctx.page.click(`.tile[data-id="${id}"] .pill`)
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, id)).page.scripts === true && (await h.tileOf(ctx, id)).page.ready, 'reloaded with scripts')
    fr = await h.htmlFrame(ctx, id)
    const r1 = await ran(fr)
    h.assert(r1.inline === 1 && r1.file === 1 && r1.module === 1 && r1.out === 'scripted', `scripts ran: ${JSON.stringify(r1)}`)
    p = await pill()
    h.assert(p.text === 'Scripts: on' && p.on, `pill on: ${JSON.stringify(p)}`)
    h.assert((await h.tileOf(ctx, id)).title === 'index.html', 'title still the file name with scripts on')
    await ctx.shot('scripted')
    // Navigating within the folder keeps the choice (same token).
    await h.clickIn(ctx, fr, '#b')
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, id)).page.path.endsWith('/b.html') && (await h.tileOf(ctx, id)).page.ready, 'b.html')
    h.assert((await h.tileOf(ctx, id)).page.scripts === true, 'scripts stay on across in-folder navigation')
    // Remembered for the file this session: a second tile on index.html starts with scripts on.
    const id2 = (await ctx.tie('open', join(dir, 'index.html'), '--at', t0, '--side', 'b')).id
    const f2 = await h.htmlFrame(ctx, id2)
    h.assert((await ran(f2)).inline === 1 && (await h.tileOf(ctx, id2)).page.scripts === true, 'remembered per file')
    // Pill back off: static again.
    await ctx.page.click(`.tile[data-id="${id2}"] .pill`)
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, id2)).page.scripts === false && (await h.tileOf(ctx, id2)).page.ready, 'reloaded static')
    h.assert((await ran(await h.htmlFrame(ctx, id2))).out === 'static', 'static again')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
