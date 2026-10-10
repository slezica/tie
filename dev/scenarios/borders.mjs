// Drag shared border to resize neighbors.
export default async (ctx, h) => {
  const [a, b] = await h.threeWaySplit(ctx)
  const ra = await h.rectOf(ctx, a)
  const x = ra.x + ra.w + 3
  await h.drag(ctx, { x, y: ra.y + 300 }, { x: x - 200, y: ra.y + 300 })
  const ra2 = await h.rectOf(ctx, a)
  h.assert(Math.abs(ra2.w - (ra.w - 200)) < 3, `a shrank by 200 (${ra.w} -> ${ra2.w})`)
  await ctx.shot('resized')
}
