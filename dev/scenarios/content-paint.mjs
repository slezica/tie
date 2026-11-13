// A content tile never shows a white first paint: the iframe is invisible until its viewer is
// ready, and the viewer gets the theme in the handshake (TILES.md "Frame host"). Screenshots of
// the tile body at full rate during `tie replace` (typed in the terminal) and `tie add` beside;
// before the fix a whole white frame showed ~150 ms after the command.
import { join } from 'node:path'
import { ROOT } from '../lib.mjs'

export const hiddenWindow = true

export default async (ctx, h) => {
  const md = join(ROOT, 'dev/samples/markdown.md')
  const white = ([r, g, b]) => r > 235 && g > 235 && b > 235
  // Screenshots of `rect`'s body (below the title + nav bar) until `until` resolves, then a few
  // more: the share of white in the worst one, with its time.
  const watch = async (rect, until) => {
    const clip = { x: rect.x + 8, y: rect.y + 70, width: rect.w - 16, height: rect.h - 80 }
    const t0 = performance.now()
    let worst = { white: 0, at: 0 }
    let done = false
    const end = until().then(() => (done = true))
    let extra = 0
    while (!done || extra++ < 8) {
      const png = await ctx.page.screenshot({ clip, scale: 'css' })
      const w = h.fraction(h.pixels(png), white)
      if (w > worst.white) worst = { white: w, at: Math.round(performance.now() - t0) }
    }
    await end
    return worst
  }
  const rendered = (id) => h.waitFor(ctx, async () => (await h.mdState(ctx, id).catch(() => null))?.renders > 0, `${id} rendered`)
  const kinds = async () => (await h.list(ctx)).tiles.filter((t) => t.kind === 'markdown').map((t) => t.id)

  // tie replace, typed in the terminal: its slot, same rect.
  const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
  await h.waitShell(ctx, t0)
  const r = await h.rectOf(ctx, t0)
  await ctx.page.keyboard.type(`tie replace ${md}\n`)
  let worst = await watch(r, async () => rendered((await h.waitFor(ctx, async () => (await kinds())[0], 'markdown tile'))))
  h.assert(worst.white < 0.05, `replace: no white frame (worst ${(worst.white * 100).toFixed(0)}% at ${worst.at} ms)`)
  const [m] = await kinds()
  await ctx.shot('replaced')

  // tie add beside: the new half.
  const rm = await h.rectOf(ctx, m)
  const p = ctx.tie('add', md, '--at', m, '--side', 'r')
  worst = await watch({ x: rm.x + rm.w / 2, y: rm.y, w: rm.w / 2, h: rm.h }, async () => rendered((await p).id))
  h.assert(worst.white < 0.05, `add: no white frame (worst ${(worst.white * 100).toFixed(0)}% at ${worst.at} ms)`)
  await ctx.shot('added')
}
