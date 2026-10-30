// Security: browser tiles (<webview> guests). Guest realm has no bridge; can't load tie:,
// tie-content:, file:, chrome: (navigation, redirects, subresources); the UI's own loads are
// stopped too; attach rebuilds prefs whatever the tag asks (preload, nodeintegration, partition...),
// refuses bad src and content frames; popups: blocked without input, system browser right after a
// real click; downloads land in the (harness) downloads folder under a safe unique name; permissions
// denied; the UI session has no network while the guest does; a crash is an error, the rest
// keeps working. Hidden window: real clicks reach the guest.
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { rpc, downloadsPath } from '../lib.mjs'

export const hiddenWindow = true

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font: 16px sans-serif">${body}
<script>window.__seen = { tie: typeof window.tie, process: typeof process, require: typeof require, module: typeof module, electron: typeof window.electron }</script></body></html>`

export default async (ctx, h) => {
  const start = Date.now()
  const s = await h.site(ctx, (path) => {
    const p = path.split('?')[0]
    if (p === '/') return page('Main', `<button id="pop" onclick="window.open('/popup-click')" style="margin:20px">pop</button>
<a id="blank" href="/popup-blank" target="_blank" style="margin:20px">blank</a>
<button id="popfile" onclick="window.open('file:///etc/hosts')" style="margin:20px">popfile</button>
<a id="dl" href="/dl" style="margin:20px">download</a>
<a id="mail" href="mailto:someone@example.com" style="margin:20px">mail</a>
${path.includes('auto') ? "<script>setTimeout(() => window.open('/popup-auto'), 300)</script>" : ''}`)
    if (p === '/autodl') return page('AutoDl', `<script>setTimeout(() => { location.href = '/dl' }, 300)</script>`)
    if (p === '/dl') return { headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="../.evil.sh"' }, body: 'echo pwned\n' }
    if (p === '/redir-file') return { status: 302, headers: { location: 'file:///etc/hosts' } }
    if (p === '/redir-tie') return { status: 302, headers: { location: 'tie://app/index.html' } }
    if (p === '/frames') return page('Frames', '<iframe id="f1" src="file:///etc/hosts"></iframe><iframe id="f2" src="tie://app/index.html"></iframe>')
    return page('Other', p)
  })
  const dir = join(process.cwd(), 'tmp', `sec-browser-${process.pid}`)
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

    // Page-initiated navigation away to local schemes: refused, the page stays.
    const html = (await ctx.tie('add', join(dir, 'index.html'), '--at', t0, '--side', 'b')).id
    await h.htmlFrame(ctx, html)
    const tokenUrl = (await h.tileOf(ctx, html)).page.url
    for (const u of ['file:///etc/hosts', 'tie://app/index.html', tokenUrl, 'chrome://gpu', 'devtools://devtools/bundled/inspector.html']) {
      await g.evaluate((u) => (location.href = u), u).catch(() => {})
      await ctx.sleep(500)
      g = await h.guestPage(ctx, b)
      h.assert(g.url() === s.url + '/' && (await h.tileOf(ctx, b)).web.url === s.url + '/', `navigation to ${u} refused (now ${g.url()})`)
    }
    h.assert(/blocked guest navigation main tie:\/\/app/.test(log()) && /blocked guest navigation main tie-content:/.test(log()), 'guard logged tie: / tie-content: refusals')
    // Redirects to local schemes: never followed.
    for (const r of ['/redir-file', '/redir-tie']) {
      await g.evaluate((r) => (location.href = r), r).catch(() => {})
      await ctx.sleep(700)
      const now = (await guests()).map((x) => x.url)
      h.assert(now.every((u) => !/^(file|tie|tie-content):/.test(u)), `redirect ${r}: ${now}`)
    }
    await ctx.tie('close', b)
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
    const frameUrls = await g.evaluate(() => [...document.querySelectorAll('iframe')].map((f) => { try { return f.contentWindow.location.href } catch { return 'cross-origin' } }))
    h.assert(frameUrls.every((u) => !/^(file|tie):/.test(u)), `subframes never load local schemes: ${frameUrls}`)

    // The UI's own loads (src, location bar, back/forward: browser-initiated) are checked too.
    await ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] webview`).loadURL('file:///etc/hosts').catch(() => {}), b2)
    await ctx.sleep(800)
    const after = (await guests()).find((x) => x.url.startsWith('file:') || x.url.startsWith(s.url + '/frames'))
    h.assert(after && !after.url.startsWith('file:'), `shell loadURL(file:) stopped: ${after?.url}`)
    h.assert(/stopped guest load file:/.test(log()), 'stopped load logged')
    await ctx.tie('close', b2)

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
    const sop = await hp.evaluate(() => fetch('http://127.0.0.1:1/').then(() => 'read', () => 'failed'))
    h.assert(sop === 'failed', 'web security on (no cross-origin read)')
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
    await ctx.sleep(800)
    h.assert((log().match(/blocked webview src/g) ?? []).length >= 3, 'bad src refused at attach')
    await ctx.page.evaluate(() => document.querySelectorAll('webview.bad').forEach((w) => w.remove()))
    // A content frame can't create guests (no <webview> outside the UI's main frame).
    const probe = (await ctx.tie('add', 'probe')).id
    const pf = await h.probeFrame(ctx, probe)
    const tag = await pf.evaluate((src) => {
      const w = document.createElement('webview')
      w.setAttribute('src', src)
      document.body.append(w)
      return w.constructor.name
    }, s.url + '/?from-frame')
    await ctx.sleep(1000)
    h.assert(!(await guests()).some((x) => x.url.includes('from-frame')) && !s.hits.some((x) => x.includes('from-frame')), `content frame: no guest (${tag})`)
    await ctx.tie('close', probe)
    h.assert((await guests()).length <= before, 'no guest left behind')

    // Popups: never a window, never loaded by Tie; http(s) ones are links out: the confirm dialog
    // (Cancel → nothing, Open → system browser, harness logs); non-http → blocked even with a click.
    // A script's popup without a gesture gets the same dialog (Electron has no popup blocker).
    const p = (await ctx.tie('add', s.url + '/?auto', '--at', t0, '--side', 'r')).id
    g = await h.guestPage(ctx, p)
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.external-open'), 'script popup without a gesture: the dialog')
    h.assert((await ctx.page.textContent('.dialog.external-open .url')) === `${s.url}/popup-auto` && !s.hits.includes('/popup-auto'), 'nothing loaded, URL shown')
    await ctx.page.click('.dialog .cancel')
    await ctx.sleep(300)
    h.assert(!log().includes('external open'), 'Cancel: nothing opened')
    const wv = await ctx.page.locator(`.tile[data-id="${p}"] webview`).boundingBox()
    const click = async (sel) => {
      const bx = await g.locator(sel).boundingBox()
      await ctx.page.mouse.click(wv.x + bx.x + 5, wv.y + bx.y + bx.height / 2)
      await ctx.sleep(500)
    }
    await click('#pop')
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.external-open'), 'click popup: confirm dialog')
    h.assert((await ctx.page.textContent('.dialog.external-open .url')) === `${s.url}/popup-click` && !log().includes('external open'), 'full URL shown, nothing opened yet')
    await ctx.page.click('.dialog .cancel')
    await ctx.sleep(300)
    h.assert(!log().includes(`external open ${s.url}/popup-click`), 'Cancel: nothing opened')
    const bl = await g.locator('#blank').boundingBox()
    await h.guestClick(ctx, p, bl.x + 5, bl.y + bl.height / 2)
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.external-open'), 'target=_blank: confirm dialog')
    await ctx.page.click('.dialog .confirm')
    await h.waitFor(ctx, async () => log().includes(`external open ${s.url}/popup-blank`), 'Open: system browser (harness: logged)')
    await click('#popfile')
    // (Chromium refuses file: from an http page before the handler: either way, never opened.)
    h.assert(!/external open file:/.test(log()), 'non-http popup never opened, even with a click')
    const d = await g.locator('#dl').boundingBox() // (Playwright waits forever after the refused mailto: navigation)
    await click('#mail')
    h.assert(!/external open mailto:/.test(log()) && (await h.tileOf(ctx, p)).web.url.startsWith(s.url), 'mailto: never opened')
    h.assert(!s.hits.some((x) => x.startsWith('/popup')), `no popup ever loaded: ${s.hits.filter((x) => x.startsWith('/popup'))}`)
    h.assert((await guests()).length === 1, 'no extra guests (windows)')

    // Downloads: harness folder only (fresh instances), safe unique names, never opened.
    if (ctx.instance.startsWith('drive-')) {
      const dl = downloadsPath(ctx.instance)
      const real = join(homedir(), 'Downloads', 'evil.sh')
      const realBefore = existsSync(real) ? statSync(real).mtimeMs : null
      const files = () => (existsSync(dl) ? readdirSync(dl).filter((f) => !f.endsWith('.crdownload')) : [])
      // Every download asks: a dialog with the sanitized name and the site; nothing saved before Save.
      await h.guestClick(ctx, p, d.x + 5, d.y + d.height / 2)
      await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.save-download'), 'download: confirm dialog')
      const dlg = await ctx.page.evaluate(() => ({ name: document.querySelector('.dialog.save-download .url')?.textContent, focus: document.activeElement?.className, text: document.querySelector('.dialog.save-download')?.textContent }))
      h.assert(/evil\.sh/.test(dlg.name ?? '') && !/^\./.test(dlg.name) && /cancel/.test(dlg.focus) && dlg.text.includes('127.0.0.1'), `dialog: ${JSON.stringify(dlg)}`)
      h.assert(files().length === 0, 'nothing saved before Save')
      await ctx.page.click('.dialog .cancel')
      await ctx.sleep(400)
      h.assert(files().length === 0 && !/download completed/.test(log()), 'Cancel: nothing saved')
      await h.guestClick(ctx, p, d.x + 5, d.y + d.height / 2)
      await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.save-download'), 'download: confirm dialog again')
      await ctx.page.click('.dialog .confirm')
      await h.waitFor(ctx, async () => files().length === 1 && /download completed/.test(log()), 'Save: download saved')
      await h.guestClick(ctx, p, d.x + 5, d.y + d.height / 2)
      await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.save-download'), 'third dialog')
      await ctx.page.click('.dialog .confirm')
      await h.waitFor(ctx, async () => files().length === 2, 'second download saved')
      const names = files().sort()
      h.assert(names.every((n) => n.includes('evil') && !n.startsWith('.') && !n.includes('/')) && names.some((n) => n.includes(' (1)')), `safe unique names: ${names}`)
      h.assert(names.every((n) => readFileSync(join(dl, n), 'utf8') === 'echo pwned\n'), 'content saved as is')
      h.assert(!existsSync(join(dl, '..', '.evil.sh')), 'no traversal')
      const realAfter = existsSync(real) ? statSync(real).mtimeMs : null
      h.assert(realAfter === realBefore && !(realAfter && realAfter > start), 'real ~/Downloads untouched')
      // A download a script starts with no input: asks too, saves nothing until you say so.
      const auto = (await ctx.tie('add', s.url + '/autodl', '--at', t0, '--side', 'b')).id
      await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.save-download'), 'script download: asks')
      await ctx.page.click('.dialog .cancel')
      await ctx.sleep(500)
      h.assert(files().length === 2, `nothing saved by it (${files().length} files)`)
      await ctx.tie('close', auto)
    }

    // Permissions: denied in the guest (browser partition).
    const perms = await g.evaluate(async () => {
      const q = async (name) => (await navigator.permissions.query({ name }).catch((e) => ({ state: 'error ' + e.message }))).state
      return {
        notifyRequest: await Notification.requestPermission(),
        notifications: await q('notifications'),
        geolocation: await new Promise((ok) => navigator.geolocation.getCurrentPosition(() => ok('granted'), (e) => ok(e.code === 1 ? 'denied' : 'error ' + e.code))),
        media: await navigator.mediaDevices.getUserMedia({ audio: true }).then(() => 'granted', (e) => 'denied ' + e.name),
        clipboardRead: await navigator.clipboard.readText().then(() => 'granted', (e) => 'denied ' + e.name),
        midi: await q('midi'),
      }
    })
    for (const [k, v] of Object.entries(perms)) h.assert(/^denied/.test(v), `guest permission ${k}: ${v}`)

    // Network: the guest has it (DIRECT), the UI's session doesn't (dead proxy).
    const proxy = await rpc(ctx.instance, 'guest', { action: 'proxy', url: s.url + '/' })
    h.assert(proxy.ui === 'PROXY 127.0.0.1:1' && proxy.browser === 'DIRECT', `proxies: ${JSON.stringify(proxy)}`)

    // Crash: error state; the UI and other tiles keep working.
    await rpc(ctx.instance, 'guest', { action: 'crash', id: (await h.tileOf(ctx, p)).web.guest })
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, p)).error === 'Page crashed', 'crash → error')
    h.assert(!(await ctx.page.$(`.tile[data-id="${p}"] webview`)), 'crashed guest removed')
    const other = (await ctx.tie('add', s.url + '/?after', '--at', t0, '--side', 'r')).id
    await h.guestPage(ctx, other)
    h.assert((await h.tileOf(ctx, html)).page.ready && (await h.list(ctx)).tiles.every((t) => t.id === p || !t.error), 'other tiles fine')
    await ctx.shot('sec-browser')
    return { perms, proxy, reads }
  } finally {
    await s.close()
    rmSync(dir, { recursive: true, force: true })
  }
}
