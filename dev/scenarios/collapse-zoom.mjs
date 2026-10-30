// Collapse in col split (bar) and row split (vertical strip); zoom via button and double-click;
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
  await h.clickButton(ctx, c, 'zoom')
  h.assert((await h.list(ctx)).tiles.find((t) => t.id === c).zoomed, 'zoomed')
  await ctx.shot('zoomed')
  const p = await h.titlePoint(ctx, c)
  await ctx.page.mouse.dblclick(p.x, p.y)
  await h.eventually(ctx, async () => h.assert(!(await h.list(ctx)).tiles.find((t) => t.id === c).zoomed, 'dblclick unzooms'))

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
