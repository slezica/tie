// Markdown tile keys: Shift+Down / Shift+Up scroll a third of the tile's height (fast scanning);
// plain arrows keep the browser's small step.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const hiddenWindow = true // real input routing into the frame

export default async (ctx, h) => {
  const dir = join(process.cwd(), 'tmp', `mdkeys-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const f = join(dir, 'long.md')
  writeFileSync(f, '# Long\n\n' + Array.from({ length: 300 }, (_, i) => `Line ${i}.`).join('\n\n') + '\n')
  try {
    const id = (await ctx.tie('open', f)).id
    const frame = await h.contentFrame(ctx, id)
    await h.waitFor(ctx, async () => (await h.mdState(ctx, id)).text.includes('Line 299'), 'rendered')
    await h.clickIn(ctx, frame, 'h1') // focus the frame
    const y = async () => (await h.mdState(ctx, id)).scrollY
    const third = await frame.evaluate(() => Math.round(innerHeight / 3))
    const key = async (k) => {
      await ctx.page.keyboard.press(k)
      await ctx.sleep(400)
    }

    await key('ArrowDown')
    const small = await y()
    h.assert(small > 0 && small < third / 2, `plain Down: small step (${small}, third ${third})`)
    await key('Shift+ArrowDown')
    const big = (await y()) - small
    h.assert(Math.abs(big - third) <= 2, `Shift+Down scrolls a third (${big}, want ${third})`)
    await key('Shift+ArrowUp')
    h.assert(Math.abs((await y()) - small) <= 2, `Shift+Up back (${await y()}, want ${small})`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
