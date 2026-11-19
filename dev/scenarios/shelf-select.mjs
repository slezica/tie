// Shelf selection (SHELF.md "Selection"): cmd+click toggles; cmd held over an item: no reveal; a
// reveal is dismissed by the cmd+click; selecting leaves nothing active, a pinned tile stays pinned
// and out of it; look (.selected accent, .pinned plain); `tie list` `selected`. De-select: plain
// click (item, board tile, tab), Escape, other shortcuts, tab switch, drags (a selected item: the group
// moves), context menu elsewhere;
// hover and scroll keep it; a tile closing or leaving the shelf (CLI) leaves it.
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { ROOT } from '../lib.mjs'

export default async (ctx, h) => {
  const page = ctx.page
  const L = () => h.list(ctx)
  const sel = () => h.selected(ctx)
  const same = (a, b) => [...a].sort().join() === [...b].sort().join()
  const expectSel = (ids, what) => h.eventually(ctx, async () => {
    const s = await sel()
    h.assert(same(s, ids), `${what}: selection ${s.join()} (want ${ids.join()})`)
  })
  const away = async () => {
    await page.mouse.move(300, 300, { steps: 5 })
    await h.settle(ctx)
  }
  const focusedTile = () => page.evaluate(() => document.activeElement?.closest('.tile')?.dataset.id ?? null)
  const cls = (id) => page.$eval(`.item[data-id="${id}"]`, (e) => [...e.classList])
  const color = (id) => page.$eval(`.item[data-id="${id}"]`, (e) => getComputedStyle(e).color)

  const [a] = (await L()).tiles.map((t) => t.id)
  await h.waitShell(ctx, a)
  const add = async () => (await ctx.tie('add', 'terminal', '--shelved')).id
  const b = await add()
  const c = await add()
  const d = await add()
  const e = await add()
  await away()

  // A pinned tile: cmd+click another item selects only that one; the pin stays, unfocused.
  await h.pin(ctx, b)
  await h.waitActive(ctx, b)
  await h.selectShelf(ctx, c)
  let s = await h.state(ctx)
  h.assert(same(s.selected, [c]) && s.pinned === b && s.active === null && s.revealed === null, `select c: ${JSON.stringify(s)}`)
  h.assert((await focusedTile()) === null, 'nothing focused')
  // Look: selected = accent; pinned = plain (hover look), not selected.
  h.assert((await cls(c)).includes('selected') && !(await cls(b)).includes('selected'), 'classes')
  h.assert((await color(c)) !== (await color(b)), `selected and pinned look differ: ${await color(c)} / ${await color(b)}`)
  // tie list: `selected` per tile (json), a flag in the table.
  let l = await L()
  h.assert(l.tiles.find((t) => t.id === c).selected === true && l.tiles.filter((t) => t.selected).length === 1, 'list: c selected only')
  h.assert(l.tiles.find((t) => t.id === b).pinned && !l.tiles.find((t) => t.id === b).active, 'b pinned, not active')
  const table = execFileSync(join(ROOT, 'bin/tie'), ['list'], { env: { ...process.env, TIE_INSTANCE: ctx.instance, TIE_SOCKET: '', TIE_TILE: '' }, encoding: 'utf8' })
  h.assert(new RegExp(`${c}.*selected`).test(table), `tie list flags: ${table}`)

  // cmd held while hovering: no reveal.
  await away()
  await page.keyboard.down('Meta')
  const dp = await h.shelfItem(ctx, d)
  await page.mouse.move(dp.x, dp.y, { steps: 4 })
  await ctx.sleep(300) // nothing happens: no reveal while cmd is held
  h.assert((await h.state(ctx)).revealed === null, 'cmd held: no reveal')
  await page.keyboard.up('Meta')
  await away()

  // A hover reveal (cmd pressed afterwards) is dismissed by the cmd+click.
  await h.hoverShelf(ctx, d)
  h.assert((await h.state(ctx)).revealed === d, 'hover reveals d')
  await h.selectShelf(ctx, d)
  s = await h.state(ctx)
  h.assert(same(s.selected, [c, d]) && s.revealed === null && s.pinned === b, `cmd+click dismissed the reveal: ${JSON.stringify(s)}`)
  await ctx.shot('selected')

  // Strip with plain, pinned and selected items, for a look.
  await away()
  const strip = await h.boxOf(ctx, '#toolbar')
  const stripShot = join(ctx.runDir, 'shots', 'strip.png') // pinned b, selected c + d, plain e (device pixels)
  await page.screenshot({ path: stripShot, clip: strip.box, scale: 'device' })
  console.log(stripShot)

  // Toggle out.
  await h.selectShelf(ctx, d)
  await expectSel([c], 'cmd+click again: out')
  // The last one toggled out: back to work (focusNext: the recent board tile takes the keys; the pin stays).
  await h.selectShelf(ctx, c)
  await expectSel([], 'last one toggled out')
  await h.waitActive(ctx, a)
  await h.eventually(ctx, async () => h.assert((await focusedTile()) === a && (await h.state(ctx)).pinned === b, 'keys back to a, b still pinned'))
  await h.selectShelf(ctx, c)

  // `tie add` without --focus keeps the selection (a selection counts as having the input), on the
  // board and on the shelf.
  const n0 = (await L()).tiles.length
  const added = [(await ctx.tie('add', 'terminal', '--at', a, '--side', 'b')).id, await add()]
  await h.eventually(ctx, async () => {
    const l = await L()
    h.assert(l.tiles.length === n0 + 2 && l.active === null, `tie add: nothing active (${l.active})`)
  })
  await expectSel([c], 'tie add keeps the selection')
  for (const id of added) await ctx.tie('close', '--tile', id)
  await expectSel([c], 'tie close of other tiles keeps it')
  await away()

  // Hover and scroll keep it.
  await h.hoverShelf(ctx, e)
  const tl = await h.boxOf(ctx, '#tab-list')
  await page.mouse.move(tl.x, tl.y)
  await page.mouse.wheel(0, 100)
  await ctx.sleep(200) // nothing happens: hover and scroll don't de-select
  await expectSel([c], 'hover + scroll keep it')
  await away()

  // Plain click on an item: de-selects, then acts as a click (here: pins it).
  await h.pin(ctx, d)
  await expectSel([], 'plain item click')
  h.assert((await h.state(ctx)).pinned === d, 'the click still pins')
  await h.pin(ctx, d) // unpin
  await away()

  // Plain click on a board tile: de-selects, it takes the keys.
  await h.selectShelf(ctx, c)
  const ar = await h.rectOf(ctx, a)
  await page.mouse.click(ar.x + ar.w / 2, ar.y + ar.h / 2)
  await expectSel([], 'board tile click')
  await h.waitActive(ctx, a)

  // Plain click on the current tab.
  await h.selectShelf(ctx, c)
  await page.click('.tab.current .tab-title')
  await expectSel([], 'tab click')

  // Escape: de-selects, keys back to the most recent board tile.
  await h.selectShelf(ctx, c, e)
  await page.keyboard.press('Escape')
  await expectSel([], 'Escape')
  await h.waitActive(ctx, a)
  await h.eventually(ctx, async () => h.assert((await focusedTile()) === a, 'keys back to a'))
  // No selection: Escape reaches the terminal (`cat -v` echoes it as ^[), which keeps focus.
  await page.keyboard.type('cat -v\n')
  await h.waitChild(ctx, a, /cat/)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Enter')
  await h.waitText(ctx, a, /cat -v.*\^\[/)
  h.assert((await focusedTile()) === a && (await L()).active === a, 'Escape without a selection: terminal keeps focus')
  await page.keyboard.press('Control+d') // cat ends
  await h.waitNoChild(ctx, a)

  // Another shortcut: de-selects, then runs (split from the restored tile).
  await h.selectShelf(ctx, c)
  const before = (await L()).tiles.length
  await h.press(ctx, 'Meta+d')
  await expectSel([], 'other shortcut')
  const split = await h.waitFor(ctx, async () => { const l = await L(); return l.tiles.length === before + 1 && l.active !== a && l.active }, 'split ran after de-select')
  await h.waitShell(ctx, split)

  // Context menu on a non-selected item: de-select, its own menu. On a selected item: group menu,
  // selection kept; Escape closes the menu first, then de-selects.
  await h.selectShelf(ctx, c)
  await page.click(`.item[data-id="${e}"]`, { button: 'right' })
  await expectSel([], 'context menu elsewhere')
  h.assert(await page.isVisible('.menu-item:has-text("Rename")'), 'tile menu')
  await page.keyboard.press('Escape')
  await away()
  await h.selectShelf(ctx, c, e)
  await page.click(`.item[data-id="${c}"]`, { button: 'right' })
  await h.waitFor(ctx, () => page.isVisible('.menu-item:has-text("Close 2 tiles")'), 'group menu')
  await expectSel([c, e], 'group menu: kept')
  await page.keyboard.press('Escape')
  await h.waitFor(ctx, async () => !(await page.$('.menu')), 'menu closed by Escape')
  await expectSel([c, e], 'Escape closed the menu only')
  // Context menu on a board tile's title bar.
  const tp = await h.titlePoint(ctx, a)
  await page.mouse.click(tp.x, tp.y, { button: 'right' })
  await expectSel([], 'context menu on a board tile')
  await page.keyboard.press('Escape')
  await away()

  // Drag of a non-selected item (plain press) de-selects; it moves alone.
  await h.selectShelf(ctx, c)
  const shelf = await h.boxOf(ctx, '#shelf')
  await h.drag(ctx, await h.shelfItem(ctx, e), { x: shelf.box.x + 2, y: shelf.y })
  await expectSel([], 'drag of another item')
  // Drag of a selected item (cmd held from the press): the group moves (shelf-select-drag), de-selected.
  await away()
  await h.selectShelf(ctx, c, d)
  await page.keyboard.down('Meta')
  await h.drag(ctx, await h.shelfItem(ctx, c), await h.sidePoint(ctx, a, 'b'))
  await page.keyboard.up('Meta')
  await expectSel([], 'drag of a selected item')
  l = await L()
  h.assert([c, d].every((id) => l.tiles.find((t) => t.id === id).state === 'slotted'), 'the group moved')
  await ctx.tie('move', '--tile', d, '--shelve') // back: d is used below
  await away()

  // A tile that closes or leaves the shelf (CLI) leaves the selection.
  await h.selectShelf(ctx, d, e)
  await ctx.tie('close', '--tile', d)
  await expectSel([e], 'closed tile left it')
  await ctx.tie('add', 'terminal', '--shelved') // shelf keeps two items
  await h.selectShelf(ctx, b)
  await ctx.tie('move', '--tile', b, '--float')
  await expectSel([e], 'tile moved off the shelf left it')

  // Tab switch: de-selects the tab left. Checked from the other tab (`tie list` flags each tile in
  // its own tab): coming back would activate a tile there, which clears it anyway.
  const other = (await ctx.tie('add', 'terminal', '--tab', 'new')).id
  await expectSel([e], 'tie add --tab new (not shown) keeps it')
  await ctx.tie('focus', '--tile', other)
  await h.waitActive(ctx, other)
  await h.eventually(ctx, async () => {
    const l = await L()
    h.assert(l.tab === l.tiles.find((t) => t.id === other).tab && !l.tiles.some((t) => t.selected), `tab left: de-selected (${l.tiles.filter((t) => t.selected).map((t) => t.id)})`)
  })
}
