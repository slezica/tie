// Html tiles are static: the page's own scripts (inline, handlers, files, modules) never run, only
// Tie's bootstrap does (links, hover strip, live reload). A page with scripts gets a red
// "Scripts blocked" tag in its title bar (not a switch); a page without gets none. The page never
// names its tile. Hidden window: real clicks.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const hiddenWindow = true

export default async (ctx, h) => {
  const dir = join(process.cwd(), 'tmp', `htmlstatic-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'app.js'), 'window.__file = 1')
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><title>Dash</title><script src="app.js"></script><style>h1 { color: rgb(1, 2, 3) }</style></head><body>
<h1 id="h" onclick="window.__handler = 1">Dash</h1><a id="b" href="b.html">b</a><a id="w" href="https://example.com/w">w</a><p id="out">static</p>
<script>window.__inline = 1; document.getElementById('out').textContent = 'scripted'</script>
<script type="module">window.__module = 1</script>
</body></html>`,
  )
  writeFileSync(join(dir, 'b.html'), '<!doctype html><title>B</title><h1>B</h1><p>no scripts here</p>')
  try {
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const id = (await ctx.tie('open', join(dir, 'index.html'), '--at', t0, '--side', 'r')).id
    const pill = () => ctx.page.evaluate((id) => { const p = document.querySelector(`.tile[data-id="${id}"] .pill`); return { text: p?.textContent, hidden: p?.hidden, static: p?.classList.contains('static') } }, id)
    const ran = (f) => f.evaluate(() => ({ inline: window.__inline, file: window.__file, module: window.__module, out: document.getElementById('out').textContent, color: getComputedStyle(document.getElementById('h')).color }))
    const fr = await h.htmlFrame(ctx, id)
    const r0 = await ran(fr)
    h.assert(!r0.inline && !r0.file && !r0.module && r0.out === 'static' && r0.color === 'rgb(1, 2, 3)', `static: no scripts ran, CSS did: ${JSON.stringify(r0)}`)
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, id)).page.blocked >= 3, 'blocked scripts counted')
    h.assert((await h.tileOf(ctx, id)).title === 'index.html', 'title = file name')
    let p = await pill()
    h.assert(p.text === 'Scripts blocked' && !p.hidden && p.static, `tag shown, not a toggle: ${JSON.stringify(p)}`)
    await ctx.shot('blocked')
    // Clicking the tag does nothing; an inline handler never runs on a real click.
    await ctx.page.click(`.tile[data-id="${id}"] .pill`)
    await h.clickIn(ctx, fr, '#h')
    h.assert(!(await fr.evaluate(() => window.__handler)) && (await h.tileOf(ctx, id)).page.ready, 'handler did not run; page still there')
    // Bootstrap works: the hover strip.
    const wb = await fr.locator('#w').boundingBox()
    await ctx.page.mouse.move(wb.x + 5, wb.y + wb.height / 2)
    await h.waitFor(ctx, async () => (await ctx.page.textContent(`.tile[data-id="${id}"] .link-strip`)) === 'https://example.com/w', 'link strip')
    // A page without scripts: no tag.
    await h.clickIn(ctx, fr, '#b')
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, id)).page.path.endsWith('/b.html') && (await h.tileOf(ctx, id)).page.ready, 'b.html')
    await ctx.sleep(400)
    p = await pill()
    h.assert(p.hidden && (await h.tileOf(ctx, id)).page.blocked === 0, `no tag on a page without scripts: ${JSON.stringify(p)}`)
    await ctx.shot('clean')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
