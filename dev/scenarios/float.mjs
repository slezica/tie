// Shift-drop floats; resize by corner (activates, raises); dock back into slot.
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
  // Click on a slotted tile, then the float again: raises/activates.
  await h.drag(ctx, await h.titlePoint(ctx, b), await h.sidePoint(ctx, a, 'r'))
  t = (await h.list(ctx)).tiles.find((t) => t.id === b)
  h.assert(t.state === 'slotted', 'docked back')
  await ctx.shot('docked')

  // Resizing a background float activates and raises it.
  const f1 = (await ctx.tie('add', 'terminal', '--float')).id
  const f2 = (await ctx.tie('add', 'terminal', '--float')).id
  await ctx.sleep(500)
  const tp = await h.titlePoint(ctx, f2)
  await h.drag(ctx, tp, { x: tp.x + 300, y: tp.y + 200 }, { shift: true })
  const hb = await ctx.page.locator(`.tile[data-id="${f1}"] .rz.nw`).boundingBox()
  await h.drag(ctx, { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }, { x: hb.x - 40, y: hb.y - 40 }, { steps: 5 })
  const s = await ctx.tie('state')
  h.assert(s.active === f1 && s.floats.at(-1).id === f1, `resized float active + on top (active=${s.active})`)
}
