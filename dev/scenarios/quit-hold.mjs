// ⌘Q with tiles open: a tap shows "Hold ⌘Q to quit" and doesn't quit; holding ~1s quits.
import { existsSync } from 'node:fs'
import { infoPath } from '../lib.mjs'

export default async (ctx, h) => {
  // Keys through main (h.keyDown/keyUp): ⌘Q is handled in before-input-event.
  const kb = { down: (k) => h.keyDown(ctx, k), up: (k) => h.keyUp(ctx, k), press: (k) => h.press(ctx, k) }
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
  await ctx.sleep(1800) // held past the timer: armed, but still running while keys are down
  h.assert(existsSync(infoPath(ctx.instance)), 'does not quit while keys are held (repeats would hit the app behind)')
  h.assert((await ctx.page.textContent('#quit-hold span')) === 'Release to quit', 'asks to release')
  await ctx.shot('armed')
  // Losing focus (e.g. another app's popup) cancels: never quit without a deliberate release.
  await ctx.page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await kb.up('q')
  await kb.up('Meta')
  await ctx.sleep(500)
  h.assert(existsSync(infoPath(ctx.instance)), 'blur cancels; release afterwards does not quit')
  h.assert(!(await ctx.page.isVisible('#quit-hold')), 'hint gone after cancel')
  // Deliberate hold + release quits.
  await kb.down('Meta')
  await kb.down('q')
  await ctx.sleep(1300)
  await kb.up('q').catch(() => {})
  for (let i = 0; i < 40 && existsSync(infoPath(ctx.instance)); i++) await ctx.sleep(100)
  h.assert(!existsSync(infoPath(ctx.instance)), 'quits on release')
}
