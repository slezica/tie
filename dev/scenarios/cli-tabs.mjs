// tie move --tab / --swap, tie add --tab: target tab, visible tab and input kept, emptied tabs close.
export default async (ctx, h) => {
  const list = () => h.list(ctx)
  const tabTiles = (l, tab) => l.tiles.filter((t) => t.tab === tab).map((t) => t.id)
  const leafIds = (n) => (!n ? [] : n.type === 'leaf' ? [n.id] : n.children.flatMap(leafIds))
  const fails = async (...args) => {
    try {
      await ctx.tie(...args)
      return null
    } catch (e) {
      return e.message
    }
  }

  // s1: a | b (a has input); s2: x (hidden).
  let l = await list()
  const s1 = l.tab
  const a = l.tiles[0].id
  await h.press(ctx, 'Meta+t')
  l = await h.waitFor(ctx, async () => { const l = await list(); return l.tab !== s1 && l }, 'cmd+T: new tab shown')
  const s2 = l.tab
  const x = tabTiles(l, s2)[0]
  await h.press(ctx, 'Meta+1')
  await h.waitFor(ctx, async () => (await list()).tab === s1, 'cmd+1: tab 1')
  const b = (await ctx.tie('add', 'terminal')).id
  l = await list()
  h.assert(l.tab === s1 && l.active === a, 'start: tab 1, a has input')

  // --tab <id>: into s2, active there; the user stays on s1, input on a.
  let r = await ctx.tie('move', b, '--tab', s2)
  l = await list()
  h.assert(r.tab === s2 && l.tabs.find((t) => t.id === s2).active === b, `move --tab: in ${s2}, active there (${JSON.stringify(r)})`)
  h.assert(l.tab === s1 && l.active === a, 'move --tab: visible tab and input kept')

  // --tab <position>: back to the visible tab, placed but not active (input stays).
  r = await ctx.tie('move', b, '--tab', '1')
  l = await list()
  h.assert(r.tab === s1 && r.state === 'slotted' && !r.active && l.active === a, `move --tab 1: back, input on a (${JSON.stringify(r)})`)

  // --tab new: a new tab after the visible one, holding only that tile; not shown.
  r = await ctx.tie('move', b, '--tab', 'new')
  l = await list()
  const s3 = r.tab
  h.assert(l.tabs.length === 3 && l.tabs[1].id === s3 && l.tab === s1, `--tab new: inserted after the visible tab, not shown (${JSON.stringify(l.tabs)})`)
  h.assert(tabTiles(l, s3).join() === b && r.active, '--tab new: only that tile, active there')

  // Moving the last tile out of a hidden tab closes it.
  await ctx.tie('move', b, '--tab', s1)
  l = await list()
  h.assert(!l.tabs.some((t) => t.id === s3) && l.tabs.length === 2 && l.tab === s1, 'emptied hidden tab closed')

  // Errors: unknown tab; --tab with another placement (no tab left behind); unknown id.
  h.assert((await fails('move', b, '--tab', 's99'))?.includes('no such tab: s99'), 'unknown tab id')
  h.assert((await fails('move', b, '--tab', '9'))?.includes('no such tab: 9'), 'position out of range')
  h.assert((await fails('move', b, '--tab', 'new', '--float'))?.includes('--tab takes no other placement'), '--tab + --float rejected')
  h.assert((await list()).tabs.length === 2, 'rejected --tab new: no tab created')
  h.assert((await fails('move', 't99', '--tab', s2))?.includes('no such tile: t99'), 'unknown tile')

  // --tab with --focus: the user switches to it, the tile takes input.
  r = await ctx.tie('move', b, '--tab', s2, '--focus')
  l = await list()
  h.assert(l.tab === s2 && l.active === b, `--focus: switched to ${s2}, b active (tab ${l.tab}, active ${l.active})`)

  // The last tile of the tab on screen: that tab closes, the user follows the tile.
  await ctx.tie('move', x, '--tab', s1)
  l = await list()
  h.assert(l.tab === s2 && l.active === b, 'x moved out: still on s2')
  r = await ctx.tie('move', b, '--tab', s1)
  l = await list()
  h.assert(l.tabs.length === 1 && l.tab === s1 && l.active === b, `last tile of the visible tab: tab closed, user follows (${JSON.stringify(l.tabs)})`)
  await h.press(ctx, 'Meta+1')

  // add --tab new: a new tab with just that tile, not shown; add --tab <id> --focus: shown, input.
  const before = (await list()).active
  const y = (await ctx.tie('add', 'terminal', '--tab', 'new')).id
  l = await list()
  const s4 = l.tiles.find((t) => t.id === y).tab
  h.assert(l.tabs.length === 2 && l.tab === s1 && l.active === before && tabTiles(l, s4).join() === y, 'add --tab new: own tab, not shown')
  const z = (await ctx.tie('add', 'terminal', '--tab', s4, '--focus')).id
  l = await list()
  h.assert(l.tab === s4 && l.active === z && tabTiles(l, s4).length === 2, 'add --tab --focus: shown, new tile active')
  await h.eventually(ctx, () => h.assertPtySizes(ctx)) // pty resizes are async
  await h.press(ctx, 'Meta+1')
  await h.waitFor(ctx, async () => (await list()).tab === s1, 'cmd+1: tab 1')

  // --swap, slot ↔ slot: places exchanged, sizes stay with the places, input unchanged.
  let s = await ctx.tie('state')
  const order = leafIds(s.tree)
  const sizes = JSON.stringify(s.tree.sizes)
  const act = s.active
  h.assert(order.length === 3 && order.includes(a) && order.includes(b) && order.includes(x), `s1 holds a, b, x (${order})`)
  await ctx.tie('move', a, '--swap', b)
  s = await ctx.tie('state')
  const want = order.map((id) => (id === a ? b : id === b ? a : id))
  h.assert(leafIds(s.tree).join() === want.join(), `swap a, b: ${leafIds(s.tree)} (want ${want})`)
  h.assert(JSON.stringify(s.tree.sizes) === sizes && s.active === act, 'swap: sizes kept, input unchanged')
  await h.eventually(ctx, () => h.assertPtySizes(ctx)) // pty resizes are async
  await ctx.shot('swapped')

  // --swap, shelved ↔ slotted: x takes a's slot, a goes to x's shelf place.
  await ctx.tie('move', x, '--shelve')
  s = await ctx.tie('state')
  const slotsBefore = leafIds(s.tree)
  await ctx.tie('move', x, '--swap', a)
  s = await ctx.tie('state')
  h.assert(s.shelf.join() === a, `shelf ↔ slot: a shelved (${s.shelf})`)
  h.assert(leafIds(s.tree).join() === slotsBefore.map((id) => (id === a ? x : id)).join(), `shelf ↔ slot: x in a's slot (${leafIds(s.tree)})`)

  // --swap --focus: the moved tile takes input.
  r = await ctx.tie('move', b, '--swap', x, '--focus')
  l = await list()
  h.assert(l.active === b && r.active, '--swap --focus: b active')

  // --swap across tabs: error, nothing moves.
  const st = JSON.stringify(await ctx.tie('state'))
  h.assert((await fails('move', b, '--swap', y))?.includes(`not in the same tab: ${y}`), '--swap across tabs: error')
  h.assert((await fails('move', b, '--swap', y, '--tab', s4))?.includes('--swap takes no placement'), '--swap + --tab rejected')
  h.assert(JSON.stringify(await ctx.tie('state')) === st, 'rejected swaps: no change')

  // Same tab: a board tile stays put; a shelved one comes back to the board (input stays).
  s = await ctx.tie('state')
  r = await ctx.tie('move', b, '--tab', s1)
  h.assert(JSON.stringify((await ctx.tie('state')).tree) === JSON.stringify(s.tree), 'same tab, board tile: no change')
  const act2 = (await list()).active
  r = await ctx.tie('move', a, '--tab', s1)
  l = await list()
  h.assert(r.state === 'slotted' && l.active === act2, `same tab, shelved tile: back on the board, input stays (${JSON.stringify(r)})`)
}
