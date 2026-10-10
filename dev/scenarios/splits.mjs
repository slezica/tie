// Drag tiles between slots; triangle drop zones; preview mid-drag.
export default async (ctx, h) => {
  const [a, b, c] = await h.threeWaySplit(ctx)
  await ctx.shot('initial')
  await h.dragTitle(ctx, c, a, 'l', { during: () => ctx.shot('preview-left') })
  let s = await ctx.tie('state')
  h.assert(s.tree.dir === 'row' && s.tree.children.map((n) => n.id).join() === [c, a, b].join(), 'c left of a, row of 3')
  await h.dragTitle(ctx, b, a, 'b', { during: () => ctx.shot('preview-bottom') })
  s = await ctx.tie('state')
  h.assert(s.tree.children[1].dir === 'col', 'a over b')
  await ctx.shot('after')
  // Dropping onto itself is a no-op.
  const before = JSON.stringify((await ctx.tie('state')).tree)
  await h.dragTitle(ctx, a, a, 'r')
  h.assert(JSON.stringify((await ctx.tie('state')).tree) === before, 'self-drop no-op')
}
