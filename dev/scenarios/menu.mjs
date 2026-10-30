// Right-click title: rename + set icon, from board and shelf; keyboard focus returns to the terminal.
export default async (ctx, h) => {
  const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
  const p = await h.titlePoint(ctx, a)
  await ctx.page.mouse.click(p.x, p.y, { button: 'right' })
  await ctx.shot('menu')
  await ctx.page.locator('.menu-item', { hasText: 'Rename' }).click()
  await ctx.page.keyboard.type('my server')
  await ctx.page.keyboard.press('Enter')
  const focused = () => ctx.page.evaluate(() => document.activeElement?.closest('.tile')?.dataset.id ?? document.activeElement?.tagName)
  h.assert((await focused()) === a, `terminal refocused after rename: ${await focused()}`)
  await ctx.page.mouse.click(p.x, p.y, { button: 'right' })
  await ctx.page.locator('.menu-item', { hasText: 'Set icon' }).click()
  await ctx.page.keyboard.type('🚀')
  await ctx.page.keyboard.press('Enter')
  await h.eventually(ctx, async () => {
    const t = (await h.list(ctx)).tiles[0]
    h.assert(t.title === 'my server' && t.icon === '🚀', 'renamed + icon')
  })
  await ctx.tie('move', '--tile', a, '--shelve')
  await ctx.shot('shelved-custom')

  // A dialog (close a busy tile, cancelled) gives focus back too.
  const busy = (await ctx.tie('add', 'terminal', '--cmd', 'sleep 30', '--focus')).id
  await h.waitTile(ctx, busy, (t) => t.term?.pid, 'cmd started')
  await h.press(ctx, 'Meta+w')
  await ctx.page.waitForSelector('.dialog')
  await ctx.page.keyboard.press('Escape')
  const act = (await h.list(ctx)).active
  h.assert(act && (await focused()) === act, `terminal refocused after dialog: ${await focused()}`)
}
