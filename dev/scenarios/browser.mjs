// Browser tiles (<webview> guest on a local site): tie add <url>, title from the page, links
// (real clicks), back / forward / reload (keys from the UI and from inside the guest), location
// bar (cmd+L, typed URL, refused input), keys from the guest (cmd+D splits), focus activation,
// pointer shield during drags, tab switch / shelve keep the page, browser template (empty, location
// focused), tie add browser [url], CLI errors. Hidden window: real clicks reach the guest.
import { execFileSync } from 'node:child_process'
import { inflateSync } from 'node:zlib'
import { join } from 'node:path'
import { ROOT } from '../lib.mjs'

export const hiddenWindow = true

// One window pixel (CSS px) as [r, g, b] (1-px PNG: first row, after the filter byte).
async function pixel(ctx, x, y) {
  const png = await ctx.page.screenshot({ clip: { x, y, width: 1, height: 1 }, scale: 'css' })
  const idat = []
  for (let i = 8; i < png.length; ) {
    const len = png.readUInt32BE(i)
    if (png.toString('ascii', i + 4, i + 8) === 'IDAT') idat.push(png.subarray(i + 8, i + 8 + len))
    i += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  return [raw[1], raw[2], raw[3]]
}

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font: 16px sans-serif">${body}
<script>window.__keys = []; addEventListener('keydown', (e) => window.__keys.push((e.metaKey ? 'Meta+' : '') + e.key))</script></body></html>`

export default async (ctx, h) => {
  const s = await h.site(ctx, (path) => {
    if (path === '/one') return page('Page One', '<a id="two" href="/two" style="display:block;padding:20px">to two</a><input id="in">')
    if (path === '/two') return page('Page Two', '<h1>two</h1><a id="three" href="/three">three</a>')
    if (path === '/three') return page('Page Three', '<h1>three</h1>')
    if (path === '/red') return page('Red', '<style>html,body{margin:0;height:100%;background:#ff0000}</style>')
    if (path === '/store') return page('Store', "<script>window.__before = localStorage.getItem('k'); localStorage.setItem('k', 'v'); document.cookie = 'c=1; max-age=3600'</script>")
    return null
  })
  const cli = (...args) => {
    const env = { ...process.env, TIE_INSTANCE: ctx.instance }
    delete env.TIE_SOCKET
    delete env.TIE_TILE
    try {
      return { code: 0, out: execFileSync(join(ROOT, 'bin/tie'), args, { env, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim() }
    } catch (e) {
      return { code: e.status, err: e.stderr.toString().trim() }
    }
  }
  try {
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const hits = (p) => s.hits.filter((x) => x === p).length

    // tie add <url>: a browser tile; title from the page, location = URL.
    const b = (await ctx.tie('add', s.url + '/one', '--at', t0, '--side', 'r')).id
    let g = await h.guestPage(ctx, b)
    let t = await h.tileOf(ctx, b)
    h.assert(t.kind === 'browser' && t.title === 'Page One' && t.web.url === s.url + '/one', `opened: ${JSON.stringify(t.web)} ${t.title}`)
    const loc = () => ctx.page.$eval(`.tile[data-id="${b}"] .navbar .location`, (e) => e.value)
    h.assert((await loc()) === s.url + '/one', 'location shows the URL')
    await ctx.shot('one')

    // Real click on a link (other tile active): navigates; the click activates the tile.
    await ctx.tie('focus', t0)
    await ctx.sleep(200)
    const r = await h.rectOf(ctx, b)
    const box = await g.locator('#two').boundingBox()
    const body = await ctx.page.locator(`.tile[data-id="${b}"] webview`).boundingBox()
    await ctx.page.mouse.click(body.x + box.x + 10, body.y + box.y + box.height / 2)
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, b)).title === 'Page Two', 'link navigates')
    h.assert((await h.list(ctx)).active === b, 'click in the guest activates its tile')
    h.assert((await ctx.page.evaluate(() => document.activeElement?.tagName)) === 'WEBVIEW', 'guest focused')
    t = await h.tileOf(ctx, b)
    h.assert(t.web.back && !t.web.forward && (await loc()) === s.url + '/two', `history after link: ${JSON.stringify(t.web)}`)

    // Back / forward: cmd+[ / cmd+] (through main, UI side) and from inside the guest.
    await h.press(ctx, 'Meta+[')
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, b)).title === 'Page One', 'cmd+[ back')
    await h.guestKey(ctx, b, 'Meta+]')
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, b)).title === 'Page Two', 'cmd+] forward from the guest')
    g = await h.guestPage(ctx, b)
    h.assert(!(await g.evaluate(() => window.__keys)).some((k) => k.startsWith('Meta+')), 'shortcut keys never reach the page')

    // Reload: cmd+R from the guest re-requests the page; plain keys and Esc reach the page.
    const before = hits('/two')
    await h.guestKey(ctx, b, 'Meta+r')
    await h.waitFor(ctx, async () => hits('/two') === before + 1, 'cmd+R reloads')
    g = await h.guestPage(ctx, b)
    await h.guestKey(ctx, b, 'x')
    await h.guestKey(ctx, b, 'Escape')
    await h.waitFor(ctx, async () => JSON.stringify(await g.evaluate(() => window.__keys)) === '["x","Escape"]', 'plain keys and Esc reach the page')

    // Keys from the guest: cmd+D splits (a terminal: browsers split into terminals).
    const n = (await h.list(ctx)).tiles.length
    await h.guestKey(ctx, b, 'Meta+d')
    await h.waitFor(ctx, async () => (await h.list(ctx)).tiles.length === n + 1, 'cmd+D from the guest splits')
    const split = (await h.list(ctx)).tiles.at(-1)
    h.assert(split.kind === 'terminal', `split is a terminal: ${split.kind}`)
    await ctx.tie('close', split.id)
    await ctx.tie('focus', b)
    await ctx.sleep(200)

    // Location bar: cmd+L (from the guest) focuses it; a typed URL loads; junk is refused.
    await h.guestKey(ctx, b, 'Meta+l')
    await h.waitFor(ctx, () => ctx.page.evaluate(() => document.activeElement?.classList.contains('location')), 'cmd+L focuses the location')
    await ctx.page.keyboard.type(s.url + '/three')
    await ctx.page.keyboard.press('Enter')
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, b)).title === 'Page Three', 'typed URL loads')
    h.assert((await ctx.page.evaluate(() => document.activeElement?.tagName)) === 'WEBVIEW', 'Enter: keys back to the page')
    await h.press(ctx, 'Meta+l')
    await ctx.page.keyboard.type('how to cook')
    await ctx.page.keyboard.press('Enter')
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog'), 'refused input: dialog')
    const msg = await ctx.page.$eval('.dialog', (d) => d.textContent)
    h.assert(/Not a web address/.test(msg), `dialog: ${msg}`)
    await ctx.page.keyboard.press('Enter')
    await h.waitFor(ctx, async () => !(await ctx.page.isVisible('.dialog')), 'dialog closed')
    h.assert((await h.tileOf(ctx, b)).web.url === s.url + '/three' && (await loc()) === s.url + '/three', 'refused: page and location unchanged')

    // Pointer shield: while tracking a drag, the webview ignores the pointer.
    const tp = await h.titlePoint(ctx, b)
    let shield = null
    await h.drag(ctx, tp, { x: tp.x + 60, y: tp.y + 200 }, { during: async () => (shield = await ctx.page.$eval(`.tile[data-id="${b}"] webview`, (w) => `${document.body.className}: ${getComputedStyle(w).pointerEvents}`)) })
    h.assert(/tracking/.test(shield) && shield.endsWith(': none'), `webview shielded during drag: ${shield}`)

    // Another tab and back; shelved and back: same page, no reload.
    const three = hits('/three')
    await h.press(ctx, 'Meta+t')
    await ctx.sleep(300)
    await h.press(ctx, 'Meta+1')
    await ctx.sleep(300)
    await ctx.tie('move', b, '--shelve')
    await ctx.sleep(300)
    await ctx.tie('move', b, '--at', t0, '--side', 'r')
    await ctx.sleep(300)
    g = await h.guestPage(ctx, b)
    h.assert((await g.evaluate(() => document.querySelector('h1').textContent)) === 'three' && hits('/three') === three, 'tab switch / shelve keep the page')
    const rb = await h.rectOf(ctx, b)
    const wv = await ctx.page.locator(`.tile[data-id="${b}"] webview`).boundingBox()
    h.assert(Math.abs(wv.width - (rb.w - 2)) < 4 && wv.height > rb.h - 80, `webview fills the body after moves: ${JSON.stringify(wv)} in ${JSON.stringify(rb)}`)
    await ctx.shot('three')

    // Browser template: empty tile, location focused; typed bare host:port → https:// (refused by
    // the http server: Chromium's error page, still the tile's URL).
    const m = (await h.list(ctx)).tiles.length
    await h.drag(ctx, await h.template(ctx, 'browser'), await h.sidePoint(ctx, b, 'b'))
    const e = await h.waitFor(ctx, async () => (await h.list(ctx)).tiles.length === m + 1 && (await h.list(ctx)).tiles.at(-1), 'template opens a browser')
    h.assert(e.kind === 'browser' && e.active && e.web.url === 'about:blank', `template: ${JSON.stringify(e)}`)
    await h.waitFor(ctx, () => ctx.page.evaluate((id) => document.activeElement === document.querySelector(`.tile[data-id="${id}"] .location`), e.id), 'template: location focused')
    await ctx.page.keyboard.type(s.url.replace('http://', '') + '/one')
    await ctx.page.keyboard.press('Enter')
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, e.id)).web.url.startsWith('https://127.0.0.1'), 'bare host → https')
    await ctx.tie('close', e.id)

    // Layering: the UI's tile menu paints over the guest.
    const red = (await ctx.tie('add', s.url + '/red', '--at', b, '--side', 'b')).id
    await h.guestPage(ctx, red)
    const rr = await h.rectOf(ctx, red)
    h.assert((await pixel(ctx, rr.x + rr.w / 2, rr.y + rr.h / 2))[0] > 200, 'guest paints (red)')
    await ctx.page.mouse.click(rr.x + 60, rr.y + 15, { button: 'right' })
    await ctx.sleep(300)
    const mb = (await h.boxOf(ctx, '.menu')).box
    h.assert(mb.y + mb.height > rr.y + 60, 'menu reaches over the guest')
    const pm = await pixel(ctx, mb.x + mb.width / 2, mb.y + mb.height - 4)
    h.assert(pm[0] < 200, `menu paints over the guest: ${pm}`)
    await ctx.page.keyboard.press('Escape')
    await ctx.tie('close', red)

    // Partition persists: storage and cookies of a closed tile are there for a new one.
    const st = (await ctx.tie('add', s.url + '/store', '--at', b, '--side', 'b')).id
    await h.guestPage(ctx, st)
    await ctx.tie('close', st)
    const st2 = (await ctx.tie('add', s.url + '/store', '--at', b, '--side', 'b')).id
    const sp = await h.guestPage(ctx, st2)
    h.assert((await sp.evaluate(() => window.__before)) === 'v' && (await sp.evaluate(() => document.cookie)) === 'c=1', 'storage and cookies persist across tiles')
    await ctx.tie('close', st2)

    // CLI: tie add browser [url]; errors.
    const bare = JSON.parse(cli('add', 'browser', '--json').out)
    h.assert(bare.kind === 'browser' && bare.web.url === 'about:blank' && !bare.active, `tie add browser: ${JSON.stringify(bare.web)}`)
    const withUrl = JSON.parse(cli('add', 'browser', s.url + '/two', '--json').out)
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, withUrl.id)).title === 'Page Two', 'tie add browser <url>')
    for (const [args, err] of [
      [['add', 'browser', 'file:///etc/hosts'], 'Not a web address'],
      [['add', 'browser', 'javascript:alert(1)'], 'Not a web address'],
      [['add', 'browser', 'how to'], 'Not a web address'],
    ]) {
      const res = cli(...args)
      h.assert(res.code === 1 && res.err.includes(err), `${args.join(' ')}: ${JSON.stringify(res)}`)
    }
    return { tiles: (await h.list(ctx)).tiles.map((x) => `${x.id} ${x.kind} ${x.title}`), hits: s.hits.length }
  } finally {
    await s.close()
  }
}
