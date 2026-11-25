// Edit layout mode labels by bar size: always inside their component's box with room around the chip (never past it), centred; shrunk then truncated where the box is small (an empty or one-item shelf), full size where they fit; horizontal bars at 40 / 50 / 60 (empty and one-item shelf); side bar at 40 / 60 / 99 / 100 / 160 (empty and one item): rotated where that fits them better, across in the list form; light theme.
const E = () => ({ start: [], end: [] })
const layout = (patch) => ({ top: E(), bottom: E(), left: E(), right: E(), ...patch })

export default async (ctx, h) => {
  const page = ctx.page
  const check = async (what) => {
    await h.editLayout(ctx)
    const labels = await h.checkLabels(ctx, what)
    await ctx.shot(what)
    await page.locator('#layout-edit .le-cancel').click()
    await page.keyboard.press('Escape')
    await page.waitForSelector('.settings', { state: 'detached' })
    return Object.fromEntries(labels.map((l) => [l.c, l]))
  }

  // Bottom bar (default layout), empty shelf (one slot, feel round 6): tabs and templates labels
  // full size at every size; the shelf's shrunk, as with one item (below).
  for (const size of [40, 50, 60]) {
    await h.setBarSize(ctx, 'bottom', size)
    const l = await check(`bottom-${size}-empty`)
    for (const c of ['tabs', 'templates']) h.assert(l[c].ls === 1 && !l[c].cut, `bottom ${size}: ${c} label full size (${l[c].ls})`)
    h.assert(l.shelf.ls < 1, `bottom ${size}, empty: the shelf label shrunk (${l.shelf.ls})`)
  }
  // One item: the shelf is shorter than its label: shrunk, then cut, never past the shelf's box.
  const one = (await ctx.tie('add', 'terminal', '--shelved')).id
  await h.waitTile(ctx, one)
  for (const size of [40, 50, 60]) {
    await h.setBarSize(ctx, 'bottom', size)
    const l = await check(`bottom-${size}-one-item`)
    h.assert(l.shelf.ls < 1, `bottom ${size}, one item: the shelf label shrunk (${l.shelf.ls})`)
  }
  await h.setBarSize(ctx, 'bottom', null)

  // Side bar: tabs bottom, shelf and templates left. One item, then empty.
  await h.setBars(ctx, layout({ bottom: { start: ['tabs'], end: [] }, left: { start: [], end: ['shelf', 'templates'] } }))
  for (const shelf of ['one-item', 'empty']) {
    if (shelf === 'empty') {
      await ctx.tie('close', '--tile', one)
      await h.waitGone(ctx, one)
    }
    for (const w of [40, 60, 99, 100, 160]) {
      await h.setBarSize(ctx, 'left', w)
      const l = await check(`left-${w}-${shelf}`)
      if (w <= 60) h.assert(l.templates.rotated, `left ${w}: Templates rotated (too long across)`)
      else if (w === 99) h.assert(!l.templates.rotated && l.templates.ls === 1, `left 99 (narrow, 1.5x): Templates fits across, full size`)
      else h.assert(!l.shelf.rotated && !l.templates.rotated && l.shelf.ls === 1 && l.templates.ls === 1, `left ${w}: list form: across, full size`)
      // The shelf one item long (empty or not): across, where it is largest; at 40 cut ("S…"), as a
      // one-item shelf in a 40 px top / bottom bar (same box).
      if (w === 40) h.assert(!l.shelf.rotated && l.shelf.ls < 1, `left 40, ${shelf}: Shelf across, shrunk (--ls ${l.shelf.ls})`)
    }
  }

  // Light theme, the side layout at 40 with an item: drawn on the light palette.
  const two = (await ctx.tie('add', 'terminal', '--shelved')).id
  await h.waitTile(ctx, two)
  await h.setBars(ctx, layout({ top: { start: ['tabs'], end: [] }, left: { start: [], end: ['shelf', 'templates'] } }), { theme: 'solarized-light' })
  await h.setBarSize(ctx, 'left', 40)
  await check('left-40-light')
}
