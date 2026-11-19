// Collapse in col split (bar) and row split (vertical strip); zoom via button and double-click:
// the other slotted tiles squashed to bars (their own collapse kept for after), floats stay;
// floating zoom covers the board; zooming a collapsed tile expands it; keys never go to a hidden tile.
export default async (ctx, h) => {
  const [a, b, c] = await h.threeWaySplit(ctx)
  await h.clickButton(ctx, b, 'collapse')
  let l = await h.list(ctx)
  h.assert(l.tiles.find((t) => t.id === b).collapsed, 'b collapsed')
  h.assert((await h.rectOf(ctx, b)).h <= 32, 'horizontal bar')
  await ctx.shot('collapsed-horizontal')
  await h.clickButton(ctx, a, 'collapse')
  h.assert((await h.rectOf(ctx, a)).w <= 32, 'vertical strip')
  await ctx.shot('collapsed-vertical')
  // Click on collapsed bar expands.
  const ra = await h.rectOf(ctx, a)
  await ctx.page.mouse.click(ra.x + ra.w / 2, ra.y + 200)
  await h.eventually(ctx, async () => h.assert(!(await h.list(ctx)).tiles.find((t) => t.id === a).collapsed, 'click expands'))
  // Zoom c (a | b over c; b collapsed by the user): a becomes a strip on the left, b stays a bar, c
  // takes the rest; nothing is hidden. A float stays above, and activating it keeps the zoom.
  const info = async (id) => (await h.list(ctx)).tiles.find((t) => t.id === id)
  const cls = (id) => ctx.page.$eval(`.tile[data-id="${id}"]`, (e) => e.className)
  const fl = (await ctx.tie('add', 'terminal', '--float')).id
  await h.settle(ctx)
  const before = { a: await h.rectOf(ctx, a), c: await h.rectOf(ctx, c) }
  await h.clickButton(ctx, c, 'zoom')
  h.assert((await info(c)).zoomed, 'zoomed')
  await h.eventually(ctx, async () => {
    const [ra, rb, rc] = [await h.rectOf(ctx, a), await h.rectOf(ctx, b), await h.rectOf(ctx, c)]
    h.assert(ra.w <= 32 && ra.h === before.a.h && rb.h <= 32, `a: strip, b: bar ${JSON.stringify([ra, rb])}`)
    h.assert(rc.w > before.c.w && rc.h === before.c.h && rc.x > ra.x, `c takes the rest ${JSON.stringify(rc)}`)
    h.assert(/collapsed-v/.test(await cls(a)) && /collapsed-h/.test(await cls(b)) && !/collapsed/.test(await cls(c)), 'bars look collapsed')
  })
  h.assert(!(await info(a)).collapsed && (await info(b)).collapsed, 'collapse state untouched by the zoom')
  h.assert(!(await ctx.page.isVisible(`.tile[data-id="${a}"] .btn.collapse`)) && (await ctx.page.isVisible(`.tile[data-id="${fl}"]`)), 'squashed: no collapse button; float visible')
  await ctx.shot('zoomed')
  await ctx.tie('focus', '--tile', fl)
  h.assert((await h.state(ctx)).zoomed === c, 'activating a float keeps the zoom')
  // Zoom button on a squashed bar: the zoom moves there.
  await h.clickButton(ctx, a, 'zoom')
  await h.eventually(ctx, async () => h.assert((await h.state(ctx)).zoomed === a && (await h.rectOf(ctx, c)).w <= 32 && (await h.rectOf(ctx, b)).w <= 32, 'zoom moved to a: b, c share one strip'))
  await h.clickButton(ctx, a, 'zoom') // off
  // Close on a squashed bar: closes it, the zoom stays.
  const y = (await ctx.tie('add', 'terminal', '--at', a, '--side', 'l')).id
  await h.waitShell(ctx, y)
  await h.clickButton(ctx, c, 'zoom')
  await h.clickButton(ctx, y, 'close')
  await h.waitGone(ctx, y)
  h.assert((await h.state(ctx)).zoomed === c, 'closing a squashed tile keeps the zoom')
  await ctx.tie('close', '--tile', fl)
  await ctx.tie('focus', '--tile', c)
  const p = await h.titlePoint(ctx, c)
  await ctx.page.mouse.dblclick(p.x, p.y)
  await h.eventually(ctx, async () => h.assert(!(await info(c)).zoomed, 'dblclick unzooms'))
  await h.eventually(ctx, async () => {
    const ra = await h.rectOf(ctx, a)
    h.assert(ra.w === before.a.w && (await h.rectOf(ctx, b)).h <= 32, `unzoom: a back, b still collapsed ${JSON.stringify(ra)}`)
  })
  // Click on a squashed bar: unzooms, that tile active.
  await h.clickButton(ctx, c, 'zoom')
  const pa = await h.titlePoint(ctx, a)
  await ctx.page.mouse.click(pa.x, pa.y)
  await h.eventually(ctx, async () => {
    const s = await h.state(ctx)
    h.assert(!s.zoomed && s.active === a, `click on a bar unzooms (zoomed=${s.zoomed}, active=${s.active})`)
  })

  // A newly active board tile is never left under a zoomed one.
  await h.clickButton(ctx, c, 'zoom')
  await h.press(ctx, 'Meta+d')
  await h.eventually(ctx, async () => {
    const s = await h.state(ctx)
    h.assert(s.active !== c && !s.zoomed, `split while zoomed unzooms (zoomed=${s.zoomed}, active=${s.active})`)
  })
  await h.clickButton(ctx, a, 'zoom')
  await ctx.tie('focus', '--tile', b)
  h.assert(!(await h.state(ctx)).zoomed, 'tie focus unzooms')

  // Floating zoom: the float covers the board, nothing squashed; activating a board tile (focus
  // key) ends it, the float back to its own rect.
  const near = (p, r) => Math.abs(p.x - r.x) < 2 && Math.abs(p.y - r.y) < 2 && Math.abs(p.w - r.w) < 2 && Math.abs(p.h - r.h) < 2
  const g = (await ctx.tie('add', 'terminal', '--float', '--focus')).id
  await h.waitShell(ctx, g)
  const rg0 = await h.rectOf(ctx, g)
  const ra0 = await h.rectOf(ctx, a)
  await h.clickButton(ctx, g, 'zoom')
  const board = (await h.list(ctx)).board
  await h.eventually(ctx, async () => {
    const s = await h.state(ctx)
    h.assert(s.zoomed === g && s.active === g, `float zoomed + active (zoomed=${s.zoomed}, active=${s.active})`)
    h.assert(near(await h.rectOf(ctx, g), board), `zoomed float covers the board ${JSON.stringify(await h.rectOf(ctx, g))}`)
    h.assert(near(await h.rectOf(ctx, a), ra0) && !/collapsed/.test(await cls(a)), 'board tiles not squashed')
  })
  await ctx.shot('float-zoomed')
  await h.press(ctx, 'Meta+ArrowLeft') // from the board-sized float: a, the only tile left of center
  await h.eventually(ctx, async () => {
    const s = await h.state(ctx)
    h.assert(s.active === a && !s.zoomed, `board tile activated: zoom ends (zoomed=${s.zoomed}, active=${s.active})`)
    h.assert(near(await h.rectOf(ctx, g), rg0), 'float back to its rect')
  })
  await ctx.tie('close', '--tile', g)
  await h.waitGone(ctx, g)

  // Zooming a collapsed tile clears its collapse; unzoomed, it stays expanded.
  await h.clickButton(ctx, b, 'collapse') // (tie focus above expanded it)
  h.assert((await h.state(ctx)).collapsed.includes(b), 'b collapsed')
  await h.clickButton(ctx, b, 'zoom')
  await h.eventually(ctx, async () => {
    const s = await h.state(ctx)
    h.assert(s.zoomed === b && s.active === b && !s.collapsed.includes(b), `collapsed b zoomed, collapse cleared (${JSON.stringify(s.collapsed)})`)
    h.assert((await h.rectOf(ctx, b)).h > 100 && !/collapsed/.test(await cls(b)), 'b full size')
  })
  await h.clickButton(ctx, b, 'zoom') // off
  await h.eventually(ctx, async () => {
    const s = await h.state(ctx)
    h.assert(!s.zoomed && !s.collapsed.includes(b) && (await h.rectOf(ctx, b)).h > 100, `unzoomed b stays expanded (${JSON.stringify(await h.rectOf(ctx, b))})`)
  })

  // Focusing a collapsed tile: keys must not keep going to the previous terminal.
  const x = (await ctx.tie('add', 'terminal', '--at', a, '--side', 'r')).id
  await h.waitShell(ctx, x)
  await h.clickButton(ctx, x, 'collapse')
  await ctx.tie('focus', '--tile', a)
  await h.press(ctx, 'Meta+ArrowRight')
  await h.eventually(ctx, async () => h.assert((await h.list(ctx)).active === x, 'collapsed tile active'))
  // refocus blurs (a collapsed tile takes no keys): nothing inside a tile keeps the focus.
  await h.eventually(ctx, async () => h.assert((await h.focused(ctx)) === 'BODY', `keys go nowhere, not to a (focus: ${await h.focused(ctx)})`))

  // A collapsed tile left alone on the board drops its collapse (fresh tab: just its terminal).
  await h.press(ctx, 'Meta+t')
  await h.waitFor(ctx, async () => (await h.list(ctx)).tabs.length === 2, 'new tab')
  const lone = (await h.list(ctx)).active
  const q = (await ctx.tie('add', 'terminal', '--at', lone, '--side', 'r')).id
  await h.settle(ctx)
  await h.clickButton(ctx, lone, 'collapse')
  h.assert((await h.state(ctx)).collapsed.includes(lone), 'precondition: lone collapsed beside q')
  await ctx.tie('close', '--tile', q)
  h.assert(!(await h.state(ctx)).collapsed.includes(lone), 'sole tile not collapsed')
  await ctx.tie('add', 'terminal', '--at', lone, '--side', 'r')
  await h.eventually(ctx, async () => h.assert((await h.rectOf(ctx, lone)).w > 100, 'stays expanded on next split'))
}
