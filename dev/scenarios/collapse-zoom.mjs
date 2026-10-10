// Collapse in col split (bar) and row split (vertical strip); zoom via button and double-click.
export default async (ctx, h) => {
  const [a, b, c] = await h.threeWaySplit(ctx)
  await h.clickButton(ctx, b, 'collapse')
  let l = await h.list(ctx)
  h.assert(l.tiles.find((t) => t.id === b).collapsed, 'b collapsed')
  h.assert((await h.rectOf(ctx, b)).h <= 32, 'horizontal bar')
  await ctx.shot('collapsed-horizontal')
  await h.clickButton(ctx, a, 'collapse')
  h.assert((await h.rectOf(ctx, a)).w <= 32, 'vertical strip')
  await ctx.shot('collapsed-vertical')
  // Click on collapsed bar expands.
  const ra = await h.rectOf(ctx, a)
  await ctx.page.mouse.click(ra.x + ra.w / 2, ra.y + 200)
  await ctx.sleep(150)
  h.assert(!(await h.list(ctx)).tiles.find((t) => t.id === a).collapsed, 'click expands')
  await h.clickButton(ctx, c, 'zoom')
  h.assert((await h.list(ctx)).tiles.find((t) => t.id === c).zoomed, 'zoomed')
  await ctx.shot('zoomed')
  const p = await h.titlePoint(ctx, c)
  await ctx.page.mouse.dblclick(p.x, p.y)
  await ctx.sleep(150)
  h.assert(!(await h.list(ctx)).tiles.find((t) => t.id === c).zoomed, 'dblclick unzooms')
}
