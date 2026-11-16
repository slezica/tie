// Collapse in col split (bar) and row split (vertical strip); zoom via button and double-click:
// the other slotted tiles squashed to bars (their own collapse kept for after), floats stay;
// keys always go to a visible active tile.
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
  h.assert((await ctx.tie('state')).zoomed === c, 'activating a float keeps the zoom')
  // Zoom button on a squashed bar: the zoom moves there.
  await h.clickButton(ctx, a, 'zoom')
  await h.eventually(ctx, async () => h.assert((await ctx.tie('state')).zoomed === a && (await h.rectOf(ctx, c)).w <= 32 && (await h.rectOf(ctx, b)).w <= 32, 'zoom moved to a: b, c share one strip'))
  await h.clickButton(ctx, a, 'zoom') // off
  // Close on a squashed bar: closes it, the zoom stays.
  const y = (await ctx.tie('add', 'terminal', '--at', a, '--side', 'l')).id
  await h.waitShell(ctx, y)
  await h.clickButton(ctx, c, 'zoom')
  await h.clickButton(ctx, y, 'close')
  await h.waitGone(ctx, y)
  h.assert((await ctx.tie('state')).zoomed === c, 'closing a squashed tile keeps the zoom')
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
    const s = await ctx.tie('state')
    h.assert(!s.zoomed && s.active === a, `click on a bar unzooms (zoomed=${s.zoomed}, active=${s.active})`)
  })

  // A newly active board tile is never left under a zoomed one.
  await h.clickButton(ctx, c, 'zoom')
  await h.press(ctx, 'Meta+d')
  await h.eventually(ctx, async () => {
    const s = await ctx.tie('state')
    h.assert(s.active !== c && !s.zoomed, `split while zoomed unzooms (zoomed=${s.zoomed}, active=${s.active})`)
  })
  await h.clickButton(ctx, a, 'zoom')
  await ctx.tie('focus', '--tile', b)
  h.assert(!(await ctx.tie('state')).zoomed, 'tie focus unzooms')

  // Focusing a collapsed tile: keys must not keep going to the previous terminal.
  const txt = (id) => ctx.page.$eval(`.tile[data-id="${id}"] .xterm-rows`, (e) => e.textContent)
  const x = (await ctx.tie('add', 'terminal', '--at', a, '--side', 'r')).id
  await h.waitShell(ctx, x)
  await h.clickButton(ctx, x, 'collapse')
  await ctx.tie('focus', '--tile', a)
  await h.press(ctx, 'Meta+ArrowRight')
  await h.eventually(ctx, async () => h.assert((await h.list(ctx)).active === x, 'collapsed tile active'))
  await ctx.page.keyboard.type('echo TYPED_INTO\n')
  await h.waitText(ctx, x, 'TYPED_INTO').catch(() => null) // where the keys belong; then: not in a
  h.assert(!(await txt(a)).includes('TYPED_INTO'), 'keys not sent to previous tile')

  // A collapsed tile left alone on the board drops its collapse (fresh tab: just its terminal).
  await h.press(ctx, 'Meta+t')
  await h.waitFor(ctx, async () => (await h.list(ctx)).tabs.length === 2, 'new tab')
  const lone = (await h.list(ctx)).active
  const q = (await ctx.tie('add', 'terminal', '--at', lone, '--side', 'r')).id
  await h.settle(ctx)
  await h.clickButton(ctx, lone, 'collapse')
  await ctx.tie('close', '--tile', q)
  h.assert(!(await ctx.tie('state')).collapsed.includes(lone), 'sole tile not collapsed')
  await ctx.tie('add', 'terminal', '--at', lone, '--side', 'r')
  await h.eventually(ctx, async () => h.assert((await h.rectOf(ctx, lone)).w > 100, 'stays expanded on next split'))
}
