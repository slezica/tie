// Edit layout mode labels (feel round 8): every label whole (full size, not cut), inside its component's box with room around the chip, centred; components grown along their bar to the label plus 6 px each side, never overlapping; tabs, shelf (empty and one item) and templates in each bar at 40 and 60, a side bar at 99 and 160; side bars rotate their labels below the longest one's width (40, 60), across at 99 and 160; leaving the mode gives every component its pre-mode box back (no leftover style); a bar too full to grow its components: labels shrink, then cut, still inside their component and bar; light theme.
const E = () => ({ start: [], end: [] })
const layout = (patch) => ({ top: E(), bottom: E(), left: E(), right: E(), ...patch })
const COMPONENTS = ['tabs', 'shelf', 'templates']

export default async (ctx, h) => {
  const page = ctx.page
  // Each component's box as laid out (tabs: with the brand), and whether it carries a mode style.
  const boxes = () =>
    page.evaluate((cs) => {
      const union = (rs) => {
        rs = rs.filter((x) => x.width > 0 && x.height > 0)
        const left = Math.min(...rs.map((x) => x.left))
        const top = Math.min(...rs.map((x) => x.top))
        return { left, top, width: Math.max(...rs.map((x) => x.right)) - left, height: Math.max(...rs.map((x) => x.bottom)) - top }
      }
      return Object.fromEntries(cs.map((c) => [c, { ...union((c === 'tabs' ? ['brand', 'tabs'] : [c]).map((id) => document.getElementById(id).getBoundingClientRect())), styled: !!document.getElementById(c).style.getPropertyValue('--le-min') }]))
    }, COMPONENTS)
  const check = async (what, opts) => {
    const before = await boxes()
    await h.editLayout(ctx)
    const labels = await h.checkLabels(ctx, what, opts)
    await ctx.shot(what)
    await page.locator('#layout-edit .le-cancel').click()
    await page.keyboard.press('Escape')
    await page.waitForSelector('.settings', { state: 'detached' })
    await h.settle(ctx)
    const after = await boxes()
    for (const c of COMPONENTS) {
      h.assert(!after[c].styled, `${what}: ${c} has no mode style after the mode`)
      for (const k of ['left', 'top', 'width', 'height']) h.assert(Math.abs(after[c][k] - before[c][k]) <= 0.5, `${what}: ${c} back to its pre-mode box (${k}: ${after[c][k]} vs ${before[c][k]})`)
    }
    return Object.fromEntries(labels.map((l) => [l.c, l]))
  }

  // All three in one bar (tabs at the start, shelf and templates at the end: the divider), each bar
  // at 40 and 60, empty shelf then one item. Side bars also at 99 (narrow, widest) and 160 (list).
  for (const shelf of ['empty', 'one-item']) {
    if (shelf === 'one-item') {
      await h.waitTile(ctx, (await ctx.tie('add', 'terminal', '--shelved')).id)
    }
    for (const bar of ['bottom', 'top', 'left', 'right']) {
      const v = bar === 'left' || bar === 'right'
      await h.setBars(ctx, layout({ [bar]: { start: ['tabs'], end: ['shelf', 'templates'] } }))
      for (const size of v ? [40, 60, 99, 160] : [40, 60]) {
        await h.setBarSize(ctx, bar, size)
        const l = await check(`${bar}-${size}-${shelf}`)
        // One look per side bar: rotated where the longest label ("Templates") doesn't fit across.
        if (v) for (const c of COMPONENTS) h.assert(l[c].rotated === size <= 60, `${bar} ${size}: ${c} ${size <= 60 ? 'rotated' : 'across'} (${l[c].rotated})`)
      }
      await h.setBarSize(ctx, bar, null)
    }
  }

  // A bar too full to grow its components (a short window, all three in a 40 px left bar): no
  // growth there; labels shrink, then cut, inside their components and the bar.
  const win = await page.evaluate(() => ({ w: outerWidth, h: outerHeight }))
  await h.setBars(ctx, layout({ left: { start: ['tabs'], end: ['shelf', 'templates'] } }))
  await h.setBarSize(ctx, 'left', 40)
  await h.resizeWindow(ctx, 600, 250)
  const crowded = await check('left-40-crowded', { crowded: true })
  h.assert(Object.values(crowded).some((l) => l.ls < 1), `crowded: some label shrunk (${COMPONENTS.map((c) => crowded[c].ls)})`)
  await h.resizeWindow(ctx, win.w, win.h)
  await h.setBarSize(ctx, 'left', null)

  // Light theme, the side layout at 40 with an item: drawn on the light palette.
  await h.setBars(ctx, layout({ top: { start: ['tabs'], end: [] }, left: { start: [], end: ['shelf', 'templates'] } }), { theme: 'solarized-light' })
  await h.setBarSize(ctx, 'left', 40)
  await check('left-40-light')
}
