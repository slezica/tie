// A content tile opened while the window is hidden still loads: the real app throttles a hidden
// or covered window (no rAF, timers at most once a second), so the viewer's `ready` also has a
// timer (runtime.ts READY_FALLBACK_MS, the html bootstrap). Before: "Content did not load" after
// 5 s: an agent ran `tie add` while the user was in another app
// (docs/2026-11-20-content-did-not-load.md).
// TIE_THROTTLE + h.hideWindow: throttled and hidden as the real app's window is (harness
// instances otherwise never are); Playwright detached meanwhile (it would keep the page painting).
// A tile hidden mid-handshake in a visible window: `content-hidden`.
import { join } from 'node:path'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { ROOT, rpc } from '../lib.mjs'

export const hiddenWindow = true
export const env = { TIE_THROTTLE: '1' }

export default async (ctx, h) => {
  const html = join(mkdtempSync(join(tmpdir(), 'tie-hidden-')), 'page.html')
  writeFileSync(html, '<!doctype html><title>hidden</title><p>hello</p>')
  const files = { image: join(ROOT, 'build/icon.png'), markdown: join(ROOT, 'dev/samples/markdown.md'), html }
  await h.hideWindow(ctx) // from here: socket only
  const ids = {}
  for (const [kind, file] of Object.entries(files)) ids[kind] = (await ctx.tie('add', file)).id
  await ctx.sleep(6500) // nothing to observe while detached: past the host's READY_MS (5 s)
  const still = await rpc(ctx.instance, 'window-state')
  h.assert(still.visibility === 'hidden' && still.frames === 0, `window stayed hidden, no animation frames: ${JSON.stringify(still)}`)
  await ctx.attach()
  for (const [kind, id] of Object.entries(ids)) {
    const s = await ctx.page.evaluate((id) => {
      const t = document.querySelector(`.tile[data-id="${id}"]`)
      return { error: t.querySelector('.tile-error')?.textContent ?? null, loading: !!t.querySelector('iframe.loading'), frame: !!t.querySelector('iframe.content') }
    }, id)
    h.assert(s.error === null, `${kind}: no error after 5 s in a hidden window (${s.error})`)
    h.assert(s.frame && !s.loading, `${kind}: ready in a hidden window`)
  }
}
