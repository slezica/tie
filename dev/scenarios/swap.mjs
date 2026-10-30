// Swap keys (cmd+shift+arrows: slot ↔ slot, slot ↔ float, no target) and cmd+S shelve / unshelve.
export default async (ctx, h) => {
  const k = async (chord) => {
    await h.press(ctx, chord)
    await ctx.sleep(250)
  }
  const leafIds = (n) => (!n ? [] : n.type === 'leaf' ? [n.id] : n.children.flatMap(leafIds))
  const state = () => ctx.tie('state')
  const [a, b, c] = await h.threeWaySplit(ctx) // a | b over c, c active
  let s = await state()
  h.assert(leafIds(s.tree).join() === [a, b, c].join() && s.active === c, 'start: a | b over c, c active')
  const sizes = JSON.stringify(s.tree.sizes)

  // Slot ↔ slot: c swaps with a (what cmd+left would focus); sizes stay with the positions.
  await k('Meta+Shift+ArrowLeft')
  s = await state()
  h.assert(leafIds(s.tree).join() === [c, b, a].join(), `swap left: c | b over a (got ${leafIds(s.tree)})`)
  h.assert(s.active === c && JSON.stringify(s.tree.sizes) === sizes, 'c still active, sizes kept')
  await h.assertPtySizes(ctx)
  await ctx.shot('swapped-left')

  // No target: no-op.
  const before = JSON.stringify(await state())
  await k('Meta+Shift+ArrowLeft')
  h.assert(JSON.stringify(await state()) === before, 'nothing left of c: no change')

  // Slot ↔ float: the centered float is c's right neighbor; c takes its rect, f takes c's slot.
  const f = (await ctx.tie('add', 'terminal', '--float')).id
  await ctx.sleep(400)
  const fr = (await state()).floats.find((x) => x.id === f)
  await k('Meta+Shift+ArrowRight')
  s = await state()
  const cf = s.floats.find((x) => x.id === c)
  h.assert(leafIds(s.tree).join() === [f, b, a].join(), `float swap: f slotted in c's place (got ${leafIds(s.tree)})`)
  h.assert(cf && cf.x === fr.x && cf.y === fr.y && cf.w === fr.w && cf.h === fr.h, 'c floats with f\'s rect')
  h.assert(s.active === c, 'c still active')
  await h.assertPtySizes(ctx)
  await ctx.shot('swapped-float')

  // cmd+S: shelve the active tile; focus moves to the most recent board tile.
  await k('Meta+s')
  s = await state()
  h.assert(s.shelf.includes(c) && !s.floats.some((x) => x.id === c), 'cmd+S: c shelved')
  h.assert(s.active && s.active !== c, `focus off c (active ${s.active})`)

  // cmd+S on a pinned shelved tile: back on the board beside the active tile, active, unpinned.
  await h.pin(ctx, c)
  s = await state()
  h.assert(s.pinned === c && s.active === c, 'c pinned + active')
  await ctx.page.mouse.move(400, 400)
  await k('Meta+s')
  s = await state()
  const t = await h.tileOf(ctx, c)
  h.assert(t.state === 'slotted' && s.active === c && s.pinned === null && !s.shelf.includes(c), `cmd+S unshelves c (state ${t.state})`)
  await h.assertPtySizes(ctx)
  await ctx.shot('unshelved')
}
