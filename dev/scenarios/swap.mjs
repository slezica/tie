// Swap keys (cmd+shift+arrows: slot ↔ slot, slot ↔ float, no target) and cmd+S shelve / unshelve.
export default async (ctx, h) => {
  const k = (chord) => h.press(ctx, chord)
  const state = () => h.state(ctx)
  // Split holding a leaf (parent), or null.
  const parentOf = (n, id) => (n?.type !== 'split' ? null : n.children.some((c) => c.type === 'leaf' && c.id === id) ? n : n.children.map((c) => parentOf(c, id)).find(Boolean) ?? null)
  const [a, b, c] = await h.threeWaySplit(ctx) // a | b over c, c active
  let s = await state()
  h.assert(h.leafIds(s.tree).join() === [a, b, c].join() && s.active === c, 'start: a | b over c, c active')
  const sizes = JSON.stringify(s.tree.sizes)

  // Slot ↔ slot: c swaps with a (what cmd+left would focus); sizes stay with the positions.
  await k('Meta+Shift+ArrowLeft')
  await h.eventually(ctx, async () => {
    s = await state()
    h.assert(h.leafIds(s.tree).join() === [c, b, a].join(), `swap left: c | b over a (got ${h.leafIds(s.tree)})`)
    h.assert(s.active === c && JSON.stringify(s.tree.sizes) === sizes, 'c still active, sizes kept')
    await h.assertPtySizes(ctx)
  })
  await ctx.shot('swapped-left')

  // No target: no-op. Keys run in order (main → UI, one channel): once a later key's effect shows,
  // the no-op key has been handled. Right: b (b and a tie, b more recent), then back left to c.
  s = await state()
  const before = JSON.stringify([s.tree, s.floats, s.shelf])
  await k('Meta+Shift+ArrowLeft')
  await k('Meta+ArrowRight')
  await h.eventually(ctx, async () => h.assert((await state()).active === b, 'focus right: b'))
  s = await state()
  h.assert(JSON.stringify([s.tree, s.floats, s.shelf]) === before, 'nothing left of c: no change')
  await k('Meta+ArrowLeft')
  await h.eventually(ctx, async () => h.assert((await state()).active === c, 'focus back: c'))

  // Slot ↔ float: the centered float is c's right neighbor; c takes its rect, f takes c's slot.
  const f = (await ctx.tie('add', 'terminal', '--float')).id
  const fr = (await state()).floats.find((x) => x.id === f)
  await k('Meta+Shift+ArrowRight')
  await h.eventually(ctx, async () => {
    s = await state()
    const cf = s.floats.find((x) => x.id === c)
    h.assert(h.leafIds(s.tree).join() === [f, b, a].join(), `float swap: f slotted in c's place (got ${h.leafIds(s.tree)})`)
    h.assert(cf && cf.x === fr.x && cf.y === fr.y && cf.w === fr.w && cf.h === fr.h, 'c floats with f\'s rect')
    h.assert(s.active === c, 'c still active')
    await h.assertPtySizes(ctx)
  })
  await ctx.shot('swapped-float')

  // cmd+S: shelve the active tile; focus moves to the most recent board tile.
  await k('Meta+s')
  await h.eventually(ctx, async () => {
    s = await state()
    h.assert(s.shelf.includes(c) && !s.floats.some((x) => x.id === c), 'cmd+S: c shelved')
    h.assert(s.active === b, `focus: most recent board tile, b (active ${s.active})`)
  })

  // cmd+S on a pinned shelved tile: back on the board beside the most recent board tile (b; the
  // pinned c is active), along b's longer side; active, unpinned.
  await h.clickShelf(ctx, c)
  s = await state()
  h.assert(s.pinned === c && s.active === c, 'c pinned + active')
  const rb = await h.rectOf(ctx, b)
  const dir = rb.h > rb.w ? 'col' : 'row'
  await ctx.page.mouse.move(400, 400)
  await k('Meta+s')
  await h.eventually(ctx, async () => {
    s = await state()
    const t = await h.tileOf(ctx, c)
    h.assert(t.state === 'slotted' && s.active === c && s.pinned === null && !s.shelf.includes(c), `cmd+S unshelves c (state ${t.state})`)
    const p = parentOf(s.tree, c)
    const ids = p?.children.map((x) => x.id)
    h.assert(p?.dir === dir && ids.indexOf(c) === ids.indexOf(b) + 1, `c just after b, ${dir} (got ${JSON.stringify(s.tree)})`)
    await h.assertPtySizes(ctx)
  })
  await ctx.shot('unshelved')
}
