// Tabs: new (empty), switch, per-tab board + shelf, cwd-derived titles, rename, close only when empty.
export default async (ctx, h) => {
  const k = async (chord) => {
    await ctx.page.keyboard.press(chord)
    await ctx.sleep(250)
  }
  const L = () => h.list(ctx)
  const visibleTiles = () => ctx.page.$$eval('.tile', (els) => els.filter((e) => e.style.display !== 'none').map((e) => e.dataset.id))
  const tabTitles = () => ctx.page.$$eval('.tab .tab-title', (els) => els.map((e) => e.textContent))

  const a = (await L()).tiles[0].id
  // Title from cwd (no shell integration): cd, wait for the poll.
  await ctx.page.keyboard.type('cd /tmp\n')
  await ctx.sleep(2600)
  h.assert((await tabTitles())[0] === 'tmp', `tab title from cwd: ${await tabTitles()}`)

  await k('Meta+t')
  let l = await L()
  h.assert(l.tabs.length === 2 && l.tab === l.tabs[1].id, 'cmd+T: new tab, switched')
  h.assert((await visibleTiles()).length === 0, 'new tab empty, tab 1 tiles hidden')
  await ctx.shot('new-tab')
  await k('Meta+d')
  const b = (await L()).active
  h.assert((await visibleTiles()).join() === b, 'cmd+D on empty tab opens first tile there')
  await ctx.tie('move', b, '--shelve')
  await ctx.sleep(200)
  h.assert((await ctx.page.$$('.item')).length === 1, 'shelf item in tab 2')

  await k('Meta+1')
  l = await L()
  h.assert(l.tab === l.tabs[0].id && l.active === a, 'cmd+1: back to tab 1, its tile active')
  h.assert((await visibleTiles()).join() === a, 'tab 1 tiles shown')
  h.assert((await ctx.page.$$('.item')).length === 0, 'shelf is per tab')
  await k('Control+Tab')
  h.assert((await L()).tab === l.tabs[1].id, 'ctrl+tab cycles')
  await k('Meta+9')
  h.assert((await L()).tab === l.tabs[1].id, 'cmd+9: last tab')

  // CLI from a terminal in a background tab acts in that tab and doesn't switch.
  await k('Meta+1')
  const c = (await ctx.tie('open', 'terminal', '--shelved', '--cmd', 'sleep 30')).id
  const x = (await ctx.tie('move', c, '--at', a, '--side', 'r')).id
  l = await L()
  h.assert(l.tiles.find((t) => t.id === x).tab === l.tabs[0].id, 'opened in tab 1')
  await k('Meta+2')
  const d = (await ctx.tie('open', 'terminal', '--at', a, '--side', 'b')).id
  l = await L()
  h.assert(l.tab === l.tabs[1].id && l.tiles.find((t) => t.id === d).tab === l.tabs[0].id, 'CLI targets background tab without switching')

  // Close: refused while tiles exist (tab 2 has a shelved tile).
  await k('Meta+Shift+w')
  h.assert(await ctx.page.isVisible('.dialog'), 'dialog explains non-empty tab')
  await ctx.shot('close-refused')
  await ctx.page.keyboard.press('Enter')
  h.assert((await L()).tabs.length === 2, 'tab kept')
  await ctx.tie('close', b)
  await k('Meta+Shift+w')
  l = await L()
  h.assert(l.tabs.length === 1 && l.tab === l.tabs[0].id, 'empty tab closed, back to tab 1')

  // Rename via right-click.
  const tab = await ctx.page.locator('.tab').first().boundingBox()
  await ctx.page.mouse.click(tab.x + 20, tab.y + tab.height / 2, { button: 'right' })
  await ctx.page.locator('.menu-item', { hasText: 'Rename' }).click()
  await ctx.page.keyboard.type('work')
  await ctx.page.keyboard.press('Enter')
  h.assert((await tabTitles())[0] === 'work', 'renamed')
  // cmd+W closes the active tile.
  const n = (await L()).tiles.length
  const act = (await L()).active
  await k('Meta+w')
  l = await L()
  h.assert(l.tiles.length === n - 1 && !l.tiles.some((t) => t.id === act), 'cmd+W closes active tile')

  // Reorder by drag: tab 3 moved before tab 1.
  await k('Meta+t')
  await k('Meta+t')
  const order = async () => (await L()).tabs.map((t) => t.id)
  const before = await order()
  const tabs = ctx.page.locator('.tab')
  const last = await tabs.nth(2).boundingBox()
  const firstBox = await tabs.nth(0).boundingBox()
  await h.drag(ctx, { x: last.x + last.width / 2, y: last.y + last.height / 2 }, { x: firstBox.x + 4, y: firstBox.y + firstBox.height / 2 })
  const after = await order()
  h.assert(after.join() === [before[2], before[0], before[1]].join(), `reordered: ${before} -> ${after}`)
  h.assert((await L()).tab === before[2], 'dragged tab is current')
  await ctx.shot('tabs')

  // Hover reveal doesn't stick across a tab switch (the item never sees pointerleave).
  await k('Meta+d')
  const sh = (await L()).active
  await ctx.tie('move', sh, '--shelve')
  await h.hoverShelf(ctx, sh)
  await k('Meta+t')
  const bc = await h.boardCenter(ctx)
  await ctx.page.mouse.move(bc.x, bc.y, { steps: 3 })
  await k('Meta+1')
  h.assert(!(await ctx.tie('state')).revealed, 'reveal cleared after tab switch')

  // A tab holding only shelved tiles isn't titled "empty".
  const cur = await ctx.page.$eval('.tab.current .tab-title', (e) => e.textContent)
  h.assert(cur !== 'empty', `shelf-only tab title: ${cur}`)
}
