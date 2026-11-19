// Right-click title: rename + set icon (empty = automatic), reset; also on a shelf item; Escape / outside click
// close it; keyboard focus returns to the terminal.
export default async (ctx, h) => {
  const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
  const p = await h.titlePoint(ctx, a)
  const meta = async (id) => { const t = await h.tileOf(ctx, id); return { title: t.title, icon: t.icon } }
  const menuOpen = () => ctx.page.isVisible('.menu')
  const openOn = async (at) => {
    await ctx.page.mouse.click(at.x, at.y, { button: 'right' })
    await ctx.page.waitForSelector('.menu')
  }
  const choose = (label) => ctx.page.locator('.menu-item', { hasText: label }).click()
  await ctx.page.mouse.click(p.x, p.y, { button: 'right' })
  await ctx.shot('menu')
  await ctx.page.locator('.menu-item', { hasText: 'Rename' }).click()
  await ctx.page.keyboard.type('my server')
  await ctx.page.keyboard.press('Enter')
  h.assert((await h.focused(ctx)) === a, `terminal refocused after rename: ${await h.focused(ctx)}`)
  await ctx.page.mouse.click(p.x, p.y, { button: 'right' })
  await ctx.page.locator('.menu-item', { hasText: 'Set icon' }).click()
  await ctx.page.keyboard.type('🚀')
  await ctx.page.keyboard.press('Enter')
  await h.eventually(ctx, async () => {
    const t = (await h.list(ctx)).tiles[0]
    h.assert(t.title === 'my server' && t.icon === '🚀', 'renamed + icon')
  })

  // Closing without a choice: Escape, a click outside; Escape in the rename field: nothing renamed.
  await openOn(p)
  await ctx.page.keyboard.press('Escape')
  await h.waitFor(ctx, async () => !(await menuOpen()), 'Escape closes the menu')
  await openOn(p)
  const rb = (await h.list(ctx)).board
  await ctx.page.mouse.click(rb.x + rb.w / 2, rb.y + rb.h / 2) // a's body
  await h.waitFor(ctx, async () => !(await menuOpen()), 'outside click closes the menu')
  await openOn(p)
  await choose('Rename')
  await ctx.page.keyboard.type('discarded')
  await ctx.page.keyboard.press('Escape')
  await h.waitFor(ctx, async () => !(await menuOpen()), 'Escape closes the rename field')
  h.assert((await meta(a)).title === 'my server', 'Escape: title kept')
  h.assert((await h.focused(ctx)) === a, `terminal refocused after Escape: ${await h.focused(ctx)}`)

  // Empty rename: back to the automatic title (the icon stays).
  await openOn(p)
  await choose('Rename')
  await ctx.page.keyboard.press('Backspace') // the field starts selected
  await ctx.page.keyboard.press('Enter')
  // (The automatic title itself may change meanwhile: the folder, then the shell's name.)
  await h.eventually(ctx, async () => {
    const m = await meta(a)
    h.assert(m.title && m.title !== 'my server' && m.icon === '🚀', `empty rename: automatic title (${JSON.stringify(m)})`)
  })

  // On a shelf item: the same menu. Rename, then reset title & icon.
  await ctx.tie('move', '--tile', a, '--shelve')
  await ctx.shot('shelved-custom')
  const item = await h.shelfItem(ctx, a)
  await openOn(item)
  await choose('Rename')
  await ctx.page.keyboard.type('parked')
  await ctx.page.keyboard.press('Enter')
  await h.eventually(ctx, async () => {
    h.assert((await meta(a)).title === 'parked', 'renamed from the shelf')
    h.assert((await ctx.page.getAttribute(`.item[data-id="${a}"]`, 'title')) === 'parked', 'shelf item tooltip follows')
  })
  await openOn(item)
  await choose('Reset title & icon')
  await h.eventually(ctx, async () => {
    const m = await meta(a)
    h.assert(m.title && m.title !== 'parked' && m.icon === '', `reset: automatic title and icon (${JSON.stringify(m)})`)
  })
  await openOn(item)
  h.assert(!(await ctx.page.isVisible('.menu-item:has-text("Reset")')), 'nothing custom: no Reset entry')
  await ctx.page.keyboard.press('Escape')
  await h.waitFor(ctx, async () => !(await menuOpen()), 'menu closed')

  // A dialog (close a busy tile, cancelled) gives focus back too.
  const busy = (await ctx.tie('add', 'terminal', '--cmd', 'sleep 30', '--focus')).id
  await h.waitTile(ctx, busy, (t) => t.term?.pid, 'cmd started')
  await h.press(ctx, 'Meta+w')
  await ctx.page.waitForSelector('.dialog')
  await ctx.page.keyboard.press('Escape')
  const act = (await h.list(ctx)).active
  h.assert(act && (await h.focused(ctx)) === act, `terminal refocused after dialog: ${await h.focused(ctx)}`)
}
