// Closing busy terminals asks (TERMINALS.md "Busy"): idle shell at once; foreground command,
// background job, live --cmd ask (Esc keeps, Enter closes); exited --cmd and `tie close` don't;
// tab close lists busy tiles.
export default async (ctx, h) => {
  const L = () => h.list(ctx)
  const has = async (id) => (await L()).tiles.some((t) => t.id === id)
  const dialog = () => ctx.page.isVisible('.dialog.close-busy')
  const text = () => ctx.page.textContent('.dialog.close-busy')
  const k = async (chord) => {
    await h.press(ctx, chord)
    await ctx.sleep(300)
  }
  const key = async (name) => {
    await ctx.page.keyboard.press(name)
    await ctx.sleep(250)
  }
  const split = async () => {
    await k('Meta+d')
    await ctx.sleep(900) // shell up, rc files done (their children would count)
    return (await L()).active
  }
  const type = async (s) => {
    await ctx.page.keyboard.type(s)
    await ctx.sleep(500)
  }
  await ctx.sleep(800)

  // Idle shell: closes at once.
  const b = await split()
  await k('Meta+w')
  h.assert(!(await dialog()) && !(await has(b)), 'idle shell closed at once')

  // Foreground command: asks. Esc keeps it (keys back to it), Enter closes.
  const c = await split()
  await type('sleep 30\n')
  await k('Meta+w')
  h.assert(await dialog(), 'foreground command: dialog')
  h.assert(/^Close .+\?/.test(await ctx.page.textContent('.dialog h2')) && /sleep is running\./.test(await text()), `dialog text: ${await text()}`)
  h.assert((await ctx.page.evaluate(() => document.activeElement?.className)) === 'confirm', 'Close focused (Enter confirms)')
  await ctx.shot('close-busy')
  await key('Escape')
  h.assert(!(await dialog()) && (await has(c)), 'Esc keeps the tile')
  h.assert((await ctx.page.evaluate(() => document.activeElement?.closest('.tile')?.dataset.id)) === c, 'keys back to it')
  // Context menu Close asks too; Enter closes.
  await ctx.page.click(`.tile[data-id="${c}"] .titlebar`, { button: 'right' })
  await ctx.page.locator('.menu-item', { hasText: 'Close' }).click()
  await ctx.sleep(300)
  h.assert(await dialog(), 'menu Close: dialog')
  await key('Enter')
  h.assert(!(await dialog()) && !(await has(c)), 'Enter closes it')

  // Background job counts; the title-bar × asks too. Job gone: closes at once.
  const d = await split()
  await type('sleep 30 &\n')
  await h.clickButton(ctx, d, 'close')
  await ctx.sleep(300)
  h.assert(await dialog(), 'background job: dialog (× button)')
  h.assert(/A process is running\./.test(await text()), `unknown command named generically: ${await text()}`)
  await ctx.page.click('.dialog .cancel')
  await ctx.sleep(200)
  h.assert(await has(d), 'Cancel keeps it')
  await type('kill %1\n')
  await ctx.sleep(300)
  await k('Meta+w')
  h.assert(!(await dialog()) && !(await has(d)), 'job ended: closes at once')

  // --cmd tile: busy while the command lives, not after it exited (the tile stays to show it).
  const e = (await ctx.tie('add', 'terminal', '--cmd', 'sleep 2', '--focus')).id
  await ctx.sleep(500)
  await k('Meta+w')
  h.assert(await dialog() && /sleep 2 is running\./.test(await text()), `cmd tile: dialog: ${await text()}`)
  await key('Escape')
  await h.waitFor(ctx, async () => (await h.tileOf(ctx, e))?.exit === 0, 'cmd exited')
  await ctx.tie('focus', e)
  await k('Meta+w')
  h.assert(!(await dialog()) && !(await has(e)), 'exited cmd tile closes at once')

  // tie close: scripted, never asks.
  const f = await split()
  await type('sleep 30\n')
  await ctx.tie('close', f)
  await ctx.sleep(200)
  h.assert(!(await dialog()) && !(await has(f)), 'tie close: no dialog')

  // Tab close with a busy tile (and a shelved idle one): lists it; Esc keeps; Enter closes all.
  const a = (await L()).tiles[0].id
  await k('Meta+t')
  await ctx.sleep(900)
  const g = (await L()).active
  const s = (await ctx.tie('add', 'terminal', '--shelved')).id
  await ctx.sleep(900)
  await type('sleep 30\n')
  await ctx.page.click('.tab.current .tab-close')
  await ctx.sleep(300)
  h.assert(await dialog(), 'tab ×: dialog')
  const items = await ctx.page.$$eval('.dialog ul.running li', (els) => els.map((x) => x.textContent))
  h.assert(/^Close tab .+\?/.test(await ctx.page.textContent('.dialog h2')) && items.length === 1 && /sleep/.test(items[0]), `lists the busy tile only: ${items}`)
  await ctx.shot('close-tab-busy')
  await key('Escape')
  h.assert((await L()).tabs.length === 2, 'Esc keeps the tab')
  await k('Meta+Shift+w')
  h.assert(await dialog(), 'cmd+shift+W: dialog')
  await key('Enter')
  const l = await L()
  h.assert(l.tabs.length === 1 && !l.tiles.some((t) => t.id === g || t.id === s) && l.tiles.some((t) => t.id === a), 'tab closed with all its tiles')
}
