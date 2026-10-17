// Spike S4 (P0, viewers plan): <webview> in a tile (TIE_SPIKE=webview: webviewTag on, attach with
// rebuilt prefs, partition persist:browser). Loads under the shell CSP? Guest bridge, harness reach
// (CDP), input (before-input-event), focus, layering (menu over it), pointer shield, partition
// persistence, crash events. Hidden window: real input routing.
import { createServer } from 'node:http'
import { inflateSync } from 'node:zlib'
import { rpc } from '../lib.mjs'

export const env = { TIE_SPIKE: 'webview' }
export const hiddenWindow = true

// Local site for guests: red page (layering pixels), a text field, popup triggers, storage.
export async function site() {
  const hits = []
  const page = (q) => `<!doctype html><title>guest</title><style>html,body{margin:0;height:100%;background:#ff0000}</style>
<input id="in" style="margin:20px"><button id="pop" onclick="window.open('/popup-click')" style="margin:20px">pop</button>
<a id="blank" href="/popup-blank" target="_blank" style="margin:20px">blank</a>
<script>
window.__seen = { keys: '', storage: localStorage.getItem('k'), cookie: document.cookie, tie: typeof window.tie, process: typeof process }
localStorage.setItem('k', 'v'); document.cookie = 'c=1; max-age=3600'
addEventListener('keydown', (e) => (window.__seen.keys += e.key))
${q.includes('auto') ? "setTimeout(() => window.open('/popup-auto'), 300)" : ''}
</script>`
  const srv = createServer((req, res) => {
    hits.push(req.url)
    res.setHeader('content-type', 'text/html')
    res.end(page(req.url))
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${srv.address().port}`, hits, close: () => new Promise((r) => srv.close(r)) }
}

// A <webview> filling a tile's body (shell side = harness). Events recorded on window.__wv.
export async function webview(ctx, id, src) {
  await ctx.page.evaluate(
    ({ id, src }) => {
      window.__wv = { events: [] }
      const body = document.querySelector(`.tile[data-id="${id}"] .body`)
      const wv = document.createElement('webview')
      wv.setAttribute('partition', 'persist:browser')
      wv.setAttribute('src', src)
      Object.assign(wv.style, { position: 'absolute', inset: '0', zIndex: 2 })
      for (const ev of ['did-attach', 'dom-ready', 'did-fail-load', 'render-process-gone', 'crashed', 'focus', 'blur', 'page-title-updated', 'unresponsive'])
        wv.addEventListener(ev, (e) => window.__wv.events.push(ev + (e.reason ? ':' + e.reason : '') + (e.errorCode ? ':' + e.errorCode : '')))
      body.append(wv)
    },
    { id, src },
  )
  await ctx.sleep(1500)
}

export const guest = (ctx) => rpc(ctx.instance, 'spike', { action: 'guest' })

// One screen pixel (CSS px) of the window, as [r, g, b].
async function pixel(ctx, x, y) {
  const png = await ctx.page.screenshot({ clip: { x, y, width: 1, height: 1 }, scale: 'css' })
  let i = 8
  let w = 0
  let type = 0
  const idat = []
  while (i < png.length) {
    const len = png.readUInt32BE(i)
    const t = png.toString('ascii', i + 4, i + 8)
    const d = png.subarray(i + 8, i + 8 + len)
    if (t === 'IHDR') (w = d.readUInt32BE(0)), (type = d[9])
    if (t === 'IDAT') idat.push(d)
    i += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const bpp = type === 6 ? 4 : 3
  void w
  return [raw[1], raw[2], raw[3]].slice(0, bpp >= 3 ? 3 : 1) // first pixel of row 0 (filter byte first; 1px wide: no filter deps)
}

export default async (ctx, h) => {
  const s = await site()
  try {
    const page = ctx.page
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const t1 = (await ctx.tie('open', 'terminal', '--at', t0, '--side', 'r')).id
    await ctx.sleep(500)
    await webview(ctx, t1, s.url + '/a')
    const facts = {}
    facts.attached = /\[spike\] webview attach/.test(ctx.appLog())
    facts.blocked = /\[security\] blocked webview/.test(ctx.appLog())
    facts.events = await page.evaluate(() => window.__wv.events)
    facts.hits = [...s.hits]
    facts.guest = await guest(ctx)

    // Harness reach: is the guest a Playwright page / frame? A CDP target?
    const pages = page.context().browser().contexts().flatMap((c) => c.pages()).map((p) => p.url())
    const frames = page.frames().map((f) => f.url())
    const cdp = await page.context().browser().newBrowserCDPSession()
    const targets = (await cdp.send('Target.getTargets')).targetInfos.map((t) => `${t.type} ${t.url}`)
    facts.reach = { pages, frames, targets }
    const gp = page.context().browser().contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith(s.url))
    facts.guestRealm = gp ? await gp.evaluate(() => window.__seen) : null

    // Layering: the tile menu (shell DOM, over the body) paints over the guest.
    const r = await h.rectOf(ctx, t1)
    const inGuest = { x: r.x + r.w / 2, y: r.y + r.h / 2 }
    facts.pixelGuest = await pixel(ctx, inGuest.x, inGuest.y)
    await page.mouse.click(r.x + 60, r.y + 15, { button: 'right' })
    await ctx.sleep(300)
    const m = await h.boxOf(ctx, '.menu')
    facts.menuOverGuest = m.box.y + m.box.height > r.y + 40
    facts.pixelMenu = await pixel(ctx, m.x, m.box.y + m.box.height - 4)
    await page.keyboard.press('Escape')
    await ctx.sleep(200)

    // Focus: a real click in the guest while another tile is active.
    await ctx.tie('focus', t0)
    await ctx.sleep(200)
    await page.evaluate(() => {
      window.__blur = 0
      window.__pdIn = 0
      addEventListener('blur', () => window.__blur++)
      addEventListener('pointerdown', () => window.__pdIn++, true)
    })
    await page.mouse.click(r.x + 40, r.y + 50) // the text field
    await ctx.sleep(400)
    facts.focus = {
      shellBlur: await page.evaluate(() => window.__blur),
      shellPointerdown: await page.evaluate(() => window.__pdIn),
      activeElement: await page.evaluate(() => document.activeElement?.tagName),
      tileActive: (await h.list(ctx)).active === t1,
      guestFocused: (await guest(ctx))?.focused,
      wvEvents: await page.evaluate(() => window.__wv.events),
    }

    // Keys with the guest focused: CDP typing, main's sendInputEvent on the shell (h.press), and on
    // the guest (spike guest-key). Which before-input-event fires, where do keys land?
    const mark = ctx.appLog().length
    await page.keyboard.type('ab')
    await h.press(ctx, 'Meta+t') // a shortcut: new tab if the shell's before-input-event sees it
    await ctx.sleep(300)
    await rpc(ctx.instance, 'spike', { action: 'guest-key' })
    await ctx.sleep(300)
    const after = ctx.appLog().slice(mark)
    facts.keys = {
      guestGot: gp ? await gp.evaluate(() => window.__seen.keys) : null,
      shellShortcut: /\[keys\] new-tab/.test(after),
      tabs: (await h.list(ctx)).tabs.length,
      guestBeforeInput: (after.match(/guest before-input-event \S+ \S+/g) ?? []).join(' | '),
    }
    // Back to the first tab (cmd+T may have switched).
    await page.click(`.tab[data-space="${(await h.list(ctx)).tabs[0].id}"]`)
    await ctx.sleep(300)

    // Pointer shield: pointer-events none on the webview lets the shell get the pointer.
    await page.evaluate(() => {
      window.__pd = null
      document.addEventListener('pointerdown', (e) => (window.__pd = e.target.className || e.target.tagName), { capture: true, once: true })
      document.querySelector('webview').style.pointerEvents = 'none'
    })
    await page.mouse.click(inGuest.x, inGuest.y)
    await ctx.sleep(200)
    facts.shieldTarget = await page.evaluate(() => window.__pd)
    await page.evaluate(() => (document.querySelector('webview').style.pointerEvents = ''))

    // Partition persistence: a new webview (same partition) sees the first one's storage.
    await page.evaluate(() => document.querySelector('webview').remove())
    await ctx.sleep(300)
    await webview(ctx, t1, s.url + '/b')
    const gp2 = page.context().browser().contexts().flatMap((c) => c.pages()).find((p) => p.url() === s.url + '/b')
    facts.persist = gp2 ? await gp2.evaluate(() => window.__seen) : null
    facts.partitionPath = (await guest(ctx))?.partition

    // Crash: main kills the guest's renderer; who hears it?
    await rpc(ctx.instance, 'spike', { action: 'crash-guest' })
    await ctx.sleep(800)
    facts.crash = { wvEvents: await page.evaluate(() => window.__wv.events), main: /guest render-process-gone \S+/.exec(ctx.appLog())?.[0] ?? null, shellAlive: (await h.list(ctx)).tiles.length }
    await ctx.shot('webview')
    ctx.log(JSON.stringify(facts, null, 2))

    h.assert(facts.attached && !facts.blocked && facts.hits.length > 0, 'webview attaches and loads (shell CSP frame-src does not stop it)')
    h.assert(facts.guestRealm === null || (facts.guestRealm.tie === 'undefined' && facts.guestRealm.process === 'undefined'), 'guest has no bridge')
    h.assert(facts.focus.shellBlur === 1 && facts.focus.shellPointerdown === 0 && facts.focus.activeElement === 'WEBVIEW' && !facts.focus.tileActive, `click in guest: shell blur, no pointerdown, activeElement WEBVIEW, tile not activated (initFrames is iframe-only) ${JSON.stringify(facts.focus)}`)
    h.assert(facts.reach.targets.some((t) => t.startsWith('webview ')) && facts.guestRealm, 'harness: guest is a CDP webview target and a Playwright page')
    h.assert(facts.keys.guestGot === 'k' && facts.keys.guestBeforeInput.includes('keyDown k') && facts.keys.shellShortcut, 'keys: guest.sendInputEvent → guest before-input-event; shell sendInputEvent → shell keymap; CDP keys miss the guest')
    h.assert(facts.shieldTarget && facts.shieldTarget !== 'WEBVIEW', 'pointer-events none on the webview: shell gets the pointer')
    h.assert(facts.persist?.storage === 'v' && facts.persist?.cookie === 'c=1' && /Partitions\/browser$/.test(facts.partitionPath), 'partition persists (storage, cookies, on disk)')
    h.assert(facts.crash.wvEvents.includes('render-process-gone') && facts.crash.main && facts.crash.shellAlive === 2, 'crash: webview DOM event + main event; shell fine')
    h.assert(facts.pixelMenu[0] < 200, `menu paints over the guest (${facts.pixelMenu} vs guest ${facts.pixelGuest})`)
    return facts
  } finally {
    await s.close()
  }
}
