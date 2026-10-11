// ⌘Q with no tiles open anywhere: no hold needed; quits on release.
import { existsSync } from 'node:fs'
import { infoPath } from '../lib.mjs'

export default async (ctx, h) => {
  for (const t of (await h.list(ctx)).tiles) await ctx.tie('close', t.id)
  await ctx.sleep(200)
  await ctx.page.keyboard.down('Meta')
  await ctx.page.keyboard.down('q')
  await ctx.sleep(300)
  h.assert(existsSync(infoPath(ctx.instance)), 'waits for release')
  await ctx.page.keyboard.up('q').catch(() => {}) // page may already be gone
  for (let i = 0; i < 20 && existsSync(infoPath(ctx.instance)); i++) await ctx.sleep(100)
  h.assert(!existsSync(infoPath(ctx.instance)), 'quit on release')
}
