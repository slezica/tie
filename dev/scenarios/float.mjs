// Shift-drop floats; resize by corner; dock back into slot.
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
}
