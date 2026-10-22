// ⌘Q with no tiles open anywhere: still asks ("Quit Tie?", nothing listed); Enter quits.
import { existsSync } from 'node:fs'
import { infoPath } from '../lib.mjs'

export default async (ctx, h) => {
  for (const t of (await h.list(ctx)).tiles) await ctx.tie('close', t.id)
  await ctx.sleep(200)
  await h.press(ctx, 'Meta+q') // through main: shortcuts are matched in before-input-event
  await ctx.sleep(300)
  h.assert(await ctx.page.isVisible('.dialog.quit'), 'asks')
  h.assert((await ctx.page.$$('.dialog ul.running')).length === 0, 'nothing listed')
  h.assert(existsSync(infoPath(ctx.instance)), 'still running while asked')
  await ctx.page.keyboard.press('Enter').catch(() => {}) // the page may be gone before the keyup
  for (let i = 0; i < 30 && existsSync(infoPath(ctx.instance)); i++) await ctx.sleep(100)
  h.assert(!existsSync(infoPath(ctx.instance)), 'Enter quits')
}
