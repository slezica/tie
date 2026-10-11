// ⌘Q with tiles open: a tap shows "Hold ⌘Q to quit" and doesn't quit; holding ~1s quits.
import { existsSync } from 'node:fs'
import { infoPath } from '../lib.mjs'

export default async (ctx, h) => {
  const kb = ctx.page.keyboard
  await kb.down('Meta')
  await kb.press('q')
  await kb.up('Meta')
  await ctx.sleep(150)
  h.assert(await ctx.page.isVisible('#quit-hold'), 'tap shows hint')
  await ctx.shot('hint')
  await ctx.sleep(1500)
  h.assert((await h.list(ctx)).tiles.length === 1, 'tap did not quit')

  await kb.down('Meta')
  await kb.down('q')
  for (let i = 0; i < 40 && existsSync(infoPath(ctx.instance)); i++) await ctx.sleep(100)
  h.assert(!existsSync(infoPath(ctx.instance)), 'holding quits')
}
