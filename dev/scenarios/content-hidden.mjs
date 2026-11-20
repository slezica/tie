// A content tile hidden before its handshake ends still loads: a frame that isn't painting gets
// no rAF (Chromium), so the viewer's `ready` also has a timer (runtime.ts READY_FALLBACK_MS, the
// html bootstrap). Before: "Content did not load" after 5 s (docs/2026-11-20-content-did-not-load.md).
// Hidden at the worst time: on the frame's `load` (the host posts the handshake in that event), as
// a tab switch landing there would (display:none, render.ts). A real switch can't be timed.
// A hidden window: `content-hidden-window`.
import { join } from 'node:path'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { ROOT } from '../lib.mjs'

export default async (ctx, h) => {
  const html = join(mkdtempSync(join(tmpdir(), 'tie-hidden-')), 'page.html')
  writeFileSync(html, '<!doctype html><title>hidden</title><p>hello</p>')
  const files = { image: join(ROOT, 'build/icon.png'), markdown: join(ROOT, 'dev/samples/markdown.md'), html }
  await ctx.page.evaluate(() => {
    window.hiddenAtLoad = []
    document.addEventListener(
      'load',
      (e) => {
        const tile = e.target instanceof HTMLIFrameElement && e.target.closest('.tile')
        if (!tile) return
        tile.style.display = 'none'
        window.hiddenAtLoad.push(tile.dataset.id)
      },
      true, // `load` doesn't bubble
    )
  })
  const state = (id) =>
    ctx.page.evaluate((id) => {
      const t = document.querySelector(`.tile[data-id="${id}"]`)
      return { hidden: window.hiddenAtLoad.includes(id) && getComputedStyle(t).display === 'none', text: t.textContent, loading: !!t.querySelector('iframe.loading'), frame: !!t.querySelector('iframe.content') }
    }, id)
  for (const [kind, file] of Object.entries(files)) {
    const id = (await ctx.tie('add', file, '--float')).id // floating: no other tile's render un-hides it
    await h.eventually(ctx, async () => h.assert((await state(id)).hidden, `${kind}: hidden at load`))
    await h.eventually(ctx, async () => {
      const s = await state(id)
      h.assert(s.frame && !s.loading, `${kind}: ready while hidden`)
    })
    await ctx.sleep(5500) // nothing happens: past the host's READY_MS (5 s), no failure
    const s = await state(id)
    h.assert(s.hidden && s.frame && !s.text.includes('Content did not load'), `${kind}: no load error after 5 s hidden`)
  }
}
