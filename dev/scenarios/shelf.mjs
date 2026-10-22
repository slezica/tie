// Shelve by drag, hover reveal, pin (survives clicks elsewhere) / unpin, activity, unshelve by drag.
export default async (ctx, h) => {
  const [a, b, c] = await h.threeWaySplit(ctx)
  await h.shelve(ctx, c, { during: () => ctx.shot('shelve-preview') })
  let l = await h.list(ctx)
  h.assert(l.shelf.includes(c), 'c shelved')
  h.assert(l.active !== c, 'focus moved off shelved tile')
  await h.hoverShelf(ctx, c)
  await ctx.shot('reveal')
  l = await h.list(ctx)
  h.assert(!l.tiles.find((t) => t.id === c).pinned, 'hover does not pin')
  await ctx.page.mouse.move(400, 400)
  await ctx.sleep(150)
  await h.pin(ctx, c)
  await ctx.shot('pinned')
  l = await h.list(ctx)
  h.assert(l.tiles.find((t) => t.id === c).pinned && l.active === c, 'click pins + activates')
  await ctx.page.keyboard.type('echo pinned-input\n')
  await ctx.sleep(300)
  await ctx.shot('pinned-typed')
  await ctx.page.mouse.click(300, 300) // another tile on the board
  await ctx.sleep(150)
  l = await h.list(ctx)
  h.assert(l.active !== c && l.tiles.find((t) => t.id === c).pinned, `click on another tile activates it, pin stays (active ${l.active})`)
  await h.pin(ctx, c) // item click
  l = await h.list(ctx)
  h.assert(!l.tiles.find((t) => t.id === c).pinned, 'item click unpins')
  // Activity dot: shelf a tile running output.
  const d = (await ctx.tie('open', 'terminal', '--shelved', '--cmd', 'for i in 1 2 3 4 5; do echo $i; sleep 0.3; done')).id
  await ctx.sleep(1200)
  h.assert(await ctx.page.locator(`.item[data-id="${d}"].activity`).count() === 1, 'activity dot')
  await ctx.sleep(1500)
  await ctx.shot('activity-exit')
  // Reorder: drag d above c.
  const ci = await h.shelfItem(ctx, c)
  await h.drag(ctx, await h.shelfItem(ctx, d), { x: ci.x, y: ci.box.y + 4 })
  l = await h.list(ctx)
  h.assert(l.shelf.join() === [d, c].join(), 'reorder')
  await h.unshelve(ctx, c, a, 'b', { during: () => ctx.shot('unshelve-preview') })
  l = await h.list(ctx)
  h.assert(l.tiles.find((t) => t.id === c).state === 'slotted' && l.active === c, 'unshelved + active')
  await ctx.shot('after')
}
