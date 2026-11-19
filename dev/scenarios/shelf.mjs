// Shelve by drag, item click pins / unpins (hover reveal, pins surviving clicks: shelf-reveal), activity (cleared by hover),
// exit marks, reorder both ways, unshelve by drag; a pin ends when its tile leaves the shelf or closes.
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
  h.assert(l.active === b, `focus moved off the shelved tile to the recent board tile (active ${l.active})`)
  // Item click pins + activates, again unpins (hover reveal, keys, outside clicks: shelf-reveal).
  await h.clickShelf(ctx, c)
  await ctx.shot('pinned')
  l = await h.list(ctx)
  h.assert(l.tiles.find((t) => t.id === c).pinned && l.active === c, 'click pins + activates')
  await h.clickShelf(ctx, c) // item click
  l = await h.list(ctx)
  h.assert(!l.tiles.find((t) => t.id === c).pinned, 'item click unpins')
  // Activity dot: shelf a tile running output. The pointer leaves the shelf first: items grow
  // leftward, so a new one would land under it and be revealed (no dot while revealed).
  await ctx.page.mouse.move(400, 400)
  const d = (await ctx.tie('add', 'terminal', '--shelved', '--cmd', 'for i in 1 2 3 4 5; do echo $i; sleep 0.3; done')).id
  await h.waitFor(ctx, async () => (await ctx.page.locator(`.item[data-id="${d}"].activity`).count()) === 1, 'activity dot', 8000)
  await h.waitTile(ctx, d, (t) => t.exit !== null, 'output loop exited', 8000)
  const mark = (id) => ctx.page.$eval(`.item[data-id="${id}"]`, (e) => ({ activity: e.classList.contains('activity'), exit: e.querySelector('.exit').textContent, cls: e.querySelector('.exit').className }))
  await h.eventually(ctx, async () => {
    const m = await mark(d)
    h.assert(m.activity && m.exit === '✓' && /\bok\b/.test(m.cls), `exit 0: ✓ mark, dot kept: ${JSON.stringify(m)}`)
  })
  await ctx.shot('activity-exit')
  // A failed command: ✗.
  const f = (await ctx.tie('add', 'terminal', '--shelved', '--cmd', 'exit 3')).id
  await h.waitTile(ctx, f, (t) => t.exit === 3, 'exit 3', 8000)
  await h.eventually(ctx, async () => {
    const m = await mark(f)
    h.assert(m.exit === '✗' && /\bfail\b/.test(m.cls), `exit 3: ✗ mark: ${JSON.stringify(m)}`)
  })
  await ctx.tie('close', '--tile', f)
  await h.waitGone(ctx, f)
  // Hover clears the activity dot; it stays cleared after the pointer leaves (no new output).
  await h.hoverShelf(ctx, d)
  await h.eventually(ctx, async () => h.assert(!(await mark(d)).activity, 'hover clears the dot'))
  await ctx.page.mouse.move(400, 400)
  await h.waitRevealed(ctx, null)
  h.assert(!(await mark(d)).activity, 'dot stays cleared')
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
  // Reorder to the right: d dropped at the strip's right end, past c.
  const strip = (await h.boxOf(ctx, '#shelf')).box
  await h.drag(ctx, await h.shelfItem(ctx, d), { x: strip.x + strip.width - 4, y: strip.y + strip.height / 2 })
  l = await h.list(ctx)
  h.assert(l.shelf.join() === [c, d].join(), `reorder to the right: ${l.shelf}`)
  // A pinned tile dragged to the board: unpinned, slotted, active.
  await h.clickShelf(ctx, c)
  await h.waitFor(ctx, async () => (await h.state(ctx)).pinned === c, 'c pinned')
  await h.unshelve(ctx, c, a, 'b', { during: () => ctx.shot('unshelve-preview') })
  l = await h.list(ctx)
  h.assert(l.tiles.find((t) => t.id === c).state === 'slotted' && l.active === c, 'unshelved + active')
  h.assert((await h.state(ctx)).pinned === null, 'unshelving the pinned tile unpins')
  // A pinned tile closed (its ×): unpinned, the recent board tile takes the keys.
  await h.clickShelf(ctx, d)
  await h.waitFor(ctx, async () => (await h.state(ctx)).pinned === d, 'd pinned')
  await h.clickButton(ctx, d, 'close') // exited: closes at once
  await h.waitGone(ctx, d)
  await h.eventually(ctx, async () => {
    const s = await h.state(ctx)
    h.assert(s.pinned === null && s.revealed === null && s.active === c, `closing the pinned tile unpins, c active: ${JSON.stringify(s)}`)
  })
  await ctx.shot('after')
}
