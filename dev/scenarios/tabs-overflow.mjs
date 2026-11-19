// Toolbar contest: tabs that don't fit scroll (fades, divider toward the shelf, current tab kept in
// view; a vertical wheel scrolls it sideways); the shelf keeps its width until the tab list hits its
// floor, then the shelf scrolls. Auto-scroll while dragging near the list's ends: a tab reorder (right
// end: the order follows the scroll), a tile over the tabs (the drop highlight follows, onto a tab that
// was out of view), the left end. No loop left running after a drop.
export default async (ctx, h) => {
  const box = (sel) => ctx.page.evaluate((sel) => document.querySelector(sel).getBoundingClientRect().toJSON(), sel)
  const cls = (sel) => ctx.page.evaluate((sel) => [...document.querySelector(sel).classList], sel)
  const scroll = (sel) => ctx.page.evaluate((sel) => {
    const el = document.querySelector(sel)
    return { left: el.scrollLeft, width: el.scrollWidth, client: el.clientWidth, max: el.scrollWidth - el.clientWidth }
  }, sel)
  const currentVisible = async () => {
    const list = await box('#tab-list')
    const cur = await box('.tab.current')
    return cur.left >= list.left - 1 && cur.right <= list.right + 1
  }
  const tabCount = () => ctx.page.$$eval('.tab', (els) => els.length)

  // Tab titles are the terminals' cwd (this run's directory name; "terminal", then the shell's
  // name, until the cwd arrives), so the count that overflows a 900px window varies: open tabs
  // until the list overflows with settled titles, i.e. all like the first tab's, then `extra` more
  // (capped).
  const settled = () => ctx.page.evaluate(() => {
    const [first, ...rest] = [...document.querySelectorAll('.tab')].map((t) => t.textContent)
    return rest.every((t) => t === first)
  })
  const openTabs = async (extra) => {
    for (let n = 0, more = 0; n < 30; n++) {
      if ((await cls('#tabs')).includes('overflow') && more++ >= extra) return
      const c = await tabCount()
      await h.press(ctx, 'Meta+t')
      await h.waitFor(ctx, async () => (await tabCount()) === c + 1 && (await settled()), 'new tab, title settled')
      await h.settle(ctx) // overflow classes set on render
    }
  }

  const shelved = [(await ctx.tie('add', 'terminal', '--shelved')).id]
  await h.resizeWindow(ctx, 900, 600)
  const shelf0 = await box('#shelf')
  h.assert(!(await cls('#tabs')).includes('overflow'), 'one tab: no overflow')

  await openTabs(0)
  const n = await tabCount()
  h.assert(n > 1 && (await h.list(ctx)).tabs.length === n, `${n} tabs`)
  h.assert((await cls('#tabs')).includes('overflow'), 'tabs overflow: divider state')
  let s = await scroll('#tab-list')
  h.assert(s.width > s.client, `tab list scrolls (${s.width} > ${s.client})`)
  h.assert(await currentVisible(), 'new (last) tab scrolled into view')
  h.assert((await cls('#tab-list')).includes('more-left') && !(await cls('#tab-list')).includes('more-right'), 'fade on the left only')
  const shelf1 = await box('#shelf')
  h.assert(Math.abs(shelf1.width - shelf0.width) < 1 && shelf1.right <= (await box('#templates')).left, 'shelf keeps its width, before the templates')
  await ctx.shot('overflow-end')

  await h.press(ctx, 'Meta+1')
  await h.eventually(ctx, async () => {
    h.assert(await currentVisible(), 'first tab scrolled into view')
    h.assert((await cls('#tab-list')).includes('more-right') && !(await cls('#tab-list')).includes('more-left'), 'fade on the right only')
  })

  await ctx.shot('overflow-start')

  // A vertical wheel over the list scrolls it sideways (scrollLeft), and back.
  const tl = await h.boxOf(ctx, '#tab-list')
  await ctx.page.mouse.move(tl.x, tl.y)
  await ctx.page.mouse.wheel(0, 120)
  await h.eventually(ctx, async () => {
    const s = await scroll('#tab-list')
    h.assert(s.left > 0, `wheel down: list scrolled right (${s.left})`)
    h.assert((await cls('#tab-list')).includes('more-left'), 'fade on the left once scrolled')
  })
  await ctx.page.mouse.wheel(0, -120)
  await h.eventually(ctx, async () => h.assert((await scroll('#tab-list')).left === 0, 'wheel up: back to the start'))
  await ctx.page.mouse.move(400, 300)

  // Narrow window, more shelved tiles: the tab list stops at its floor, the shelf scrolls.
  for (let i = 0; i < 5; i++) shelved.push((await ctx.tie('add', 'terminal', '--shelved')).id)
  await h.resizeWindow(ctx, 420, 600)
  const tabs = await box('#tabs')
  const floor = await ctx.page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tabs-min')))
  h.assert(tabs.width >= floor - 1 && tabs.width < floor + 20, `tab list at its floor (${tabs.width} vs ${floor})`)
  s = await scroll('#shelf')
  h.assert(s.width > s.client + 10, `shelf scrolls (${s.width} > ${s.client})`)
  const tpl = await box('#templates')
  h.assert(tpl.right <= 420 && tpl.left > (await box('#shelf')).right - 1, 'templates stay at the edge')
  await ctx.shot('narrow')

  await h.resizeWindow(ctx, 1400, 800)
  // The overflow state follows the width: class and fades as the list's real overflow says.
  await h.eventually(ctx, async () => {
    const s = await scroll('#tab-list')
    const over = s.width > s.client + 1
    const c = await cls('#tab-list')
    h.assert((await cls('#tabs')).includes('overflow') === over, `overflow class ${!over ? 'left on' : 'missing'} (${s.width} vs ${s.client})`)
    h.assert(!over, `1400 px: the tabs fit (${s.width} vs ${s.client})`) // they overflowed 900 px by less than a tab
    h.assert(!c.includes('more-left') && !c.includes('more-right'), `no fades without overflow: ${c}`)
  })
  s = await scroll('#shelf')
  h.assert(s.width <= s.client + 1, 'shelf fits again')
  await h.assertPtySizes(ctx)

  // Auto-scroll. The first tab holds only its board tile again (case b empties it), and 4 more tabs past
  // the overflow at 900 px: room to scroll.
  for (const id of shelved) await ctx.tie('close', '--tile', id)
  await h.waitFor(ctx, async () => !(await h.state(ctx)).shelf.length, 'shelf empty')
  await h.resizeWindow(ctx, 900, 600)
  await openTabs(4)
  h.assert((await cls('#tabs')).includes('overflow'), 'tabs overflow')
  await autoscroll(ctx, h)
}

async function autoscroll(ctx, h) {
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
