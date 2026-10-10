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
  await ctx.sleep(150)
  h.assert(!(await h.list(ctx)).tiles.find((t) => t.id === a).collapsed, 'click expands')
  await h.clickButton(ctx, c, 'zoom')
  h.assert((await h.list(ctx)).tiles.find((t) => t.id === c).zoomed, 'zoomed')
  await ctx.shot('zoomed')
  const p = await h.titlePoint(ctx, c)
  await ctx.page.mouse.dblclick(p.x, p.y)
  await ctx.sleep(150)
  h.assert(!(await h.list(ctx)).tiles.find((t) => t.id === c).zoomed, 'dblclick unzooms')

  // A newly active board tile is never left under a zoomed one.
  await h.clickButton(ctx, c, 'zoom')
  await ctx.page.keyboard.press('Meta+d')
  await ctx.sleep(1200)
  let s = await ctx.tie('state')
  h.assert(s.active !== c && !s.zoomed, `split while zoomed unzooms (zoomed=${s.zoomed}, active=${s.active})`)
  await h.clickButton(ctx, a, 'zoom')
  await ctx.tie('focus', b)
  h.assert(!(await ctx.tie('state')).zoomed, 'tie focus unzooms')

  // Focusing a collapsed tile: keys must not keep going to the previous terminal.
  const txt = (id) => ctx.page.$eval(`.tile[data-id="${id}"] .xterm-rows`, (e) => e.textContent)
  const x = (await ctx.tie('open', 'terminal', '--at', a, '--side', 'r')).id
  await ctx.sleep(800)
  await h.clickButton(ctx, x, 'collapse')
  await ctx.tie('focus', a)
  await ctx.page.keyboard.press('Meta+ArrowRight')
  await ctx.sleep(200)
  h.assert((await h.list(ctx)).active === x, 'collapsed tile active')
  await ctx.page.keyboard.type('echo TYPED_INTO\n')
  await ctx.sleep(500)
  h.assert(!(await txt(a)).includes('TYPED_INTO'), 'keys not sent to previous tile')
}
