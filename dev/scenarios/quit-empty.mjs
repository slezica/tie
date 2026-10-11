// ⌘Q with no tiles open anywhere: quits immediately.
import { existsSync } from 'node:fs'
import { infoPath } from '../lib.mjs'

export default async (ctx, h) => {
  for (const t of (await h.list(ctx)).tiles) await ctx.tie('close', t.id)
  await ctx.sleep(200)
  await ctx.page.keyboard.down('Meta')
  await ctx.page.keyboard.press('q').catch(() => {}) // page may already be gone
  await ctx.page.keyboard.up('Meta').catch(() => {})
  for (let i = 0; i < 20 && existsSync(infoPath(ctx.instance)); i++) await ctx.sleep(100)
  h.assert(!existsSync(infoPath(ctx.instance)), 'quit right away')
}
