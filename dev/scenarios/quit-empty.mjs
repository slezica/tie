// ⌘Q with no tiles open anywhere: no hold needed; quits on release.
// Closing the last tile replaces the tab with a fresh terminal (TABS.md), so no tiles = the loop
// guard: a shell that exits at once (`true`) gets one replacement, then the tab stays empty.
import { existsSync } from 'node:fs'
import { infoPath } from '../lib.mjs'

export const settings = { shell: 'true' }

export default async (ctx, h) => {
  const l = await h.waitFor(ctx, async () => ((await h.list(ctx)).tiles.length === 0 ? h.list(ctx) : null), 'no tiles left')
  h.assert(l.tabs.length === 1, `one (empty) tab: ${JSON.stringify(l.tabs)}`)
  await ctx.sleep(1500)
  h.assert((await h.list(ctx)).tiles.length === 0, 'no replacement loop')
  await h.keyDown(ctx, 'Meta') // through main: ⌘Q is handled in before-input-event
  await h.keyDown(ctx, 'q')
  await ctx.sleep(300)
  h.assert(existsSync(infoPath(ctx.instance)), 'waits for release')
  await h.keyUp(ctx, 'q').catch(() => {}) // app may already be gone
  for (let i = 0; i < 20 && existsSync(infoPath(ctx.instance)); i++) await ctx.sleep(100)
  h.assert(!existsSync(infoPath(ctx.instance)), 'quit on release')
}
