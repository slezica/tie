// Shift-drop floats; resize by corner (activates, raises); dock back into slot; collapsed float;
// clamped into a shrunk board, 200×120 minimum.
export default async (ctx, h) => {
  const [a, b] = await h.threeWaySplit(ctx)
  const center = await h.boardCenter(ctx)
  await h.drag(ctx, await h.titlePoint(ctx, b), center, { shift: true, during: () => ctx.shot('float-preview') })
  let t = (await h.list(ctx)).tiles.find((t) => t.id === b)
  h.assert(t.state === 'floating', 'b floating')
  await ctx.shot('floating')
  const r = t.rect
  await h.drag(ctx, { x: r.x + r.w - 2, y: r.y + r.h - 2 }, { x: r.x + r.w + 150, y: r.y + r.h + 80 })
  const r2 = (await h.rectOf(ctx, b))
  h.assert(r2.w > r.w + 100 && r2.h > r.h + 50, 'corner resize grows')
  await ctx.shot('resized')
  // Dock back: title dropped on a's right edge band.
  await h.drag(ctx, await h.titlePoint(ctx, b), await h.sidePoint(ctx, a, 'r'))
  t = (await h.list(ctx)).tiles.find((t) => t.id === b)
  h.assert(t.state === 'slotted', 'docked back')
  await ctx.shot('docked')

  // Resizing a background float activates and raises it.
  const f1 = (await ctx.tie('add', 'terminal', '--float')).id
  const f2 = (await ctx.tie('add', 'terminal', '--float')).id
  await h.waitShell(ctx, f1)
  await h.waitShell(ctx, f2)

  const tp = await h.titlePoint(ctx, f2)
  await h.drag(ctx, tp, { x: tp.x + 300, y: tp.y + 200 }, { shift: true })
  const hb = await ctx.page.locator(`.tile[data-id="${f1}"] .rz.nw`).boundingBox()
  await h.drag(ctx, { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }, { x: hb.x - 40, y: hb.y - 40 }, { steps: 5 })
  const s = await h.state(ctx)
  h.assert(s.active === f1 && s.floats.at(-1).id === f1, `resized float active + on top (active=${s.active})`)

  // Collapsed float: just its title bar, its own rect kept for after; a title click expands it.
  const cls = (id) => ctx.page.$eval(`.tile[data-id="${id}"]`, (e) => e.className)
  const own = async (id) => (await h.state(ctx)).floats.find((x) => x.id === id)
  const fr = await own(f2)
  await h.clickButton(ctx, f2, 'collapse') // activates and raises it too
  await h.eventually(ctx, async () => {
    const r = await h.rectOf(ctx, f2)
    h.assert((await h.state(ctx)).collapsed.includes(f2) && r.h <= 32 && r.w === fr.w, `collapsed float: a title bar ${JSON.stringify(r)}`)
    h.assert(/collapsed-h/.test(await cls(f2)) && JSON.stringify(await own(f2)) === JSON.stringify(fr), 'bar look, rect kept')
  })
  await ctx.shot('float-collapsed')
  const tp2 = await h.titlePoint(ctx, f2)
  await ctx.page.mouse.click(tp2.x, tp2.y)
  await h.eventually(ctx, async () => {
    const r = await h.rectOf(ctx, f2)
    h.assert(!(await h.state(ctx)).collapsed.includes(f2) && r.h === fr.h && !/collapsed/.test(await cls(f2)), `title click expands ${JSON.stringify(r)}`)
  })

  // Window shrink: every float clamped into the smaller board; one bigger than it, to its size.
  // f2 first into the board's bottom-right corner (a drop there is clamped too).
  let board = (await h.list(ctx)).board
  const tp3 = await h.titlePoint(ctx, f2)
  await h.drag(ctx, tp3, { x: board.x + board.w - 5, y: board.y + board.h - 5 }, { shift: true })
  let c2 = await own(f2)
  h.assert(c2.x + c2.w === board.w && c2.y + c2.h === board.h, `f2 in the corner ${JSON.stringify([c2, board])}`)
  const r1 = await own(f1)
  const [W, H] = await ctx.page.evaluate(() => [innerWidth, innerHeight])
  // Board 40 px narrower than f1, as tall as f2 plus 60 px.
  await h.resizeWindow(ctx, W - (board.w - (r1.w - 40)), H - (board.h - (c2.h + 60)))
  board = (await h.list(ctx)).board
  const inside = (f) => f.x >= 0 && f.y >= 0 && f.x + f.w <= board.w && f.y + f.h <= board.h
  await h.eventually(ctx, async () => {
    const fs = (await h.state(ctx)).floats
    h.assert(fs.length === 2 && fs.every(inside), `floats inside the board ${JSON.stringify([fs, board])}`)
    const [a1, a2] = [await own(f1), await own(f2)]
    h.assert(a1.w === board.w && a1.x === 0, `f1 wider than the board: its width ${JSON.stringify(a1)}`)
    h.assert(a2.w === c2.w && a2.h === c2.h && a2.x + a2.w === board.w && a2.y + a2.h === board.h, `f2 moved in, size kept ${JSON.stringify(a2)}`)
    for (const id of [f1, f2]) {
      const r = await h.rectOf(ctx, id)
      h.assert(r.x >= board.x && r.y >= board.y && r.x + r.w <= board.x + board.w + 1 && r.y + r.h <= board.y + board.h + 1, `${id} drawn inside the board ${JSON.stringify(r)}`)
    }
  })
  await ctx.shot('shrunk')

  // Minimum 200 × 120: the corner dragged past the opposite one.
  const se = await ctx.page.locator(`.tile[data-id="${f2}"] .rz.se`).boundingBox()
  const rf2 = await h.rectOf(ctx, f2)
  await h.drag(ctx, { x: se.x + se.width / 2, y: se.y + se.height / 2 }, { x: rf2.x + 10, y: rf2.y + 10 }, { steps: 5 })
  c2 = await own(f2)
  h.assert(c2.w === 200 && c2.h === 120, `minimum size 200×120 (${JSON.stringify(c2)})`)
  await h.assertPtySizes(ctx)
}
