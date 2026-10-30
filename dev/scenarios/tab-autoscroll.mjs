// Tab list auto-scroll while dragging near its ends: a tab reorder (right end: the order follows the
// scroll), a tile over the tabs (the drop highlight follows, onto a tab that was out of view), the
// left end. No loop left running after a drop.
export default async (ctx, h) => {
  const tabCount = () => ctx.page.$$eval('.tab', (els) => els.length)
  const cls = (sel) => ctx.page.evaluate((sel) => [...document.querySelector(sel).classList], sel)
  const scroll = () => ctx.page.evaluate(() => {
    const el = document.getElementById('tab-list')
    return { left: el.scrollLeft, max: el.scrollWidth - el.clientWidth }
  })
  const setScroll = (x) => ctx.page.evaluate((x) => (document.getElementById('tab-list').scrollLeft = x), x)
  const listBox = async () => (await h.boxOf(ctx, '#tab-list')).box
  const tabBoxes = () => ctx.page.evaluate(() =>
    Object.fromEntries([...document.querySelectorAll('.tab')].map((t) => [t.dataset.space, t.getBoundingClientRect().toJSON()])))
  const order = async () => (await h.list(ctx)).tabs.map((t) => t.id)
  const dropMark = () => ctx.page.evaluate(() => [...document.querySelectorAll('.tab.drop')].map((e) => e.dataset.space))
  const m = ctx.page.mouse
  // A loop left running would keep scrolling: the position holds after a drop, also from mid-list.
  const stays = async (what) => {
    await h.settle(ctx)
    const s0 = (await scroll()).left
    await ctx.sleep(300) // absence: no scrolling meanwhile
    h.assert((await scroll()).left === s0, `${what}: scroll stays after the drop (${s0})`)
    const mid = Math.round((await scroll()).max / 2)
    await setScroll(mid)
    await ctx.sleep(300) // absence: no scrolling meanwhile
    h.assert((await scroll()).left === mid, `${what}: no scrolling after the drop (mid ${mid})`)
  }

  // Tabs until the list overflows with settled titles (toolbar-overflow.mjs), then 4 more: room to scroll.
  await h.resizeWindow(ctx, 900, 600)
  const settled = () => ctx.page.evaluate(() => {
    const [first, ...rest] = [...document.querySelectorAll('.tab')].map((t) => t.textContent)
    return rest.every((t) => t === first)
  })
  let extra = 0
  for (let n = 1; extra < 4 && n < 30; n++) {
    const c = await tabCount()
    await h.press(ctx, 'Meta+t')
    await h.waitFor(ctx, async () => (await tabCount()) === c + 1 && (await settled()), 'new tab, title settled')
    await h.settle(ctx) // overflow class set on render
    if ((await cls('#tabs')).includes('overflow')) extra++
  }
  h.assert((await cls('#tabs')).includes('overflow'), 'tabs overflow')
  await h.press(ctx, 'Meta+1')
  await h.eventually(ctx, async () => h.assert((await scroll()).left === 0, 'first tab shown: scrolled to the start'))

  // (a) The first tab dragged into the right zone, held: the list scrolls, the tab moves on with it.
  let list = await listBox()
  const y = list.y + list.height / 2
  const xr = list.x + list.width - 8
  let ids = await order()
  const first = ids[0]
  let boxes = await tabBoxes()
  const idx0 = ids.slice(1).filter((id) => boxes[id].x + boxes[id].width / 2 < xr).length // index if nothing scrolled
  await m.move(boxes[first].x + boxes[first].width / 2, y)
  await m.down()
  await m.move(xr, y, { steps: 12 })
  let s
  let idx
  await h.eventually(ctx, async () => {
    s = await scroll()
    idx = (await order()).indexOf(first)
    h.assert(s.left > 0, `tab drag at the right end: list scrolled (${s.left})`)
    h.assert(idx > idx0, `dragged tab moved on with the scroll (index ${idx} > ${idx0})`)
  })
  await ctx.shot('tab-drag-right')
  await m.up()
  await stays('tab drag')

  // (b) A board tile's title bar into the right zone: scrolls, highlight on a tab that was out of view;
  // dropped there, the tile joins it.
  await h.press(ctx, 'Meta+1')
  await h.eventually(ctx, async () => h.assert((await scroll()).left === 0, 'back at the start'))
  let l = await h.list(ctx)
  const tile = l.active
  const src = l.tab
  list = await listBox()
  boxes = await tabBoxes()
  await m.move(...Object.values(await h.titlePoint(ctx, tile)))
  await m.down()
  await m.move(xr, y, { steps: 12 })
  await h.waitFor(ctx, async () => {
    const s = await scroll()
    return s.left >= 300 || s.left >= s.max - 1 // the end (fractional scroll positions)
  }, 'tile drag scrolled')
  let mark
  await h.eventually(ctx, async () => {
    mark = await dropMark()
    h.assert(mark.length === 1 && mark[0] !== src, `one tab highlighted (${mark})`)
    h.assert(boxes[mark[0]].x >= list.x + list.width - 1, `highlighted tab was out of view (left ${boxes[mark[0]].x}, list right ${list.x + list.width})`)
  })
  await ctx.shot('tile-drag-right')
  await m.up()
  await h.eventually(ctx, async () => {
    l = await h.list(ctx)
    h.assert((await h.tileOf(ctx, tile)).tab === mark[0] && l.tab === mark[0] && l.active === tile, `tile joined the highlighted tab, shown (${l.tab})`)
    h.assert(!l.tabs.some((t) => t.id === src), 'emptied source tab closed')
  })
  await stays('tile drag')

  // (c) Left end, from the end of the list: the last tab dragged into the left zone.
  await setScroll((await scroll()).max)
  await h.settle(ctx)
  const s0 = (await scroll()).left
  ids = await order()
  const last = ids[ids.length - 1]
  boxes = await tabBoxes()
  list = await listBox()
  await m.move(boxes[last].x + boxes[last].width / 2, y)
  await m.down()
  await m.move(list.x + 8, y, { steps: 12 })
  const visibleLeft = ids.filter((id) => boxes[id].x + boxes[id].width / 2 < list.x + 8).length
  await h.eventually(ctx, async () => {
    s = await scroll()
    idx = (await order()).indexOf(last)
    h.assert(s.left < s0, `tab drag at the left end: list scrolled back (${s.left} < ${s0})`)
    h.assert(idx < visibleLeft, `dragged tab moved back with the scroll (index ${idx} < ${visibleLeft})`)
  })

  await ctx.shot('tab-drag-left')
  await m.up()
  await stays('left drag')
}
