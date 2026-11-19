// Group drag (SHELF.md "Group drag"): a drag starting on a selected shelf item moves the selection,
// in shelf order. Each target: preview = one rect per tile, exactly where it lands. Tile edge: the
// area one tile would take, split along its longer side (tall: stacked; wide: side by side);
// center: the nearest edge (no swap); empty board: fills it; strip: block reorder (order kept,
// width stable); tab: all join it; shift: floats cascade. After a drop: selection cleared, the
// first active. Escape cancels (nothing moves, selection kept). Drag of a non-selected item:
// de-selects, moves alone. Zoomed board (edge of the zoomed tile, a squashed bar) and a collapsed
// tile: nearest edge, the landing unzoomed (zoom ends), collapse kept. "+": a new tab with the group.
export default async (ctx, h) => {
  const page = ctx.page
  const L = () => h.list(ctx)
  const S = () => h.state(ctx)
  const away = async () => {
    await page.mouse.move(300, 300, { steps: 5 })
    await h.settle(ctx)
  }
  const add = async () => (await ctx.tie('add', 'terminal', '--shelved')).id
  const shelve = async (...ids) => {
    for (const id of ids) await ctx.tie('move', '--tile', id, '--shelve')
  }
  // The group's order: the shelf's.
  const inShelf = async (...ids) => (await L()).shelf.filter((id) => ids.includes(id))
  // Drop previews shown, in pool order (= the group's order).
  const previews = () =>
    page.$$eval('#preview, #preview2, .drop-preview', (els) =>
      els.filter((e) => getComputedStyle(e).display !== 'none').map((e) => {
        const r = e.getBoundingClientRect()
        return { x: r.x, y: r.y, w: r.width, h: r.height, float: e.classList.contains('float') }
      }),
    )
  const near = (p, r) => Math.abs(p.x - r.x) <= 1.5 && Math.abs(p.y - r.y) <= 1.5 && Math.abs(p.w - r.w) <= 1.5 && Math.abs(p.h - r.h) <= 1.5
  const fmt = (r) => r && `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}`
  // Group drag from `from` (a shelf item) to `to`; the previews seen mid-drag, a shot.
  const groupDrag = async (from, to, shot, o = {}) => {
    let seen
    await h.drag(ctx, await h.shelfItem(ctx, from), to, {
      ...o,
      during: async () => {
        seen = await previews()
        if (shot) await ctx.shot(shot)
      },
    })
    return seen
  }
  // After a drop: the tiles where their previews were, selection cleared, the first active.
  const landed = async (ids, seen, state, what) => {
    h.assert(seen.length === ids.length, `${what}: ${ids.length} previews (got ${seen.length})`)
    await h.eventually(ctx, async () => {
      const l = await L()
      ids.forEach((id, i) => {
        const t = l.tiles.find((t) => t.id === id)
        h.assert(t.state === state, `${what}: ${id} ${state} (${t.state})`)
        h.assert(near(seen[i], t.rect), `${what}: ${id} at its preview (${fmt(seen[i])} vs ${fmt(t.rect)})`)
      })
      h.assert(l.active === ids[0], `${what}: first active (${l.active})`)
      h.assert(!l.tiles.some((t) => t.selected), `${what}: selection cleared`)
    })
  }

  const [a] = (await L()).tiles.map((t) => t.id)
  await h.waitShell(ctx, a)
  const g1 = await add()
  const g2 = await add()
  const x = await add()
  const g3 = await add()
  await away()

  // Tile edge, tall area: right of a lone tile (its right half) → stacked, in shelf order (selected
  // and dragged from the last: order is the shelf's).
  await h.selectShelf(ctx, g2, g1)
  let seen = await groupDrag(g2, await h.sidePoint(ctx, a, 'r'), 'edge-tall')
  h.assert(seen.every((p) => !p.float) && seen[0].x === seen[1].x && seen[0].y < seen[1].y, `tall area: stacked previews (${seen.map(fmt)})`)
  await landed([g1, g2], seen, 'slotted', 'edge, tall area')
  const ra = await h.rectOf(ctx, a)
  h.assert(ra.w > ra.h / 2, 'a: its lower half is wide')

  // Tile edge, wide area: below a (the lower half of a) → side by side.
  await shelve(g1, g2)
  await away()
  await h.selectShelf(ctx, g1, g2, g3)
  let group = await inShelf(g1, g2, g3)
  seen = await groupDrag(g1, await h.sidePoint(ctx, a, 'b'), 'edge-wide')
  h.assert(seen.length === 3 && seen.every((p, i) => !i || (Math.abs(p.y - seen[0].y) < 1 && p.x > seen[i - 1].x)), `wide area: previews side by side (${seen.map(fmt)})`)
  h.assert(Math.abs(seen[0].w - seen[2].w) <= 1, 'even shares')
  await landed(group, seen, 'slotted', 'edge, wide area')

  // Center of a tile: the nearest edge (right of center: r), no swap.
  await shelve(g1, g2, g3)
  await away()
  const r0 = await h.rectOf(ctx, a)
  await h.selectShelf(ctx, g1, g2)
  seen = await groupDrag(g1, { x: r0.x + r0.w / 2 + 8, y: r0.y + r0.h / 2 }, 'center')
  h.assert(seen.length === 2 && !seen.some((p) => near(p, r0)), `center: no swap preview (${seen.map(fmt)})`)
  await landed([g1, g2], seen, 'slotted', 'center')
  const l = await L()
  h.assert(l.tiles.find((t) => t.id === a).state === 'slotted' && l.tiles.find((t) => t.id === a).rect.x === r0.x, 'center: a stays (no swap), group on its right')
  h.assert(seen[0].x > r0.x + r0.w / 3, 'center: right edge')

  // Empty board: the group fills it, split along its longer side (wide board: side by side).
  await shelve(g1, g2, a)
  await away()
  const board = (await L()).board
  await h.selectShelf(ctx, g1, g2)
  seen = await groupDrag(g1, await h.boardCenter(ctx), 'empty-board')
  h.assert(board.w > board.h && seen.length === 2 && Math.abs(seen[0].y - board.y) < 1 && seen[1].x > seen[0].x, `empty board: side by side (${seen.map(fmt)})`)
  h.assert(Math.abs(seen[0].x - board.x) < 1 && Math.abs(seen[1].x + seen[1].w - board.x - board.w) < 1, 'empty board: fills it')
  await landed([g1, g2], seen, 'slotted', 'empty board')
  await ctx.tie('move', '--tile', a, '--at', g2, '--side', 'r')

  // Strip: block reorder before the first item, order kept; the group's items hidden, one ghost
  // each, strip width stable. Shelf now: x g3 (+ g1 g2 shelved last).
  await shelve(g1, g2)
  await away()
  let shelf = (await L()).shelf
  h.assert(shelf.join() === [x, g3, g1, g2].join(), `shelf: ${shelf}`)
  await h.selectShelf(ctx, g3, g2)
  const w0 = (await h.boxOf(ctx, '#shelf')).box.width
  const first = (await h.shelfItem(ctx, x)).box
  await h.drag(ctx, await h.shelfItem(ctx, g2), { x: first.x + 4, y: first.y + first.height / 2 }, {
    during: async () => {
      h.assert((await page.locator('#shelf .item.ghost').count()) === 2, 'strip: two ghosts')
      h.assert(!(await page.isVisible(`.item[data-id="${g3}"]`)) && !(await page.isVisible(`.item[data-id="${g2}"]`)), 'strip: group items hidden')
      h.assert(Math.abs((await h.boxOf(ctx, '#shelf')).box.width - w0) < 1, 'strip: width stable over the strip')
      await ctx.shot('strip-block')
    },
  })
  await h.eventually(ctx, async () => {
    const l = await L()
    h.assert(l.shelf.join() === [g3, g2, x, g1].join(), `strip: block first, order kept (${l.shelf})`)
    h.assert(!l.tiles.some((t) => t.selected) && l.active === a, `strip: selection cleared, keys to the board (${l.active})`)
  })
  // Over the board the "+" hint stands for the hidden items: the width holds there too.
  await h.selectShelf(ctx, g3, g2)
  const w1 = (await h.boxOf(ctx, '#shelf')).box.width
  const pa = await h.sidePoint(ctx, a, 'c')
  const m = page.mouse
  const sp = await h.shelfItem(ctx, g3)
  await m.move(sp.x, sp.y)
  await m.down()
  await m.move(pa.x, pa.y, { steps: 12 })
  await h.settle(ctx)
  const w2 = (await h.boxOf(ctx, '#shelf')).box.width
  h.assert(Math.abs(w2 - w1) < 1, `board: strip width stable (wide "+" hint): ${w1} → ${w2}`)
  h.assert((await previews()).length === 2, 'board: two previews')
  await ctx.shot('ghost-label')
  // Escape cancels: nothing moves, the selection stays.
  const before = await S()
  await page.keyboard.press('Escape')
  await h.settle(ctx)
  h.assert((await previews()).length === 0, 'Escape: previews gone')
  await m.move(pa.x + 30, pa.y, { steps: 3 })
  await m.up()
  await ctx.sleep(200) // nothing happens: no drop after the cancel
  const after = await S()
  h.assert(JSON.stringify(after.tree) === JSON.stringify(before.tree) && after.shelf.join() === before.shelf.join(), 'Escape: nothing moved')
  h.assert([...after.selected].sort().join() === [g2, g3].sort().join(), `Escape: selection kept (${after.selected})`)

  // Drag of a non-selected item: de-selects, moves alone.
  await h.drag(ctx, await h.shelfItem(ctx, x), await h.sidePoint(ctx, a, 'b'))
  await h.eventually(ctx, async () => {
    const l = await L()
    h.assert(l.tiles.find((t) => t.id === x).state === 'slotted' && [g2, g3].every((id) => l.tiles.find((t) => t.id === id).state === 'shelved'), 'non-selected: x alone moved')
    h.assert(!l.tiles.some((t) => t.selected), 'non-selected: de-selected')
  })

  // Shift: floats cascade from the pointer (the first in front, the rest up-left behind it).
  await away()
  await h.selectShelf(ctx, g3, g2, g1)
  group = await inShelf(g1, g2, g3)
  seen = await groupDrag(g3, await h.boardCenter(ctx), 'floats', { shift: true })
  h.assert(seen.length === 3 && seen.every((p) => p.float), 'floats: three dashed previews')
  h.assert(seen[1].x < seen[0].x && seen[1].y < seen[0].y && seen[2].x < seen[1].x, `floats: cascade (${seen.map(fmt)})`)
  await landed(group, seen, 'floating', 'floats')
  h.assert((await S()).floats.at(-1).id === group[0], 'floats: the first on top')

  // Tab: all join it (as "Move N to tab"), the tab shown, the first active.
  await shelve(g3, g2, g1)
  const other = (await ctx.tie('add', 'terminal', '--tab', 'new')).id
  const tab2 = (await h.tileOf(ctx, other)).tab
  await ctx.tie('focus', '--tile', a)
  await h.waitActive(ctx, a)
  await away()
  await h.selectShelf(ctx, g1, g3)
  group = await inShelf(g1, g3)
  seen = await groupDrag(g1, await h.boxOf(ctx, `.tab[data-space="${tab2}"]`), 'tab')
  h.assert(seen.length === 0, 'tab: no board previews (the tab is marked)')
  await h.eventually(ctx, async () => {
    const l = await L()
    h.assert(l.tab === tab2 && [g1, g3].every((id) => { const t = l.tiles.find((t) => t.id === id); return t.tab === tab2 && t.state === 'slotted' }), 'tab: both joined tab 2, shown')
    h.assert(l.active === group[0] && !l.tiles.some((t) => t.selected), `tab: first active, selection cleared (${l.active})`)
    h.assert(l.tiles.find((t) => t.id === g2).tab !== tab2, 'tab: unselected g2 stayed')
  })

  const TITLE_MAX = 32 // a bar: title-bar thick
  // Zoomed board (tab 2: other | y, y zoomed). As a single drop: targets are the zoomed layout's
  // rects (the zoomed tile, squashed bars), the landing is unzoomed (the new tile is squashed:
  // activating it ends the zoom), the previews show that landing.
  await shelve(g1, g3)
  const y = (await ctx.tie('add', 'terminal', '--at', other, '--side', 'r')).id
  await h.clickButton(ctx, y, 'zoom')
  await h.eventually(ctx, async () => h.assert((await S()).zoomed === y, 'y zoomed'))
  await away()
  // Edge of the zoomed tile: below y.
  await h.selectShelf(ctx, g3, g1)
  group = await inShelf(g1, g3)
  seen = await groupDrag(g1, await h.sidePoint(ctx, y, 'b'), 'zoomed-edge')
  await landed(group, seen, 'slotted', 'zoomed: edge')
  h.assert(!(await S()).zoomed, 'zoomed edge: zoom ended')
  let ry = await h.rectOf(ctx, y)
  h.assert(seen.every((p) => p.y > ry.y + ry.h), `zoomed edge: below y (${seen.map(fmt)}; y ${fmt(ry)})`)
  // A squashed bar: no swap (a single tile would swap with it); its nearest edge, unzoomed.
  await shelve(g1, g3)
  await h.clickButton(ctx, y, 'zoom')
  await h.eventually(ctx, async () => h.assert((await S()).zoomed === y && (await h.rectOf(ctx, other)).w <= TITLE_MAX, 'y zoomed, other squashed'))
  await away()
  await h.selectShelf(ctx, g1, g3)
  const bar = await h.rectOf(ctx, other)
  seen = await groupDrag(g1, { x: bar.x + bar.w / 2 + 4, y: bar.y + bar.h / 2 }, 'zoomed-bar')
  await landed(group, seen, 'slotted', 'zoomed: squashed bar')
  h.assert(!(await S()).zoomed, 'squashed bar: zoom ended')
  let ro = await h.rectOf(ctx, other)
  ry = await h.rectOf(ctx, y)
  h.assert(ro.w > TITLE_MAX && seen[0].x > ro.x + ro.w && seen[0].x + seen[0].w < ry.x, `squashed bar: between other and y (${seen.map(fmt)}; other ${fmt(ro)}, y ${fmt(ry)})`)

  // Collapsed tile (other | y, y a collapsed strip): no swap either; its nearest edge (right), the
  // area measured with y collapsed. y stays collapsed.
  await shelve(g1, g3)
  await h.clickButton(ctx, y, 'collapse')
  await h.eventually(ctx, async () => h.assert((await h.rectOf(ctx, y)).w <= TITLE_MAX, 'y collapsed'))
  await away()
  await h.selectShelf(ctx, g1, g3)
  const strip = await h.rectOf(ctx, y)
  seen = await groupDrag(g1, { x: strip.x + strip.w / 2 + 4, y: strip.y + strip.h / 2 }, 'collapsed')
  await landed(group, seen, 'slotted', 'collapsed')
  const l2 = await L()
  h.assert(l2.tiles.find((t) => t.id === y).collapsed && l2.tiles.find((t) => t.id === y).rect.w <= TITLE_MAX, 'collapsed: y stays collapsed')
  ro = l2.tiles.find((t) => t.id === y).rect
  h.assert(seen.every((p) => p.x > ro.x + ro.w), `collapsed: right of y (${seen.map(fmt)}; y ${fmt(ro)})`)

  // "+": a new tab holding the group (as "Move N to tab ▸ New tab"), shown, the first active.
  await shelve(g1, g3)
  await away()
  const tabs0 = (await L()).tabs.map((t) => t.id)
  await h.selectShelf(ctx, g3, g1)
  await h.drag(ctx, await h.shelfItem(ctx, g1), await h.boxOf(ctx, '#tab-add'), {
    during: async () => {
      h.assert((await previews()).length === 0 && (await page.$eval('#tab-add', (e) => e.classList.contains('drop'))), '+: marked, no board previews')
      await ctx.shot('tab-add')
    },
  })
  await h.eventually(ctx, async () => {
    const l = await L()
    const tab3 = l.tab
    h.assert(l.tabs.length === tabs0.length + 1 && !tabs0.includes(tab3), `+: a new tab, shown (${l.tabs.map((t) => t.id)})`)
    h.assert(l.tiles.filter((t) => t.tab === tab3).map((t) => t.id).sort().join() === [g1, g3].sort().join(), '+: it holds just the group')
    h.assert([g1, g3].every((id) => l.tiles.find((t) => t.id === id).state === 'slotted'), '+: slotted')
    h.assert(l.active === group[0] && !l.tiles.some((t) => t.selected), `+: first active, selection cleared (${l.active})`)
    h.assert([other, y].every((id) => l.tiles.find((t) => t.id === id).tab === tab2), '+: tab 2 keeps other, y')
  })
  h.assert(!(await page.$eval('#tab-add', (e) => e.classList.contains('drop'))), '+: drop mark cleared')
}
