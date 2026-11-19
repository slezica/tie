// Drag tiles between slots; edge drop zones (nearest edge band); preview mid-drag.
export default async (ctx, h) => {
  const [a, b, c] = await h.threeWaySplit(ctx)
  await ctx.shot('initial')
  await h.dragTitle(ctx, c, a, 'l', { during: () => ctx.shot('preview-left') })
  let s = await h.state(ctx)
  h.assert(s.tree.dir === 'row' && s.tree.children.map((n) => n.id).join() === [c, a, b].join(), 'c left of a, row of 3')
  await h.dragTitle(ctx, b, a, 'b', { during: () => ctx.shot('preview-bottom') })
  s = await h.state(ctx)
  const col = s.tree.children[1]
  h.assert(s.tree.children.length === 2 && col.dir === 'col' && col.children.map((n) => n.id).join() === [a, b].join(), `a over b, right of c (got ${JSON.stringify(s.tree)})`)
  await ctx.shot('after')
  // Dropping onto itself is a no-op.
  const before = JSON.stringify((await h.state(ctx)).tree)
  await h.dragTitle(ctx, a, a, 'r')
  h.assert(JSON.stringify((await h.state(ctx)).tree) === before, 'self-drop no-op')
}
