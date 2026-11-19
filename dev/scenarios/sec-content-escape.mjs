// Security: script inside a content frame (probe kind) can't reach the UI, the network, other
// tiles, or the OS; its requests are typed and checked. The frame runs in its own process.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export default async (ctx, h) => {
  const p = await h.probe(ctx)
  const root = join(process.cwd(), 'tmp', `escape-${process.pid}`)
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'evil.js'), 'window.__rootScript = 1')
  writeFileSync(join(root, 'pic.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>')
  try {
    const home = await h.uiUrl(ctx)
    const a = (await ctx.tie('add', 'probe', '--root', root)).id
    const b = (await ctx.tie('add', 'probe', '--root', root)).id
    const fa = await h.contentFrame(ctx, a)
    const fb = await h.contentFrame(ctx, b)
    const tokenOf = (f) => new URL(f.url()).host

    // Own process, opaque origin.
    const content = (await h.frames(ctx)).filter((f) => f.url.startsWith('tie-content://'))
    h.assert(content.length === 2 && content.every((f) => f.outOfProcess && f.origin === 'null'), `frames out-of-process, opaque: ${JSON.stringify(content)}`)

    // The UI realm: no bridge here, parent/top not scriptable, no storage.
    const realm = await fa.evaluate(() => {
      const t = (fn) => {
        try {
          return String(fn())
        } catch (e) {
          return 'threw ' + e.name
        }
      }
      return { tie: typeof window.tie, parentTie: t(() => parent.tie), topDoc: t(() => top.document), storage: t(() => localStorage.length), cookie: t(() => document.cookie) }
    })
    h.assert(realm.tie === 'undefined' && /^threw/.test(realm.parentTie) && /^threw/.test(realm.topDoc), `UI unreachable: ${JSON.stringify(realm)}`)
    h.assert(/^threw/.test(realm.storage) && /^threw/.test(realm.cookie), `no storage: ${JSON.stringify(realm)}`)

    // Top navigation, popups: refused inside the frame by its sandbox (no allow-top-navigation, no
    // allow-popups: SecurityError, window.open → null), so main's guard is never even asked (a
    // sandbox that let them through would show as its `blocked navigation main` / `blocked
    // window.open` lines).
    const esc = await fa.evaluate((u) => {
      const r = {}
      try {
        top.location.href = u + '/top'
        r.top = 'no throw'
      } catch (e) {
        r.top = 'threw ' + e.name
      }
      try {
        r.open = String(window.open(u + '/open'))
      } catch (e) {
        r.open = 'threw ' + e.name
      }
      const l = Object.assign(document.createElement('a'), { href: u + '/blank', target: '_blank' })
      document.body.append(l)
      l.click()
      return r
    }, p.url)
    h.assert(esc.top === 'threw SecurityError' && esc.open === 'null', `sandbox refuses top navigation / popups: ${JSON.stringify(esc)}`)
    await p.assertUntouched('top navigation / popups')
    h.assert(!/blocked window\.open|blocked navigation main/.test(ctx.appLog()), 'refused in the frame: main never asked')
    h.assert((await h.uiUrl(ctx)) === home, 'UI stayed')

    // Network out: fetch, image, script, style; injected scripts (inline, from the root) don't run.
    // The viewer CSP refuses each (violation events, recorded in the frame); the probe can't see a
    // hit either way (UI session: dead proxy), so it checks only that second layer.
    await h.recordViolations(fa)
    await fa.evaluate(
      ({ u, token }) => {
        fetch(u + '/fetch').catch(() => {})
        new Image().src = u + '/img'
        const add = (tag, props) => document.body.append(Object.assign(document.createElement(tag), props))
        add('script', { src: u + '/script.js' })
        add('link', { rel: 'stylesheet', href: u + '/style.css' })
        add('script', { textContent: 'window.__inline = 1' })
        add('script', { src: `tie-content://${token}/evil.js` })
        document.body.insertAdjacentHTML('beforeend', '<img src=x onerror="window.__handler = 1">')
      },
      { u: p.url, token: tokenOf(fa) },
    )
    const v = await h.eventually(ctx, async () => {
      const v = await h.violations(fa)
      for (const [dir, what] of [['connect-src', `${p.url}/fetch`], ['img-src', `${p.url}/img`], ['script-src-elem', `${p.url}/script.js`], ['style-src-elem', `${p.url}/style.css`], ['script-src-elem', 'inline'], ['script-src-elem', 'tie-content'] /* the root's evil.js: an opaque frame's report names the scheme only */, ['script-src-attr', 'inline']])
        h.assert(v.includes(`${dir} ${what}`), `viewer CSP refused ${dir} ${what}: ${JSON.stringify(v)}`)
      return v
    })
    ctx.log('CSP violations:', JSON.stringify(v))
    await p.assertUntouched('network from content')
    const ran = await fa.evaluate(() => [window.__inline, window.__rootScript, window.__handler])
    h.assert(ran.every((x) => x === undefined), `injected scripts ran: ${ran}`)

    // Images: own token yes, another tile's token no.
    const img = (f, src) => f.evaluate((src) => new Promise((r) => Object.assign(new Image(), { onload: () => r('load'), onerror: () => r('error'), src })), src)
    h.assert((await img(fa, `tie-content://${tokenOf(fa)}/pic.svg`)) === 'load', 'own image loads')
    h.assert((await img(fa, `tie-content://${tokenOf(fb)}/pic.svg`)) === 'error', "another tile's token refused")

    // Gesture verbs (openLink) need the frame focused: script posting without a user click gets nothing.
    await fa.evaluate((u) => window.probe.port.postMessage({ verb: 'openLink', url: u + '/nofocus' }), p.url)
    await h.waitFor(ctx, async () => /refused request without focus t[a-z2-9]+ openLink/.test(ctx.appLog()), 'openLink refusal logged').catch(() => {})
    h.assert(/refused request without focus t[a-z2-9]+ openLink/.test(ctx.appLog()) && !ctx.appLog().includes(`${p.url}/nofocus`), 'openLink without focus refused')
    // Focus the frame (as a click in it would), for the request checks below.
    await ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] iframe`).focus(), a)

    // Requests: only typed verbs; openLink only http(s) (main decides); junk dropped.
    await fa.evaluate((u) => {
      const port = window.probe.port
      for (const url of ['file:///etc/hosts', 'smb://host/share', 'javascript:alert(1)', 'x-app://run?cmd=id', u + '/link']) port.postMessage({ verb: 'openLink', url })
      for (const m of [{ verb: 'spawn', cmd: 'id' }, { verb: 'openLink', url: u + '/extra', cmd: 'id' }, 'openLink', null, [1], { verb: 'openLink', url: 42 }]) port.postMessage(m)
      // Not the port: the UI listens for no window messages.
      parent.postMessage({ type: 'tie:init' }, '*')
      parent.postMessage({ verb: 'openLink', url: u + '/window-message' }, '*')
    }, p.url)
    // Handled in order: once the last junk message is dropped, everything before it is done.
    const log = await h.eventually(ctx, async () => {
      const log = ctx.appLog()
      for (const u of ['file:///etc/hosts', 'smb://host/share', 'javascript:alert(1)', 'x-app://run?cmd=id']) h.assert(log.includes(`refused external ${u}`), `refused ${u}`)
      h.assert(log.includes(`external open ${p.url}/link`), 'http link goes out (via main)')
      h.assert((log.match(/dropped request/g) ?? []).length >= 6, 'junk requests dropped and logged')
      return log
    })
    h.assert(!log.includes(`external open ${p.url}/extra`), 'extra keys dropped')
    h.assert(!log.includes(`${p.url}/window-message`), 'window messages ignored')
    h.assert((await fa.evaluate(() => window.probe.inits)) === 1, 'one handshake only')

    // Flood: beyond FLOOD_MAX (1000) messages a second from one frame, the rest dropped unparsed
    // (frame.ts onRequest): logged once, far fewer `dropped request` lines than messages sent.
    const N = 5000
    await fa.evaluate((N) => {
      for (let i = 0; i < N; i++) window.probe.port.postMessage({ verb: 'flood', i })
    }, N)
    await h.waitLog(ctx, new RegExp(`\\[security\\] message flood, dropping ${a}`))
    const flooded = () => (ctx.appLog().match(/dropped request t[a-z2-9]+ \{"verb":"flood"/g) ?? []).length
    await ctx.sleep(1100) // the flood window (1 s) rolls over: nothing to wait for
    h.assert(flooded() < N - 1000, `flood: most messages dropped unparsed (${flooded()} of ${N} parsed)`)
    // The frame still talks once the second is over.
    await fa.evaluate(() => window.probe.port.postMessage({ verb: 'after-flood' }))
    await h.waitLog(ctx, /dropped request t[a-z2-9]+ \{"verb":"after-flood"\}/)

    // Still working: probe untouched by link opens (harness records them), app alive.
    await p.assertUntouched('content escape', 300)
    h.assert((await h.list(ctx)).tiles.length === 3, 'app alive')
  } finally {
    await p.close()
    rmSync(root, { recursive: true, force: true })
  }
}
