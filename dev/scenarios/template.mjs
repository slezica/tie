// Drag terminal template from shelf to board, onto empty board, and onto shelf.
// A drop next to a tile opens after reading that shell's cwd (lsof, tens of ms; more under load):
// wait for the tile, never a fixed sleep (the old flake).
export default async (ctx, h) => {
  const tiles = (n) => h.waitFor(ctx, async () => ((await h.list(ctx)).tiles.length === n ? h.list(ctx) : null), `${n} tiles`)
  const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
  await h.spawnFromTemplate(ctx, a, 'b', { during: () => ctx.shot('template-preview') })
  let l = await tiles(2)
  h.assert(l.tiles.length === 2 && l.tiles[1].state === 'slotted' && l.active === l.tiles[1].id, 'spawned below, active')
  for (const t of l.tiles) await ctx.tie('close', '--tile', t.id)
  await tiles(0)
  await h.settle(ctx)

  await ctx.shot('empty')
  await h.spawnFromTemplate(ctx, null)
  l = await tiles(1)
  h.assert(l.tiles.length === 1, 'spawned on empty board')
  await ctx.shot('after')
  // Pointer capture lost mid-drag (e.g. element re-rendered): the drop must still land.
  const [only] = (await h.list(ctx)).tiles.map((t) => t.id)
  await h.spawnFromTemplate(ctx, only, 'r', {
    during: () => ctx.page.evaluate(() => document.querySelectorAll('*').forEach((el) => el.hasPointerCapture?.(1) && el.releasePointerCapture(1))),
  })
  l = await tiles(2)
  h.assert(l.tiles.length === 2, 'drop lands after capture loss')
  h.assert(!(await ctx.page.isVisible('#preview')) && !(await ctx.page.isVisible('#ghost')), 'drag visuals cleared')
}
