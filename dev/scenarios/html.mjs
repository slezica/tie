// Html tiles: the file is the page. Renders with its sibling JS / CSS / module / data (fetch, XHR);
// links within the folder navigate the tile (history, cmd+[ / cmd+]); the page's own navigations
// are followed; subfolders stay on the token, other folders get a new one; other kinds open beside;
// the web asks first (Cancel / Open); live reload on page and sibling changes keeps the scroll;
// a reopened file starts with empty storage. Hidden window: real clicks in the frame.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const hiddenWindow = true

const page = (title, body, head = '') => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${head}</head><body>${body}</body></html>`

export default async (ctx, h) => {
  const base = join(process.cwd(), 'tmp', `html-${process.pid}`)
  const dir = join(base, 'site')
  mkdirSync(join(dir, 'sub'), { recursive: true })
  mkdirSync(join(base, 'other'), { recursive: true })
  const filler = Array.from({ length: 200 }, (_, i) => `<p>Para ${i}</p>`).join('')
  const index = (v) =>
    page(
      'Index',
      `<h1 id="h">Index ${v}</h1><a id="to-b" href="b.html">to b</a> <a id="sub" href="sub/c.html">sub</a> <a id="other" href="../other/d.html">other</a> <a id="web" href="https://example.com/x?q=1">web</a> <a id="md" href="notes.md" target="_blank">notes</a> <a id="txt" href="log.txt">log</a> <a id="anchor" href="#end">end</a><div id="data"></div><div id="mod"></div><div id="xhr"></div>${filler}<p id="end">end</p>
<script>fetch('data.json').then((r) => r.json()).then((j) => (document.getElementById('data').textContent = 'data ' + j.v))</script>
<script type="module">import { x } from './mod.mjs'; document.getElementById('mod').textContent = 'mod ' + x</script>
<script>const q = new XMLHttpRequest(); q.open('GET', 'data.json'); q.onload = () => (document.getElementById('xhr').textContent = 'xhr ' + q.status); q.send()</script>`,
      '<link rel="stylesheet" href="style.css"><script src="app.js"></script>',
    )
  writeFileSync(join(dir, 'index.html'), index(1))
  writeFileSync(join(dir, 'b.html'), page('B', '<h1>B</h1><a id="back" href="index.html">back</a>'))
  writeFileSync(join(dir, 'sub', 'c.html'), page('C', '<h1>C</h1>'))
  writeFileSync(join(base, 'other', 'd.html'), page('D', '<h1>D</h1>'))
  writeFileSync(join(dir, 'style.css'), 'h1 { color: rgb(1, 2, 3) }')
  writeFileSync(join(dir, 'app.js'), 'window.appLoaded = true')
  writeFileSync(join(dir, 'mod.mjs'), 'export const x = 7')
  writeFileSync(join(dir, 'data.json'), '{"v": 42}')
  writeFileSync(join(dir, 'notes.md'), '# Notes\n')
  writeFileSync(join(dir, 'log.txt'), 'log line\n')
  try {
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const id = (await ctx.tie('open', join(dir, 'index.html'), '--at', t0, '--side', 'r')).id
    const pg = async () => (await h.tileOf(ctx, id)).page
    const fr = () => h.htmlFrame(ctx, id)
    const text = async (sel) => (await fr()).evaluate((s) => document.querySelector(s)?.textContent, sel)
    const shows = (title) => h.waitFor(ctx, async () => (await (await fr()).title()) === title && (await pg()).ready, `shows ${title}`)

    // Render: siblings load (classic + module scripts, CSS, fetch, XHR); its own origin.
    await shows('Index')
    await h.waitFor(ctx, async () => (await text('#data')) === 'data 42' && (await text('#mod')) === 'mod 7' && (await text('#xhr')) === 'xhr 200', 'fetch, module, XHR')
    const f0 = await fr()
    const r = await f0.evaluate(() => ({ app: window.appLoaded, color: getComputedStyle(document.getElementById('h')).color, origin: location.origin }))
    h.assert(r.app && r.color === 'rgb(1, 2, 3)' && /^tie-content:\/\/[0-9a-f]{32}$/.test(r.origin), `siblings: ${JSON.stringify(r)}`)
    const t = await h.tileOf(ctx, id)
    h.assert(t.kind === 'html' && t.title === 'Index' && !t.error, `html tile, title from <title>: ${JSON.stringify(t)}`)
    // Title changes follow; hostile titles stay text, bounded, without control characters.
    await f0.evaluate(() => (document.title = 'Changed'))
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, id)).title === 'Changed', 'title change follows')
    await f0.evaluate(() => (document.title = '\u0007<b id="inj">x</b>' + 'y'.repeat(3000)))
    const ht = await h.waitFor(ctx, async () => ((await h.tileOf(ctx, id)).title.includes('inj') ? (await h.tileOf(ctx, id)).title : null), 'hostile title shown')
    h.assert(ht.length === 200 && ht.startsWith('<b id="inj">') && !(await ctx.page.$('#inj')), `hostile title: text, bounded (${ht.length})`)
    await f0.evaluate(() => (document.title = 'Index'))
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, id)).title === 'Index', 'title back')
    await ctx.shot('index')

    // Link in the folder: same tile, same token; back / forward. (A first click focuses the frame:
    // in the hidden window, a link clicked as the very first click may arrive before the shell sees
    // the frame focused, and the gesture rule refuses it; same flake as markdown-links.)
    const url0 = (await pg()).url
    await h.clickIn(ctx, f0, '#h')
    await h.clickIn(ctx, f0, '#to-b')
    await shows('B')
    let p = await pg()
    h.assert(p.path.endsWith('/site/b.html') && p.history.index === 1 && p.url.split('/')[2] === url0.split('/')[2], `b.html in the tile: ${JSON.stringify(p)}`)
    h.assert((await h.tileOf(ctx, id)).title === 'B', 'title follows (B.html <title>)')
    await h.press(ctx, 'Meta+[')
    await shows('Index')
    await h.press(ctx, 'Meta+]')
    await shows('B')
    await h.press(ctx, 'Meta+[')
    await shows('Index')
    h.assert(JSON.stringify((await pg()).history) === '{"index":0,"length":2}', `history: ${JSON.stringify((await pg()).history)}`)

    // The page navigates itself (script): the host follows (location, a history entry).
    await (await fr()).evaluate(() => (location.href = 'b.html'))
    await shows('B')
    p = await pg()
    h.assert(p.path.endsWith('/site/b.html') && p.history.index === 1 && p.history.length === 2, `script navigation followed: ${JSON.stringify(p)}`)
    await h.press(ctx, 'Meta+[')
    await shows('Index')

    // Subfolder: same token. Another folder: new token (frame reloads), back returns.
    await h.clickIn(ctx, await fr(), '#sub')
    await shows('C')
    h.assert((await pg()).url.split('/')[2] === url0.split('/')[2], 'subfolder: same token')
    await h.press(ctx, 'Meta+[')
    await shows('Index')
    await h.clickIn(ctx, await fr(), '#other')
    await shows('D')
    h.assert((await pg()).url.split('/')[2] !== url0.split('/')[2], 'other folder: new token')
    await h.press(ctx, 'Meta+[')
    await shows('Index')

    // Other kinds: beside, in their kind (target=_blank markdown, plain-click text).
    await h.clickIn(ctx, await fr(), '#md')
    await h.waitFor(ctx, async () => (await h.list(ctx)).tiles.some((x) => x.kind === 'markdown' && x.title === 'notes.md'), 'markdown beside')
    await ctx.sleep(1100) // new-tile throttle
    await h.clickIn(ctx, await fr(), '#txt')
    await h.waitFor(ctx, async () => (await h.list(ctx)).tiles.some((x) => x.kind === 'text' && x.title === 'log.txt'), 'text beside')
    for (const x of (await h.list(ctx)).tiles.filter((x) => x.id !== id && x.id !== t0)) await ctx.tie('close', x.id)
    h.assert((await pg()).path.endsWith('/site/index.html'), 'still on index')

    // The web: asks first, full URL shown, Cancel focused. Cancel: nothing. Open: system browser.
    await h.clickIn(ctx, await fr(), '#web')
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.external-open'), 'confirm dialog')
    const dlg = await ctx.page.evaluate(() => ({ url: document.querySelector('.dialog.external-open .url')?.textContent, focus: document.activeElement?.className }))
    h.assert(dlg.url === 'https://example.com/x?q=1' && dlg.focus.includes('cancel'), `dialog: ${JSON.stringify(dlg)}`)
    await ctx.shot('confirm')
    await ctx.page.click('.dialog .cancel')
    await ctx.sleep(300)
    h.assert(!ctx.appLog().includes('external open https://example.com/x'), 'cancel: nothing opened')
    await h.clickIn(ctx, await fr(), '#web')
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.external-open'), 'confirm dialog again')
    await ctx.page.click('.dialog .confirm')
    await h.waitFor(ctx, async () => ctx.appLog().includes('external open https://example.com/x?q=1'), 'open: system browser (harness: logged)')

    // In-page anchor: the page's own (scrolls, no navigation).
    await h.clickIn(ctx, await fr(), '#anchor')
    await ctx.sleep(300)
    h.assert((await (await fr()).evaluate(() => scrollY)) > 500 && (await pg()).history.length === 2, 'anchor scrolls in the page')

    // Live reload: the page itself, then a sibling; the scroll stays.
    await (await fr()).evaluate(() => scrollTo(0, 1200))
    await ctx.sleep(200)
    const reloads = (await pg()).reloads
    writeFileSync(join(dir, 'index.html'), index(2))
    await h.waitFor(ctx, async () => (await text('#h')) === 'Index 2', 'page change reloads')
    const y1 = await (await fr()).evaluate(() => scrollY)
    h.assert(Math.abs(y1 - 1200) <= 2, `scroll kept across reload: ${y1}`)
    writeFileSync(join(dir, 'data.json'), '{"v": 43}')
    await h.waitFor(ctx, async () => (await text('#data')) === 'data 43', 'sibling change reloads')
    h.assert((await pg()).reloads >= reloads + 2 && !(await h.tileOf(ctx, id)).error, 'reloads counted, no error (navigation is not a crash)')
    await ctx.shot('reloaded')

    // cmd+R: reload, scroll kept.
    const before = await fr()
    await before.evaluate(() => (window.__old = 1))
    await h.press(ctx, 'Meta+r')
    await h.waitFor(ctx, async () => (await (await fr()).evaluate(() => !window.__old && document.readyState === 'complete' && Math.abs(scrollY - 1200) <= 2)), 'cmd+R: reloaded, scroll kept')

    // Storage: own origin per open (a reopened file gets a new token: empty storage). Not removed
    // from disk on close (Chromium skips the custom scheme: plan Results, PENDING).
    await (await fr()).evaluate(() => localStorage.setItem('k', 'v'))
    await ctx.tie('close', id)
    const again = (await ctx.tie('open', join(dir, 'index.html'), '--at', t0, '--side', 'r')).id
    const fa = await h.htmlFrame(ctx, again)
    h.assert((await fa.evaluate(() => localStorage.getItem('k'))) === null, 'reopened: fresh storage')
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
}
