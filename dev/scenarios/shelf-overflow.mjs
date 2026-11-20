// Shelf overflow, both axes (bottom bar, then a left bar): the strip scrolls with no scrollbar, fades at the cut ends; a vertical wheel scrolls a horizontal strip sideways, a vertical one natively; auto-scroll while dragging near its ends: a board tile (the ghost slot follows, it lands there), a shelf item back to the start, a group; no loop left running after a drop.
const E = () => ({ start: [], end: [] })

const AXES = [
  { name: 'bottom', v: false, pos: 'scrollLeft', size: 'scrollWidth', client: 'clientWidth', lo: 'x', ext: 'width', window: [420, 600], bars: { top: E(), left: E(), right: E(), bottom: { start: ['tabs'], end: ['shelf', 'templates'] } } },
  { name: 'left', v: true, pos: 'scrollTop', size: 'scrollHeight', client: 'clientHeight', lo: 'y', ext: 'height', window: [900, 420], bars: { top: E(), right: E(), bottom: { start: ['tabs'], end: [] }, left: { start: [], end: ['shelf', 'templates'] } } },
]

export default async (ctx, h) => {
  const page = ctx.page
  const m = page.mouse
  const go = (p, o) => m.move(p.x, p.y, o) // a point's x, y only (Playwright reads x, y from the options too)
  const L = () => h.list(ctx)
  const a = (await L()).tiles[0].id
  for (let i = 0; i < 14; i++) await ctx.tie('add', 'terminal', '--shelved', '--title', `s${i}`)

  for (const ax of AXES) {
    const what = (s) => `${ax.name} bar: ${s}`
    await h.setBars(ctx, ax.bars)
    await h.resizeWindow(ctx, ...ax.window)
    const scroll = () => page.evaluate((ax) => {
      const el = document.getElementById('shelf')
      return { pos: el[ax.pos], size: el[ax.size], client: el[ax.client], max: el[ax.size] - el[ax.client], other: ax.v ? el.scrollLeft : el.scrollTop }
    }, { pos: ax.pos, size: ax.size, client: ax.client, v: ax.v })
    const setScroll = (n) => page.evaluate(([n, p]) => (document.getElementById('shelf')[p] = n), [n, ax.pos])
    // Fade classes, each only with its mask depth applied (--fade-s / --fade-e, style.css).
    const fades = () => page.evaluate(() => {
      const el = document.getElementById('shelf')
      const cs = getComputedStyle(el)
      const on = [...el.classList].filter((c) => c.startsWith('more-'))
      const deep = (v) => cs.getPropertyValue(v).trim() === '24px'
      return on.every((c) => deep(c === 'more-start' ? '--fade-s' : '--fade-e')) && deep('--fade-s') === on.includes('more-start') && deep('--fade-e') === on.includes('more-end') ? on.join() : `mask mismatch: ${on}`
    })
    const strip = async () => (await h.boxOf(ctx, '#shelf')).box
    const across = (b) => (ax.v ? b.x + b.width / 2 : b.y + b.height / 2)
    const pt = (along, b) => (ax.v ? { x: across(b), y: along } : { x: along, y: across(b) })
    const ghostSlot = () => page.evaluate(() => [...document.querySelectorAll('#shelf > .item:not(.drag-source)')].findIndex((e) => e.classList.contains('ghost')))
    const stays = async (w) => {
      await h.settle(ctx)
      const s0 = (await scroll()).pos
      await ctx.sleep(300) // absence: no scrolling meanwhile
      h.assert((await scroll()).pos === s0, what(`${w}: scroll stays after the drop (${s0})`))
    }

    // Overflow: scrolls along the bar, never across it; fades at the cut ends.
    await setScroll(0)
    await h.settle(ctx)
    let s = await scroll()
    h.assert(s.size > s.client + 30 && s.other === 0, what(`strip scrolls (${s.size} > ${s.client})`))
    h.assert((await fades()) === 'more-end', what(`at the start: fade at the end only (${await fades()})`))
    await ctx.shot(`${ax.name}-start`)
    await setScroll(s.max)
    await h.eventually(ctx, async () => h.assert((await fades()) === 'more-start', what(`at the end: fade at the start only (${await fades()})`)))
    await ctx.shot(`${ax.name}-end`)
    await setScroll(Math.round(s.max / 2))
    await h.eventually(ctx, async () => h.assert((await fades()) === 'more-start,more-end', what(`midway: both fades (${await fades()})`)))

    // Wheel: a vertical delta scrolls the strip along its axis (sideways mapped, or native).
    await setScroll(0)
    const c = await h.boxOf(ctx, '#shelf')
    await m.move(c.x, c.y)
    await m.wheel(0, 120)
    await h.eventually(ctx, async () => {
      const s = await scroll()
      h.assert(s.pos > 0 && s.other === 0, what(`wheel scrolls along the strip (${s.pos})`))
    })
    const { board } = await L()
    await m.move(board.x + board.w / 2, board.y + 20) // clear of the reveal (by the shelf, at the board's other end)
    await h.waitRevealed(ctx, null)

    // A board tile held in the end zone: the strip scrolls, the ghost slot with it; it lands there.
    await setScroll(0)
    await h.settle(ctx)
    let sb = await strip()
    const end = sb[ax.lo] + sb[ax.ext] - 8
    const shown0 = Math.floor(sb[ax.ext] / 30)
    await go(await h.titlePoint(ctx, a))
    await m.down()
    await go(pt(end, sb), { steps: 12 })
    let slot
    await h.eventually(ctx, async () => {
      s = await scroll()
      slot = await ghostSlot()
      h.assert(s.pos >= s.max - 1, what(`tile drag at the end: strip scrolled to its end (${s.pos} of ${s.max})`))
      h.assert(slot > shown0, what(`ghost slot followed the scroll (${slot} > ${shown0})`))
    })
    await ctx.shot(`${ax.name}-tile-drag-end`)
    await m.up()
    await h.eventually(ctx, async () => h.assert((await L()).shelf.indexOf(a) === slot, what(`a shelved at the ghost's slot ${slot} (${(await L()).shelf.indexOf(a)})`)))
    await stays('tile drag')

    // A shelf item dragged from the end into the start zone: back to the start; it lands first.
    await setScroll((await scroll()).max)
    await h.settle(ctx)
    sb = await strip()
    const last = (await L()).shelf.at(-1)
    await go(await h.shelfItem(ctx, last))
    await m.down()
    await go(pt(sb[ax.lo] + 6, sb), { steps: 12 })
    await h.eventually(ctx, async () => h.assert((await scroll()).pos === 0 && (await ghostSlot()) === 0, what(`item drag at the start: scrolled back, ghost first (${(await scroll()).pos})`)))
    await m.up()
    await h.eventually(ctx, async () => h.assert((await L()).shelf[0] === last, what('item moved to the start')))
    await stays('item drag')

    // A group (the first two) held in the end zone: scrolls; the block lands there, order kept.
    const [g1, g2] = (await L()).shelf
    await h.selectShelf(ctx, g1, g2)
    sb = await strip()
    await go(await h.shelfItem(ctx, g1))
    await m.down()
    await go(pt(sb[ax.lo] + sb[ax.ext] - 6, sb), { steps: 12 })
    await h.eventually(ctx, async () => {
      const s = await scroll()
      h.assert(s.pos >= s.max - 1, what(`group drag at the end: scrolled (${s.pos} of ${s.max})`))
    })
    await m.up()
    await h.eventually(ctx, async () => {
      const sh = (await L()).shelf
      const i = sh.indexOf(g1)
      h.assert(i > shown0 && sh[i + 1] === g2, what(`group moved toward the end, order kept (${i})`))
    })
    await stays('group drag')

    // Back to the board for the next axis.
    await page.$eval(`.item[data-id="${a}"]`, (e) => e.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
    await h.unshelve(ctx, a)
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, a)).state === 'slotted', 'a back on the board')
  }
  await h.assertPtySizes(ctx)
}
