// Group actions on the shelf selection (SHELF.md "Selection"), always in shelf order, selection
// cleared after: cmd+W closes all (one question per busy tile, a declined one stays shelved, the
// rest close; then the recent board tile is active); cmd+S unshelves beside the recent board tile,
// adjacent, in order, even shares, the first active; group menu: Unshelve / Move to tab (new, and
// an existing tab) / Close.
export default async (ctx, h) => {
  const page = ctx.page
  const L = () => h.list(ctx)
  const info = async (id) => (await L()).tiles.find((t) => t.id === id)
  const has = async (id) => !!(await info(id))
  const dialog = () => ctx.page.isVisible('.dialog.close-busy')
  const away = async () => {
    await page.mouse.move(300, 300, { steps: 5 })
    await h.settle(ctx)
  }
  const add = async (...extra) => (await ctx.tie('add', 'terminal', '--shelved', ...extra)).id
  const groupMenu = async (id, n) => {
    await page.click(`.item[data-id="${id}"]`, { button: 'right' })
    await h.waitFor(ctx, () => page.isVisible(`.menu-item:has-text("Close ${n} tiles")`), 'group menu')
  }
  const items = () => page.$$eval('.menu .menu-item', (els) => els.map((e) => e.textContent))

  const [a] = (await L()).tiles.map((t) => t.id)
  await h.waitShell(ctx, a)

  // cmd+W: b (busy) asks → Close; c (idle) closes; d (busy) asks → Cancel, stays; e closes.
  const b = await add('--cmd', 'sleep 60', '--title', 'busy-b')
  const c = await add()
  const d = await add('--cmd', 'sleep 60', '--title', 'busy-d')
  const e = await add()
  await away()
  await h.waitRunning(ctx, b, /sleep/)
  await h.waitRunning(ctx, d, /sleep/)
  await h.waitShell(ctx, c)
  await h.waitShell(ctx, e)
  await h.selectShelf(ctx, e, d, c, b) // clicked in reverse: the order is the shelf's
  await h.press(ctx, 'Meta+w')
  await h.eventually(ctx, async () => h.assert((await dialog()) && /busy-b/.test(await page.textContent('.dialog h2')), 'first question: b'))
  h.assert((await h.selected(ctx)).length === 0, 'selection cleared at once')
  await ctx.shot('group-close-b')
  await page.click('.dialog .confirm')
  await h.eventually(ctx, async () => {
    h.assert((await dialog()) && /busy-d/.test(await page.textContent('.dialog h2')), 'second question: d')
    h.assert(!(await has(b)) && !(await has(c)), 'b closed, c (idle) closed without asking')
  })
  await page.click('.dialog .cancel')
  await h.waitGone(ctx, e)
  await h.waitNoDialog(ctx)
  await ctx.sleep(300) // nothing happens: no third question
  h.assert(!(await dialog()), 'one question per busy tile')
  let l = await L()
  h.assert(l.tiles.find((t) => t.id === d).state === 'shelved' && !l.tiles.find((t) => t.id === d).selected, 'declined d stays shelved, not selected')
  h.assert(l.active === a, `then the recent board tile: ${l.active}`)
  await ctx.tie('close', '--tile', d)

  // Selection of 1: cmd+W closes it unseen.
  const one = await add()
  await away()
  await h.waitShell(ctx, one)
  await h.selectShelf(ctx, one)
  await h.press(ctx, 'Meta+w')
  await h.waitGone(ctx, one)

  // cmd+S: unshelve beside the recent board tile, in shelf order, adjacent, even.
  const f = await add()
  const g = await add()
  const x = await add()
  await away()
  await h.selectShelf(ctx, g, f)
  await h.press(ctx, 'Meta+s')
  await h.eventually(ctx, async () => {
    const l = await L()
    const [rf, rg] = [f, g].map((id) => l.tiles.find((t) => t.id === id))
    h.assert(rf.state === 'slotted' && rg.state === 'slotted', 'both slotted')
    h.assert(l.tiles.find((t) => t.id === x).state === 'shelved', 'unselected x stays')
    h.assert(l.active === f && !l.tiles.some((t) => t.selected), `f active, selection cleared (${l.active})`)
    const ra = l.tiles.find((t) => t.id === a).rect
    h.assert(ra.x < rf.rect.x && rf.rect.x < rg.rect.x, 'a, f, g left to right')
    h.assert(Math.abs(rf.rect.x + rf.rect.w - rg.rect.x) < 12 && rf.rect.y === rg.rect.y, 'f and g adjacent')
    h.assert(Math.abs(rf.rect.w - rg.rect.w) <= 2, `even shares: ${rf.rect.w} / ${rg.rect.w}`)
  })
  await ctx.shot('group-unshelve')
  await ctx.tie('close', '--tile', f)
  await ctx.tie('close', '--tile', g)

  // Group menu: three entries; Unshelve.
  const i = await add()
  const j = await add()
  await away()
  await h.selectShelf(ctx, i, j)
  await groupMenu(j, 2)
  h.assert((await items()).join('|') === 'Unshelve 2 tiles|Move 2 to tab ▸|Close 2 tiles', `entries: ${(await items()).join('|')}`)
  h.assert((await h.selected(ctx)).length === 2, 'selection kept while the menu is open')
  await ctx.shot('group-menu')
  await page.click('.menu-item:has-text("Unshelve 2 tiles")')
  await h.eventually(ctx, async () => {
    const l = await L()
    h.assert([i, j].every((id) => l.tiles.find((t) => t.id === id).state === 'slotted') && l.active === i && !l.tiles.some((t) => t.selected), 'menu unshelve: slotted, i active')
  })

  // Move to a new tab: x and m go there, adjacent, the tab shown, x active.
  const m = await add()
  await away()
  await h.selectShelf(ctx, m, x)
  await groupMenu(x, 2)
  await page.click('.menu-item:has-text("Move 2 to tab")')
  await h.waitFor(ctx, () => page.isVisible('.menu-item:has-text("New tab")'), 'tab list')
  h.assert((await items()).join('|') === 'New tab', `only tab: no own-tab entry: ${(await items()).join('|')}`)
  await ctx.shot('group-menu-tabs')
  const tab1 = (await L()).tab
  await page.click('.menu-item:has-text("New tab")')
  let tab2
  await h.eventually(ctx, async () => {
    const l = await L()
    tab2 = l.tab
    h.assert(tab2 !== tab1 && l.tabs.length === 2, 'new tab shown')
    h.assert([x, m].every((id) => { const t = l.tiles.find((t) => t.id === id); return t.tab === tab2 && t.state === 'slotted' }), 'x, m on its board')
    h.assert(l.active === x, `first in shelf order active: ${l.active}`)
  })

  // Move to an existing tab: from tab 1, p and q join tab 2.
  await ctx.tie('focus', '--tile', a)
  await h.waitActive(ctx, a)
  const p = await add()
  const q = await add()
  await away()
  await h.selectShelf(ctx, p, q)
  await groupMenu(p, 2)
  await page.click('.menu-item:has-text("Move 2 to tab")')
  await page.click('.menu-item:has-text("2 · ")')
  await h.eventually(ctx, async () => {
    const l = await L()
    h.assert(l.tab === tab2 && [p, q].every((id) => l.tiles.find((t) => t.id === id).tab === tab2) && l.active === p, 'p, q joined tab 2, p active')
  })

  // Close via the menu (idle: no questions).
  await ctx.tie('focus', '--tile', a)
  await h.waitActive(ctx, a)
  const r = await add()
  const s = await add()
  await away()
  await h.selectShelf(ctx, r, s)
  await groupMenu(r, 2)
  await page.click('.menu-item:has-text("Close 2 tiles")')
  await h.waitGone(ctx, r)
  await h.waitGone(ctx, s)
  await h.waitActive(ctx, a)
}
