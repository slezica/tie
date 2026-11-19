// Security: browser tiles (<webview> guests), realm and navigation. Guest realm has no bridge, browser
// partition; user agent without Electron; can't load tie:, tie-content:, file:, chrome: (navigation,
// subframes, subresources; redirects: Chromium refuses them before Tie's guard); the UI's own loads are
// stopped too; attach rebuilds prefs whatever the tag asks (preload, nodeintegration, partition...; web
// security stays on), refuses bad src and content frames. Hidden window (as every sec-browser-*).
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { rpc } from '../lib.mjs'

export const hiddenWindow = true

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font: 16px sans-serif">${body}
<script>window.__seen = { tie: typeof window.tie, process: typeof process, require: typeof require, module: typeof module, electron: typeof window.electron }</script></body></html>`

export default async (ctx, h) => {
  const agents = new Set() // User-Agent headers the site saw
  const s = await h.site(ctx, (path, req) => {
    agents.add(req.headers['user-agent'])
    const p = path.split('?')[0]
    if (p === '/redir-file') return { status: 302, headers: { location: 'file:///etc/hosts' } }
    if (p === '/redir-tie') return { status: 302, headers: { location: 'tie://app/index.html' } }
    if (p === '/frames') return page('Frames', '<iframe id="f1" src="file:///etc/hosts"></iframe><iframe id="f2" src="tie://app/index.html"></iframe><iframe id="f3" src="data:text/html,ok"></iframe>')
    if (p === '/same') return 'same-origin'
    return page(p === '/' ? 'Main' : 'Other', p)
  })
  const dir = join(process.cwd(), 'tmp', `sec-browser-nav-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>local</title><p>local secret</p>')
  const guests = () => rpc(ctx.instance, 'guest', { action: 'list' })
  const log = () => ctx.appLog()
  try {
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const b = (await ctx.tie('add', s.url + '/', '--at', t0, '--side', 'r')).id
    let g = await h.guestPage(ctx, b)

    // Guest realm: no bridge, no Node.
    const seen = await g.evaluate(() => window.__seen)
    h.assert(Object.values(seen).every((v) => v === 'undefined'), `guest realm: ${JSON.stringify(seen)}`)
    const gl = (await guests()).find((x) => x.url === s.url + '/')
    h.assert(/Partitions\/browser$/.test(gl.partition), `browser partition: ${gl.partition}`)
    // User agent: Electron's (and Tie's) name taken out (initBrowserSession): main's view, the
    // page's and the header the site got.
    const uas = [gl.userAgent, await g.evaluate(() => navigator.userAgent), ...agents]
    h.assert(uas.every((u) => u && /Chrome\//.test(u) && !/Electron|Tie\//.test(u)), `user agent: ${JSON.stringify([...new Set(uas)])}`)

    // Page-initiated navigation away to local schemes: refused, the page stays.
    const html = (await ctx.tie('add', join(dir, 'index.html'), '--at', t0, '--side', 'b')).id
    await h.htmlFrame(ctx, html)
    const tokenUrl = (await h.tileOf(ctx, html)).page.url
    for (const u of ['file:///etc/hosts', 'tie://app/index.html', tokenUrl, 'chrome://gpu', 'devtools://devtools/bundled/inspector.html']) {
      await g.evaluate((u) => (location.href = u), u).catch(() => {})
      // absence: the page stays (refusals of Tie's guard are logged: done early; Chromium's own aren't)
      await h.waitFor(ctx, async () => log().includes(`blocked guest navigation main ${u}`), `refusal of ${u} logged`, 500).catch(() => {})
      g = await h.guestPage(ctx, b)
      h.assert(g.url() === s.url + '/' && (await h.tileOf(ctx, b)).web.url === s.url + '/', `navigation to ${u} refused (now ${g.url()})`)
    }
    h.assert(/blocked guest navigation main tie:\/\/app/.test(log()) && /blocked guest navigation main tie-content:/.test(log()), 'guard logged tie: / tie-content: refusals')
    // Redirects to local schemes: never followed. Chromium refuses these (unsafe redirect) before
    // any will-redirect: Tie's redirect guard (guest.ts) is never reached here (tried: file:, tie:,
    // mailto:, custom, data:, about:, javascript:, chrome:; none logged `blocked guest redirect`).
    // Defense in depth, unreachable from the harness: this checks Chromium's layer.
    for (const r of ['/redir-file', '/redir-tie']) {
      await g.evaluate((r) => (location.href = r), r).catch(() => {})
      await ctx.sleep(700) // absence: never followed (Chromium refuses these itself: nothing to wait for)
      const now = (await guests()).map((x) => x.url)
      h.assert(now.every((u) => !/^(file|tie|tie-content):/.test(u)) && (await h.tileOf(ctx, b)).web.url === s.url + '/', `redirect ${r}: ${now}`)
    }
    await ctx.tie('close', '--tile', b)
    const b2 = (await ctx.tie('add', s.url + '/frames', '--at', t0, '--side', 'r')).id
    g = await h.guestPage(ctx, b2)
    // Subresources and fetches of local schemes: fail (no handlers on the browser partition; file:
    // never from http).
    const reads = await g.evaluate(async (tokenUrl) => {
      const f = (u) => fetch(u).then((r) => r.text().then((t) => 'read ' + t.slice(0, 20)), (e) => 'failed')
      const img = (u) => new Promise((ok) => Object.assign(new Image(), { onload: () => ok('loaded'), onerror: () => ok('failed'), src: u }))
      return { fetchFile: await f('file:///etc/hosts'), fetchTie: await f('tie://app/index.html'), fetchToken: await f(tokenUrl), imgTie: await img('tie://app/icon.png'), imgToken: await img(tokenUrl) }
    }, tokenUrl)
    h.assert(Object.values(reads).every((v) => v === 'failed'), `local reads from the guest: ${JSON.stringify(reads)}`)
    // Subframes: tie: refused by the guard (logged); file: refused by Chromium first (never from an
    // http page; not logged); data: allowed (control: the frame URLs come from CDP, not from
    // contentWindow.location, which throws for any cross-origin frame).
    await h.waitLog(ctx, /\[security\] blocked guest navigation subframe tie:\/\/app\/index\.html/)
    const frameUrls = await h.waitFor(ctx, () => { const u = g.frames().map((f) => f.url()); return u.some((x) => x.startsWith('data:')) && u }, 'data: subframe loads')
    h.assert(frameUrls.every((u) => !/^(file|tie|tie-content):/.test(u)), `subframes never load local schemes: ${frameUrls}`)

    // The UI's own loads (src, location bar, back/forward: browser-initiated) are checked too.
    await ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] webview`).loadURL('file:///etc/hosts').catch(() => {}), b2)
    // Settled: the guard stopped it (logged), or the guest shows file: (no guard).
    await h.waitFor(ctx, async () => /stopped guest load file:/.test(log()) || (await guests()).some((x) => x.url.startsWith('file:')), 'loadURL(file:) stopped or loaded')
    await h.eventually(ctx, async () => {
      const after = (await guests()).find((x) => x.url.startsWith('file:') || x.url.startsWith(s.url + '/frames'))
      h.assert(after && !after.url.startsWith('file:'), `shell loadURL(file:) stopped: ${after?.url}`)
    })
    h.assert(/stopped guest load file:/.test(log()), 'stopped load logged')
    await ctx.tie('close', '--tile', b2)

    // Attach guard: hostile attributes are dropped, prefs rebuilt.
    const before = (await guests()).length
    await ctx.page.evaluate(({ src, preload }) => {
      const w = document.createElement('webview')
      for (const [k, v] of Object.entries({ preload, nodeintegration: '', nodeintegrationinsubframes: '', webpreferences: 'nodeIntegration=yes, contextIsolation=no, sandbox=no, webSecurity=no', partition: 'persist:evil', disablewebsecurity: '', allowpopups: '', src }))
        w.setAttribute(k, v)
      w.id = 'hostile'
      w.style.cssText = 'position:fixed;left:0;top:0;width:300px;height:200px'
      document.body.append(w)
    }, { src: s.url + '/?hostile', preload: 'file://' + join(process.cwd(), 'out/preload/index.cjs') })
    await h.waitFor(ctx, async () => (await guests()).some((x) => x.url === s.url + '/?hostile'), 'hostile webview loads')
    const hg = (await guests()).find((x) => x.url === s.url + '/?hostile')
    h.assert(/Partitions\/browser$/.test(hg.partition), `hostile partition ignored: ${hg.partition}`)
    const hp = await h.waitFor(ctx, async () => ctx.page.context().browser().contexts().flatMap((c) => c.pages()).find((p) => p.url() === s.url + '/?hostile'), 'hostile guest page')
    const hseen = await h.waitFor(ctx, () => hp.evaluate(() => window.__seen), 'hostile realm')
    h.assert(Object.values(hseen).every((v) => v === 'undefined'), `hostile attributes: no bridge, no Node ${JSON.stringify(hseen)}`)
    h.assert(/attributes dropped .*preload/.test(log()) && /attributes dropped .*webpreferences/.test(log()), 'attributes dropped (logged)')
    // Web security on: another origin (a second live site, no CORS headers) unreadable; own origin
    // readable (control: a closed port or a dead site would fail either way).
    const s2 = await h.site(ctx, () => 'other-origin')
    try {
      const sop = await hp.evaluate(async (other) => ({
        cross: await fetch(other + '/').then((r) => r.text(), () => 'failed'),
        same: await fetch('/same').then((r) => r.text(), () => 'failed'),
      }), s2.url)
      h.assert(sop.cross === 'failed' && sop.same === 'same-origin', `web security on (no cross-origin read): ${JSON.stringify(sop)}`)
    } finally {
      await s2.close()
    }
    await ctx.page.evaluate(() => document.getElementById('hostile').remove())
    // Bad src: refused at attach.
    for (const src of ['file:///etc/hosts', 'tie://app/index.html', 'javascript:alert(1)']) {
      await ctx.page.evaluate((src) => {
        const w = document.createElement('webview')
        w.setAttribute('src', src)
        w.className = 'bad'
        document.body.append(w)
      }, src)
    }
    await h.eventually(ctx, async () => h.assert((log().match(/blocked webview src/g) ?? []).length >= 3, 'bad src refused at attach'))
    await ctx.page.evaluate(() => document.querySelectorAll('webview.bad').forEach((w) => w.remove()))
    // A content frame can't create guests (no <webview> outside the UI's main frame).
    const probe = (await ctx.tie('add', 'probe')).id
    const pf = await h.contentFrame(ctx, probe)
    const tag = await pf.evaluate((src) => {
      const w = document.createElement('webview')
      w.setAttribute('src', src)
      document.body.append(w)
      return w.constructor.name
    }, s.url + '/?from-frame')
    await ctx.sleep(1000) // absence: no guest, no hit
    h.assert(!(await guests()).some((x) => x.url.includes('from-frame')) && !s.hits.some((x) => x.includes('from-frame')), `content frame: no guest (${tag})`)
    await ctx.tie('close', '--tile', probe)
    h.assert((await guests()).length <= before, 'no guest left behind')
    await ctx.shot('sec-browser-nav')
    return { reads }
  } finally {
    await s.close()
    rmSync(dir, { recursive: true, force: true })
  }
}
