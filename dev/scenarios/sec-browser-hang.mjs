// Security: a hung browser page (guest busy forever) → main's `unresponsive` → the tile shows "Page
// stopped responding", the guest's renderer is killed, the UI and other tiles keep working.
// Chromium reports a hang only for an input event left unanswered for 15 s (desktop
// kHungRendererDelay), and never for a webContents with a debugger attached (WebContentsImpl::
// ShouldIgnoreUnresponsiveRenderer): Playwright auto-attaches to guests, so the hang runs with
// Playwright detached (socket only), the click sent by main (h.guestClick; a key needs the guest
// focused). ENGINE.md "unresponsive".
// Hidden window: a visible widget (hidden ones never report hangs).
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const hiddenWindow = true

export default async (ctx, h) => {
  // A click starts a busy loop in the page: the mouse event's ack never comes back. The page reports
  // its first painted frame (input before it is dropped: paint holding) and the click (`/down`).
  const hang = `<!doctype html><title>Hang</title><p>hang</p><script>
requestAnimationFrame(() => requestAnimationFrame(() => fetch('/painted')))
addEventListener('mousedown', () => { fetch('/down'); for (;;) {} })</script>`
  const s = await h.site(ctx, (path) => (path === '/' ? hang : path === '/fine' ? '<!doctype html><title>Fine</title><p>fine</p>' : ''))
  const dir = join(process.cwd(), 'tmp', `sec-browser-hang-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>local</title><p>local</p>')
  try {
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const html = (await ctx.tie('add', join(dir, 'index.html'), '--at', t0, '--side', 'b')).id
    await h.htmlFrame(ctx, html)
    const p = (await ctx.tie('add', s.url + '/', '--at', t0, '--side', 'r')).id
    const gid = (await h.waitTile(ctx, p, (t) => t.web?.ready && t.web.title === 'Hang', 'guest loaded', 8000)).web.guest

    await ctx.detach() // a debugger on the guest suppresses hang reports
    await h.waitFor(ctx, () => s.hits.includes('/painted'), 'guest painted', 8000)
    // A click lost anyway (no `/down`) is sent again.
    await h.waitFor(ctx, async () => s.hits.includes('/down') || (await h.guestClick(ctx, p, 20, 20), h.waitFor(ctx, () => s.hits.includes('/down'), 'click', 1000).catch(() => false)), 'the page took the click', 8000)
    await h.waitTile(ctx, p, (t) => t.error === 'Page stopped responding', 'hang → error', 40000)
    await h.waitLog(ctx, new RegExp(`\\[guest\\] gone ${gid} killed`)) // main killed the renderer
    h.assert(ctx.appLog().includes(`[guest] unresponsive ${gid}`), 'main saw unresponsive')
    await ctx.attach()

    h.assert(!(await ctx.page.$(`.tile[data-id="${p}"] webview`)), 'hung guest removed')
    h.assert((await h.tileOf(ctx, html)).page.ready && !(await h.tileOf(ctx, html)).error, 'html tile fine')
    await ctx.tie('focus', '--tile', t0)
    await h.waitFor(ctx, async () => (await h.focused(ctx)) === t0, 'terminal focused')
    await ctx.page.keyboard.type('echo after-hang')
    await h.waitText(ctx, t0, 'after-hang')
    const other = (await ctx.tie('add', s.url + '/fine', '--at', t0, '--side', 'r')).id
    await h.waitTile(ctx, other, (t) => t.web?.ready && t.web.title === 'Fine' && !t.error, 'a new browser tile loads', 8000)
    await ctx.shot('sec-browser-hang')
  } finally {
    await s.close()
    rmSync(dir, { recursive: true, force: true })
  }
}
