// Shelf and templates in a left / right bar (tabs top / bottom): list form (rows: icon + title), shelve by drop at a slot along y, reorder, reveal beside the item toward the board (centred on it, clamped; peak sideways), reveal zone travel, group drag (strip, board), template drag; narrow form (icons only, scaled with the bar's width up to 1.5x; drop slots by the scaled pitch).
const E = () => ({ start: [], end: [] })
const layout = (patch) => ({ top: E(), bottom: E(), left: E(), right: E(), ...patch })
const PAD = 6
const SLOT = 28
const PEAK = 8

export default async (ctx, h) => {
  const page = ctx.page
  const m = page.mouse
  const L = () => h.list(ctx)
  const S = () => h.state(ctx)
  const a = (await L()).tiles[0].id
  const away = async () => {
    const { board } = await L()
    await m.move(board.x + board.w / 2, board.y + 20, { steps: 5 }) // clear of reveals (the shelf is at the bar's end)
    await h.waitRevealed(ctx, null)
    await h.settle(ctx)
  }
  const rows = (sel) => page.$$eval(sel, (els) => els.filter((e) => getComputedStyle(e).display !== 'none').map((e) => {
    const l = e.querySelector('.lbl')
    const svg = e.querySelector('svg')?.getBoundingClientRect()
    return { ...e.getBoundingClientRect().toJSON(), id: e.dataset.id ?? e.dataset.kind, lbl: l.textContent, lblShown: getComputedStyle(l).display !== 'none' && l.getBoundingClientRect().width > 0, svg: svg?.width }
  }))
  const peak = () => page.evaluate(() => {
    const e = document.getElementById('peak')
    return { shown: getComputedStyle(e).display !== 'none', cls: [...e.classList], ...e.getBoundingClientRect().toJSON() }
  })
  const ghostAt = () => page.evaluate(() => [...document.querySelectorAll('#shelf > .item:not(.drag-source)')].findIndex((e) => e.classList.contains('ghost')))
  const near = (x, y, what, d = 1) => h.assert(Math.abs(x - y) <= d, `${what}: ${x} vs ${y}`)
  // A drag from `from` to slot `k` of the strip (along y), measured mid-drag: once the drag runs the
  // strip holds the "+" hint (or the ghost) as one more slot. The ghost lands at k; `check` then.
  const dropAtSlot = async (from, k, check) => {
    await m.move(from.x, from.y)
    await m.down()
    const { board } = await L()
    await m.move(board.x + board.w / 2, board.y + board.h / 2, { steps: 6 })
    await h.settle(ctx)
    const sb = (await h.boxOf(ctx, '#shelf')).box
    const pitch = (await page.$eval('#shelf > .item:not(.drag-source)', (e) => e.offsetHeight)) + 2
    await m.move(sb.x + sb.width / 2, sb.y + k * pitch + pitch / 2, { steps: 8 })
    await h.settle(ctx)
    await h.eventually(ctx, async () => h.assert((await ghostAt()) === k, `ghost at slot ${k} (${await ghostAt()})`))
    if (check) await check()
    await m.up()
    await h.settle(ctx)
  }

  for (const [side, tabsBar] of [['left', 'bottom'], ['right', 'top']]) {
    await h.setBars(ctx, layout({ [side]: { start: [], end: ['shelf', 'templates'] }, [tabsBar]: { start: ['tabs'], end: [] } }))
    const items = []
    for (let i = 0; i < 3; i++) items.push((await ctx.tie('add', 'terminal', '--shelved', '--title', `${side} item ${i}`)).id)
    await away()
    const bar = (await h.boxOf(ctx, `#bar-${side}`)).box

    // List form: a row per item, full width less --pad, icon + title; templates likewise, after the
    // shelf with the divider above them.
    let rs = await rows('#shelf .item')
    h.assert(rs.length === 3, `${side}: three rows`)
    rs.forEach((r, i) => {
      near(r.x, bar.x + PAD, `${side}: row ${i} x`)
      near(r.width, bar.width - 2 * PAD, `${side}: row ${i} full width`)
      near(r.height, SLOT, `${side}: row ${i} height`)
      h.assert(r.lblShown && r.lbl === `${side} item ${i}`, `${side}: row ${i} titled (${r.lbl})`)
      if (i) near(r.y, rs[i - 1].y + SLOT + 2, `${side}: row ${i} below row ${i - 1}`)
    })
    const ts = await rows('#templates .template')
    h.assert(ts.map((t) => t.lblShown && t.lbl).join() === 'terminal,file,browser' && ts.every((t) => Math.abs(t.width - (bar.width - 2 * PAD)) <= 1), `${side}: templates as rows with labels (${ts.map((t) => t.lbl)})`)
    const tplBox = (await h.boxOf(ctx, '#templates')).box
    h.assert(tplBox.y >= rs[2].y + SLOT && (await page.$eval('#templates', (e) => e.classList.contains('after-shelf') && getComputedStyle(e).borderTopWidth === '1px')), `${side}: templates after the shelf, divider above`)
    await ctx.shot(`${side}-list`)

    // Shelve by drop between rows 0 and 1: slot 1 (the ghost there, the hint gone).
    const b = (await ctx.tie('add', 'terminal', '--at', a, '--side', 'r')).id
    await h.waitShell(ctx, b)
    await dropAtSlot(await h.titlePoint(ctx, b), 1, () => ctx.shot(`${side}-shelve-ghost`))
    let l = await L()
    h.assert(l.shelf.join() === [items[0], b, items[1], items[2]].join(), `${side}: b shelved at slot 1 (${l.shelf})`)

    // Reorder: the first row dropped at the strip's end.
    const sb = (await h.boxOf(ctx, '#shelf')).box
    await h.drag(ctx, await h.shelfItem(ctx, items[0]), { x: sb.x + sb.width / 2, y: sb.y + sb.height - 4 })
    l = await L()
    h.assert(l.shelf.join() === [b, items[1], items[2], items[0]].join(), `${side}: first row moved to the end (${l.shelf})`)
    await away()

    // Reveal: beside the item toward the board, centred on it (clamped into the board), the peak
    // pointing at the item between them.
    for (const id of [b, items[0]]) {
      await h.hoverShelf(ctx, id)
      const it = (await h.shelfItem(ctx, id)).box
      const r = await h.rectOf(ctx, id)
      const { board } = await L()
      const cy = it.y + it.height / 2
      if (side === 'left') h.assert(r.x >= it.x + it.width + PEAK && r.x === board.x + PEAK + 2, `${side}: reveal right of the item, at the board's edge (${r.x})`)
      else h.assert(r.x + r.w <= it.x - PEAK && r.x + r.w === board.x + board.w - PEAK - 2, `${side}: reveal left of the item, at the board's edge (${r.x + r.w})`)
      near(r.y, Math.max(board.y, Math.min(cy - r.h / 2, board.y + board.h - r.h)), `${side}: reveal centred on the item, clamped`)
      const p = await peak()
      h.assert(p.shown && p.cls.includes(side) && !p.cls.includes('up'), `${side}: peak points ${side} (${p.cls})`)
      near(p.y + p.height / 2, Math.max(r.y + PEAK, Math.min(cy, r.y + r.h - PEAK)), `${side}: peak level with the item`)
      near(side === 'left' ? p.x + p.width : p.x, side === 'left' ? r.x : r.x + r.w, `${side}: peak on the reveal's edge`)
      await ctx.shot(`${side}-reveal-${id === b ? 'first' : 'last'}`)
      await away()
    }

    // Zone travel: item → into the reveal (across the gap and the peak): kept; back to the item:
    // kept; along the bar, off the item (the bar space above the first row): dismissed.
    await h.hoverShelf(ctx, b)
    const rr = await h.rectOf(ctx, b)
    await m.move(rr.x + rr.w / 2, rr.y + rr.h / 2, { steps: 25 })
    await h.settle(ctx)
    h.assert((await S()).revealed === b, `${side}: reveal kept while the pointer moves into it`)
    const ib = await h.shelfItem(ctx, b)
    await m.move(ib.x, ib.y, { steps: 15 })
    await h.settle(ctx)
    h.assert((await S()).revealed === b, `${side}: back across the band to the item: kept`)
    await m.move(ib.x, ib.box.y - 40, { steps: 6 })
    await h.eventually(ctx, async () => h.assert((await S()).revealed === null, `${side}: along the bar, off the item: dismissed`))
    await away()

    // Group drag: two items to the strip's start (block reorder, order kept), then onto the board.
    await h.selectShelf(ctx, items[2], items[1])
    const sb2 = (await h.boxOf(ctx, '#shelf')).box
    await h.drag(ctx, await h.shelfItem(ctx, items[1]), { x: sb2.x + sb2.width / 2, y: sb2.y + 4 }, {
      during: async () => h.assert((await page.locator('#shelf .item.ghost').count()) === 2, `${side}: group: two ghosts on the strip`),
    })
    l = await L()
    h.assert(l.shelf.join() === [items[1], items[2], b, items[0]].join() && !(await S()).selected.length, `${side}: group at the strip's start (${l.shelf})`)
    await h.selectShelf(ctx, items[1], items[2])
    await h.drag(ctx, await h.shelfItem(ctx, items[2]), await h.sidePoint(ctx, a, 'b'))
    await h.eventually(ctx, async () => {
      const l = await L()
      h.assert([items[1], items[2]].every((id) => l.tiles.find((t) => t.id === id).state === 'slotted') && l.active === items[1], `${side}: group onto the board, first active`)
    })

    // Template (a row) dragged onto the board: a new terminal there.
    const n = (await L()).tiles.length
    await h.drag(ctx, await h.template(ctx), await h.sidePoint(ctx, a, 'r'))
    await h.waitFor(ctx, async () => (await L()).tiles.length === n + 1, `${side}: template spawned a tile`)

    // Narrow form: icons only, square, centred, scaled with the bar's width (less --pad each side)
    // up to 1.5x; then back to the list form.
    for (const [w, size] of [[48, 36], [54, 42]]) {
      await h.setBarSize(ctx, side, w)
      const nb = (await h.boxOf(ctx, `#bar-${side}`)).box
      near(nb.width, w, `${side}: bar ${w} px`)
      for (const r of [...(await rows('#shelf .item')), ...(await rows('#templates .template'))]) {
        h.assert(!r.lblShown, `${side} ${w}: no title (${r.id})`)
        near(r.width, size, `${side} ${w}: ${r.id} width`)
        near(r.height, size, `${side} ${w}: ${r.id} height`)
        near(r.x + r.width / 2, nb.x + nb.width / 2, `${side} ${w}: ${r.id} centred`)
        near(r.svg, (size * 16) / 28, `${side} ${w}: ${r.id} icon scaled`)
      }
      await ctx.shot(`${side}-narrow-${w}`)
    }
    // Drop slots by the scaled pitch: b (on the board) at slot 1.
    await h.unshelve(ctx, b, a, 'l')
    await dropAtSlot(await h.titlePoint(ctx, b), 1)
    l = await L()
    h.assert(l.shelf.indexOf(b) === 1, `${side} narrow: b shelved at slot 1 (${l.shelf})`)
    await h.hoverShelf(ctx, b)
    h.assert((await peak()).cls.includes(side), `${side} narrow: reveal with the peak`)
    await ctx.shot(`${side}-narrow-reveal`)
    await away()
    await h.setBarSize(ctx, side, 120)
    h.assert((await rows('#shelf .item')).every((r) => r.lblShown && Math.abs(r.height - SLOT) <= 1), `${side} 120: list form again`)
    await h.setBarSize(ctx, side, null)

    // Clean up for the next side: the board tile a only.
    for (const t of (await L()).tiles.filter((t) => t.id !== a)) await ctx.tie('close', '--tile', t.id)
    await h.waitFor(ctx, async () => (await L()).tiles.length === 1, 'only a left')
  }
  await h.assertPtySizes(ctx)
}
