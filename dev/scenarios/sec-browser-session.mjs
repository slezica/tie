// Security: browser tiles (<webview> guests), session. Permissions denied in the guest (browser
// partition); the UI session has no network while the guest does; a crash is an error, the rest keeps
// working. The macOS microphone check (TCC) can hang getUserMedia: HARNESS.md "macOS permission prompts".
// Hidden window (as every sec-browser-*).
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { rpc } from '../lib.mjs'

export const hiddenWindow = true

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font: 16px sans-serif">${body}
<script>window.__seen = { tie: typeof window.tie, process: typeof process, require: typeof require, module: typeof module, electron: typeof window.electron }</script></body></html>`

export default async (ctx, h) => {
  const s = await h.site(ctx, (path) => page(path === '/' ? 'Main' : 'Other', path))
  const dir = join(process.cwd(), 'tmp', `sec-browser-session-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>local</title><p>local secret</p>')
  try {
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const p = (await ctx.tie('add', s.url + '/', '--at', t0, '--side', 'r')).id
    const g = await h.guestPage(ctx, p)
    const html = (await ctx.tie('add', join(dir, 'index.html'), '--at', t0, '--side', 'b')).id
    await h.htmlFrame(ctx, html)

    // Permissions: denied in the guest (browser partition).
    const perms = await g.evaluate(async () => {
      const q = async (name) => (await navigator.permissions.query({ name }).catch((e) => ({ state: 'error ' + e.message }))).state
      // A granted permission may never answer (geolocation waits for a fix): bounded, so a
      // regression fails naming the permission, not at the 180 s scenario timeout.
      const bounded = (p) => Promise.race([p, new Promise((ok) => setTimeout(() => ok('hung (not denied)'), 5000))])
      return {
        notifyRequest: await bounded(Notification.requestPermission()),
        notifications: await q('notifications'),
        geolocation: await bounded(new Promise((ok) => navigator.geolocation.getCurrentPosition(() => ok('granted'), (e) => ok(e.code === 1 ? 'denied' : 'error ' + e.code), { timeout: 4000 }))),
        // macOS asks the system mic permission before the site one; an unanswered prompt (new
        // Tie.app cdhash after `tie-dev install`: the old TCC record no longer matches) blocks
        // getUserMedia for good. Bounded so the run fails with the reason, not the 180 s timeout.
        media: await Promise.race([
          navigator.mediaDevices.getUserMedia({ audio: true }).then(() => 'granted', (e) => 'denied ' + e.name),
          new Promise((ok) => setTimeout(() => ok('hung: system mic prompt pending (TCC); deny it once after a reinstall, HARNESS.md'), 5000)),
        ]),
        clipboardRead: await bounded(navigator.clipboard.readText().then(() => 'granted', (e) => 'denied ' + e.name)),
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
    await ctx.shot('sec-browser-session')
    return { perms, proxy }
  } finally {
    await s.close()
    rmSync(dir, { recursive: true, force: true })
  }
}
