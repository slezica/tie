// Right-click title: rename + set icon, from board and shelf.
export default async (ctx, h) => {
  const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
  const p = await h.titlePoint(ctx, a)
  await ctx.page.mouse.click(p.x, p.y, { button: 'right' })
  await ctx.shot('menu')
  await ctx.page.locator('.menu-item', { hasText: 'Rename' }).click()
  await ctx.page.keyboard.type('my server')
  await ctx.page.keyboard.press('Enter')
  await ctx.page.mouse.click(p.x, p.y, { button: 'right' })
  await ctx.page.locator('.menu-item', { hasText: 'Set icon' }).click()
  await ctx.page.keyboard.type('🚀')
  await ctx.page.keyboard.press('Enter')
  await ctx.sleep(100)
  const t = (await h.list(ctx)).tiles[0]
  h.assert(t.title === 'my server' && t.icon === '🚀', 'renamed + icon')
  await ctx.tie('move', a, '--shelve')
  await ctx.shot('shelved-custom')
}
