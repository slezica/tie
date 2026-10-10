// Drag terminal template from shelf to board, onto empty board, and onto shelf.
export default async (ctx, h) => {
  const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
  await h.spawnFromTemplate(ctx, a, 'b', { during: () => ctx.shot('template-preview') })
  let l = await h.list(ctx)
  h.assert(l.tiles.length === 2 && l.tiles[1].state === 'slotted' && l.active === l.tiles[1].id, 'spawned below, active')
  for (const t of l.tiles) await ctx.tie('close', t.id)
  await ctx.sleep(150)
  await ctx.shot('empty')
  await h.spawnFromTemplate(ctx, null)
  l = await h.list(ctx)
  h.assert(l.tiles.length === 1, 'spawned on empty board')
  await ctx.shot('after')
}
