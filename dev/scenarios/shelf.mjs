// Shelve by drag, hover reveal, pin (survives clicks elsewhere) / unpin, activity, unshelve by drag.
export default async (ctx, h) => {
  const [a, b, c] = await h.threeWaySplit(ctx)
  const hint = () => ctx.page.evaluate(() => getComputedStyle(document.getElementById('shelf'), '::before').display !== 'none')
  const ghosts = () => ctx.page.locator('#shelf .item.ghost').count()
  h.assert(!(await hint()), 'no "+" slot at rest')
  // Mid-drag over the board: the "+" hint slot; over the strip: the ghost slot instead (checked below).
  await h.dragTitle(ctx, c, a, 'l', {
    during: async () => h.assert((await hint()) && (await ghosts()) === 0, 'dragging over the board: "+" hint, no ghost'),
  })
  await h.shelve(ctx, c, {
    during: async () => {
      h.assert(!(await hint()) && (await ghosts()) === 1, 'over the strip: ghost slot replaces the hint')
      await ctx.shot('shelve-preview')
    },
  })
  h.assert((await ghosts()) === 0 && !(await hint()), 'dropped: ghost and hint gone')
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
  // Activity dot: shelf a tile running output. The pointer leaves the shelf first: items grow
  // leftward, so a new one would land under it and be revealed (no dot while revealed).
  await ctx.page.mouse.move(400, 400)
  const d = (await ctx.tie('open', 'terminal', '--shelved', '--cmd', 'for i in 1 2 3 4 5; do echo $i; sleep 0.3; done')).id
  await ctx.sleep(1200)
  h.assert(await ctx.page.locator(`.item[data-id="${d}"].activity`).count() === 1, 'activity dot')
  await ctx.sleep(1500)
  await ctx.shot('activity-exit')
  // Reorder: drag d before c. The dragged item hides, the ghost stands for it; the strip keeps
  // its width (the dragged item's slot becomes the hint, then the ghost).
  const ci = await h.shelfItem(ctx, c)
  const w0 = (await h.boxOf(ctx, '#shelf')).box.width
  await h.drag(ctx, await h.shelfItem(ctx, d), { x: ci.box.x + 4, y: ci.y }, {
    during: async () => {
      h.assert(!(await ctx.page.isVisible(`.item[data-id="${d}"]`)) && (await ghosts()) === 1, 'reorder: source hidden, ghost shown')
      h.assert(Math.abs((await h.boxOf(ctx, '#shelf')).box.width - w0) < 1, 'strip width stable while dragging')
      await ctx.shot('reorder-ghost')
    },
  })
  l = await h.list(ctx)
  h.assert(l.shelf.join() === [d, c].join(), 'reorder')
  await h.unshelve(ctx, c, a, 'b', { during: () => ctx.shot('unshelve-preview') })
  l = await h.list(ctx)
  h.assert(l.tiles.find((t) => t.id === c).state === 'slotted' && l.active === c, 'unshelved + active')
  await ctx.shot('after')
}
