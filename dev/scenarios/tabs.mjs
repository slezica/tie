// Tabs: new (with a terminal), switch, per-tab board + shelf, cwd-derived titles, rename, close with
// tiles (idle: no question), an emptied tab closes itself (the only tab stays, empty).
export default async (ctx, h) => {
  // Keys go through main, then to the UI: their effect is checked with h.eventually.
  const k = (chord) => h.press(ctx, chord)
  const ev = (fn) => h.eventually(ctx, fn)
  const L = () => h.list(ctx)
  // The active terminal's shell is up (prompt shown): no startup children, so not busy.
  const settle = async () => {
    const id = (await L()).active
    await h.waitShell(ctx, id, 10000)
    await h.waitNoChild(ctx, id)
  }
  // A new tab (cmd+T) opened and switched to; returns the new list.
  const newTab = async () => {
    const ids = (await L()).tabs.map((t) => t.id)
    await k('Meta+t')
    return h.waitFor(ctx, async () => { const l = await L(); return !ids.includes(l.tab) && l.active && l }, 'cmd+T: new tab')
  }
  const visibleTiles = () => ctx.page.$$eval('.tile', (els) => els.filter((e) => e.style.display !== 'none').map((e) => e.dataset.id))
  const tabTitles = () => ctx.page.$$eval('.tab .tab-title', (els) => els.map((e) => e.textContent))

  const a = (await L()).tiles[0].id
  // Title from cwd (no shell integration): cd, wait for the poll.
  await ctx.page.keyboard.type('cd /tmp\n')
  await h.waitFor(ctx, async () => (await tabTitles())[0] === 'tmp', `tab title from cwd: ${await tabTitles()}`, 10000)

  await k('Meta+t')
  let l
  await ev(async () => {
    l = await L()
    h.assert(l.tabs.length === 2 && l.tab === l.tabs[1].id, 'cmd+T: new tab, switched')
  })
  const b = l.active
  h.assert(l.tiles.find((t) => t.id === b)?.kind === 'terminal' && l.tiles.find((t) => t.id === b).tab === l.tabs[1].id, 'new tab starts with a terminal, active')
  h.assert((await visibleTiles()).join() === b, 'only the new terminal shown, tab 1 tiles hidden')
  await ctx.shot('new-tab')
  await ctx.tie('move', b, '--shelve')
  await ev(async () => h.assert((await ctx.page.$$('.item')).length === 1, 'shelf item in tab 2'))

  await k('Meta+1')
  await ev(async () => {
    l = await L()
    h.assert(l.tab === l.tabs[0].id && l.active === a, 'cmd+1: back to tab 1, its tile active')
    h.assert((await visibleTiles()).join() === a, 'tab 1 tiles shown')
    h.assert((await ctx.page.$$('.item')).length === 0, 'shelf is per tab')
  })
  await k('Control+Tab')
  await ev(async () => h.assert((await L()).tab === l.tabs[1].id, 'ctrl+tab cycles'))
  await k('Meta+1')
  await ev(async () => h.assert((await L()).tab === l.tabs[0].id, 'back to tab 1'))
  await k('Meta+9')
  await ev(async () => h.assert((await L()).tab === l.tabs[1].id, 'cmd+9: last tab'))

  // CLI from a terminal in a background tab acts in that tab and doesn't switch.
  await k('Meta+1')
  await ev(async () => h.assert((await L()).tab === l.tabs[0].id, 'cmd+1'))
  const c = (await ctx.tie('add', 'terminal', '--shelved', '--cmd', 'sleep 30')).id
  const x = (await ctx.tie('move', c, '--at', a, '--side', 'r')).id
  l = await L()
  h.assert(l.tiles.find((t) => t.id === x).tab === l.tabs[0].id, 'opened in tab 1')
  await k('Meta+2')
  await ev(async () => h.assert((await L()).tab === l.tabs[1].id, 'cmd+2'))
  const d = (await ctx.tie('add', 'terminal', '--at', a, '--side', 'b')).id
  l = await L()
  h.assert(l.tab === l.tabs[1].id && l.tiles.find((t) => t.id === d).tab === l.tabs[0].id, 'CLI targets background tab without switching')

  // Close: tab 2 holds only a shelved idle terminal: cmd+shift+W closes the tab with it, no question.
  await h.waitShell(ctx, b) // its shell settled (startup children would count as busy)
  await h.waitNoChild(ctx, b)
  await k('Meta+Shift+w')
  await ev(async () => {
    l = await L()
    h.assert(!(await ctx.page.isVisible('.dialog')), 'nothing running: no dialog')
    h.assert(l.tabs.length === 1 && l.tab === l.tabs[0].id && !l.tiles.some((t) => t.id === b), 'tab closed with its tile, back to tab 1')
  })

  // Last tile closed: the tab closes with it, back to tab 1 (details below).
  const e = (await newTab()).active
  await settle()
  await k('Meta+w')
  await ev(async () => {
    l = await L()
    h.assert(l.tabs.length === 1 && l.tab === l.tabs[0].id && !l.tiles.some((t) => t.id === e), `emptied tab closed: ${JSON.stringify(l.tabs)}`)
  })

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
  await ev(async () => {
    l = await L()
    h.assert(l.tiles.length === n - 1 && !l.tiles.some((t) => t.id === act), 'cmd+W closes active tile')
  })

  // Reorder by drag: tab 3 moved before tab 1.
  await newTab()
  await newTab()
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
  const t3 = (await L()).active
  await k('Meta+d')
  const sh = await h.waitFor(ctx, async () => { const a = (await L()).active; return a !== t3 && a }, 'cmd+D split')
  await ctx.tie('move', sh, '--shelve')
  await h.hoverShelf(ctx, sh)
  await newTab()
  const bc = await h.boardCenter(ctx)
  await ctx.page.mouse.move(bc.x, bc.y, { steps: 3 })
  await k('Meta+1')
  await h.waitFor(ctx, async () => { const l = await L(); return l.tab === l.tabs[0].id }, 'cmd+1: first tab')
  h.assert(!(await ctx.tie('state')).revealed, 'reveal cleared after tab switch')

  // A tab holding only shelved tiles isn't titled "empty".
  const cur = await ctx.page.$eval('.tab.current .tab-title', (e) => e.textContent)
  h.assert(cur !== 'empty', `shelf-only tab title: ${cur}`)

  // Closing a tab's last tile closes the tab: visible → back to the tab before; hidden (over the
  // CLI) → gone, the visible tab stays. The only tab stays, empty; cmd+W there does nothing.
  l = await L()
  const n0 = l.tabs.length
  const tabBefore = l.tab
  const fresh = (await newTab()).tab
  await settle() // startup children would count as busy: a question instead
  await k('Meta+w') // its only terminal, idle: closes at once
  await ev(async () => {
    l = await L()
    h.assert(l.tabs.length === n0 && !l.tabs.some((t) => t.id === fresh) && l.tab === tabBefore, `emptied visible tab closed, back to the tab before (${l.tab})`)
  })
  l = await newTab()
  const hidden = l.tab
  const ht = l.active
  await k('Meta+1')
  await h.waitFor(ctx, async () => { const l = await L(); return l.tab === l.tabs[0].id }, 'cmd+1: first tab')
  await ctx.tie('close', ht)
  await ev(async () => {
    l = await L()
    h.assert(!l.tabs.some((t) => t.id === hidden) && l.tab === l.tabs[0].id, 'hidden tab emptied over the CLI: gone, visible tab kept')
  })
  // A tab's own shell closing its tile (`tie close` from inside) while the tab is hidden: the
  // socket call runs in that space, which the close drops; ops then land on the visible space.
  const self = (await newTab()).tab
  await settle()
  await ctx.page.keyboard.type('sleep 1; tie close $TIE_TILE\n')
  await h.waitChild(ctx, (await L()).active, /sleep/) // typed into it before the switch
  await k('Meta+1')
  await h.waitFor(ctx, async () => !(await L()).tabs.some((t) => t.id === self), 'hidden tab closed by its own shell')
  l = await L()
  h.assert(l.tab === l.tabs[0].id, 'visible tab kept')
  await ctx.tie('add', 'terminal') // ops still work on the visible space afterwards
  h.assert((await L()).tiles.length > 0, 'open after the drop lands on the visible tab')
  for (const t of (await L()).tiles) await ctx.tie('close', t.id)
  await ev(async () => {
    l = await L()
    h.assert(l.tabs.length === 1 && l.tiles.length === 0 && !l.active, `only tab kept, empty: ${l.tabs.length} tabs, ${l.tiles.length} tiles`)
    h.assert((await tabTitles())[0] === 'empty', 'titled empty')
  })
  await ctx.shot('empty-tab')
  await k('Meta+w')
  await ctx.sleep(300) // absence: cmd+W does nothing here
  h.assert((await L()).tabs.length === 1, 'cmd+W on the only (empty) tab: no-op')
}
