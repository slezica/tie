// Edit layout mode labels by bar size: inside their components (centred, never past the bar), apart; an empty shelf holds its label; a one-item shelf's label overhangs it; rotated in a narrow side bar (48 px), across from where they fit; horizontal bars at 32 / 40 / 60; light theme.
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
  const inside = (p, q) => p.left >= q.left - 0.5 && p.right <= q.right + 0.5 && p.top >= q.top - 0.5 && p.bottom <= q.bottom + 0.5

  // Bottom bar (default layout), empty shelf: every label inside its component at each size.
  for (const size of [32, 40, 60]) {
    await h.setBarSize(ctx, 'bottom', size)
    const l = await check(`bottom-${size}-empty`)
    for (const c of ['tabs', 'shelf', 'templates']) h.assert(inside(l[c].r, l[c].comp) && !l[c].rotated, `bottom ${size}: ${c} label inside, not rotated`)
  }
  // One item: the shelf is shorter than its label, which overhangs it, centred, inside the bar.
  const one = (await ctx.tie('add', 'terminal', '--shelved')).id
  await h.waitTile(ctx, one)
  await h.setBarSize(ctx, 'bottom', 32)
  const l1 = await check('bottom-32-one-item')
  h.assert(l1.shelf.r.width > l1.shelf.comp.width, 'one item: the shelf label longer than the shelf')
  await h.setBarSize(ctx, 'bottom', null)
  await ctx.tie('close', '--tile', one)
  await h.waitGone(ctx, one)

  // Side bar: tabs top, shelf and templates left. Narrow (48): rotated; wider: across.
  await h.setBars(ctx, layout({ top: { start: ['tabs'], end: [] }, left: { start: [], end: ['shelf', 'templates'] } }))
  for (const [w, rotated] of [[48, true], [73, true], [100, false], [160, false]]) {
    await h.setBarSize(ctx, 'left', w)
    const l = await check(`left-${w}-empty`)
    for (const c of ['shelf', 'templates']) {
      h.assert(l[c].rotated === rotated, `left ${w}: ${c} label ${rotated ? '' : 'not '}rotated`)
      h.assert(inside(l[c].r, l[c].comp), `left ${w}: ${c} label inside its component`)
    }
  }

  // Light theme, the side layout at 48 with an item: drawn on the light palette.
  const two = (await ctx.tie('add', 'terminal', '--shelved')).id
  await h.waitTile(ctx, two)
  await h.setBars(ctx, layout({ top: { start: ['tabs'], end: [] }, left: { start: [], end: ['shelf', 'templates'] } }), { theme: 'solarized-light' })
  await h.setBarSize(ctx, 'left', 48)
  await check('left-48-light')
}
