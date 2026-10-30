// Markdown live updates: external writes never move what the user is looking at (text inserted or
// removed above, also at the very top); changed blocks get a margin mark that fades once seen;
// unseen changes off-screen show an edge marker (click = jump); `n` brings the newest unseen change
// to a third from the top. Hidden window: real keys and clicks in the frame.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const hiddenWindow = true

export default async (ctx, h) => {
  const dir = join(process.cwd(), 'tmp', `mdlive-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const f = join(dir, 'doc.md')
  let paras = Array.from({ length: 300 }, (_, i) => `Para ${i}.`)
  let head = []
  let top = []
  const write = () => writeFileSync(f, [...top, '# Live', '', ...head, ...paras.flatMap((p) => [p, ''])].join('\n'))
  write()
  try {
    const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
    const id = (await ctx.tie('add', f, '--at', a, '--side', 'r')).id
    await h.waitFor(ctx, async () => (await h.mdState(ctx, id)).text.includes('Para 299.'), 'render')
    const fr = await h.contentFrame(ctx, id)
    const update = async () => {
      const r0 = (await h.mdState(ctx, id)).rev
      const n0 = await fr.evaluate(() => window.markdown.renders)
      write()
      await h.waitFor(ctx, async () => (await h.mdState(ctx, id)).rev !== r0 && (await fr.evaluate(() => window.markdown.renders)) > n0, 'update shown')
      await ctx.sleep(150)
    }
    const topOf = (text) => fr.evaluate((t) => [...document.querySelectorAll('#doc > p')].find((p) => p.textContent === t)?.getBoundingClientRect().top, text)
    const info = () =>
      fr.evaluate(() => ({
        changed: [...document.querySelectorAll('#doc > .changed')].map((e) => e.textContent),
        above: !!document.querySelector('.edge-mark.above.on'),
        below: !!document.querySelector('.edge-mark.below.on'),
        h: innerHeight,
      }))

    // Scrolled mid-document; lines inserted above: what's on screen stays put.
    await fr.evaluate(() => [...document.querySelectorAll('#doc > p')].find((p) => p.textContent === 'Para 100.').scrollIntoView({ block: 'center' }))
    await ctx.sleep(200)
    const t0 = await topOf('Para 100.')
    head = ['Inserted one.', '', 'Inserted two.', '', 'Inserted three.', '']
    await update()
    const t1 = await topOf('Para 100.')
    h.assert(Math.abs(t1 - t0) <= 2, `insert above: view still (${t0} → ${t1})`)
    let s = await info()
    h.assert(s.changed.join('|') === 'Inserted one.|Inserted two.|Inserted three.', `inserted blocks marked: ${s.changed}`)
    h.assert(s.above && !s.below, `edge marker above only: ${JSON.stringify(s)}`)
    await ctx.shot('inserted-above')

    // Removed above: still put.
    paras = paras.filter((p) => p !== 'Para 3.' && p !== 'Para 4.')
    await update()
    const t2 = await topOf('Para 100.')
    h.assert(Math.abs(t2 - t0) <= 2, `remove above: view still (${t0} → ${t2})`)

    // Changed below the fold: marked, marker below.
    paras = paras.map((p) => (p === 'Para 180.' ? 'Para 180, edited.' : p))
    await update()
    s = await info()
    h.assert(s.changed.includes('Para 180, edited.') && s.below && s.above, `below change: ${JSON.stringify(s)}`)
    h.assert(Math.abs((await topOf('Para 100.')) - t0) <= 2, 'view still after a change below')

    // `n`: newest unseen change (Para 180) to a third from the top; again: the older ones above.
    await h.clickIn(ctx, fr, '#doc > p:text-is("Para 100.")') // focus the frame (scrolls nothing)
    await ctx.page.keyboard.press('n')
    await ctx.sleep(300)
    const third = Math.round(s.h / 3)
    const at = await topOf('Para 180, edited.')
    h.assert(Math.abs(at - third) <= 4, `n: newest change at a third (${at}, want ${third})`)
    await ctx.page.keyboard.press('n')
    await ctx.sleep(300)
    const at2 = await topOf('Inserted one.')
    const y2 = await fr.evaluate(() => scrollY)
    h.assert(Math.abs(at2 - third) <= 4 || (y2 === 0 && at2 < third), `n again: next unseen change, older (${at2}, want ${third} or page top)`)
    h.assert((await info()).changed.includes('Inserted one.'), 'jumped-to change still marked (fades later)')
    await ctx.shot('n')

    // Edge marker click: jumps to the unseen change in that direction.
    await fr.evaluate(() => scrollTo(0, 0))
    paras = paras.map((p) => (p === 'Para 150.' ? 'Para 150, edited.' : p))
    await update()
    h.assert((await info()).below, 'marker below for a new change')
    await h.clickIn(ctx, fr, '.edge-mark.below.on')
    await ctx.sleep(300)
    const at3 = await topOf('Para 150, edited.')
    h.assert(Math.abs(at3 - third) <= 4, `marker click: change at a third (${at3})`)
    await h.waitFor(ctx, async () => !(await info()).below, 'marker off once seen')

    // Marks fade a few seconds after being seen (not before).
    await ctx.sleep(1000)
    h.assert((await info()).changed.includes('Para 150, edited.'), 'still marked 1 s after seen')
    await h.waitFor(ctx, async () => !(await info()).changed.includes('Para 150, edited.'), 'mark faded after seen', 8000)

    // At the very top: insertion above the first line still doesn't move the view.
    await fr.evaluate(() => scrollTo(0, 0))
    await ctx.sleep(200)
    const z0 = await topOf('Inserted one.')
    top = ['Top news.', '']
    await update()
    const z1 = await topOf('Inserted one.')
    h.assert(Math.abs(z1 - z0) <= 2, `insert at top while at scroll 0: view still (${z0} → ${z1})`)
    h.assert((await info()).above, 'marker above for the top insertion')
    h.assert(!(await h.tileOf(ctx, id)).error, 'tile fine')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
