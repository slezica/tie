// Bar contest, both axes (bottom bar, then a left bar): tabs that don't fit scroll along the bar (fades at the cut ends, divider toward the shelf, current tab kept in view; a vertical wheel scrolls a horizontal list sideways, a vertical list natively); the shelf keeps its size until the tab list hits its floor, then the shelf scrolls. Auto-scroll while dragging near the list's ends: a tab reorder (the order follows the scroll), a tile over the tabs (the drop highlight follows, onto a tab that was out of view), the start end. No loop left running after a drop.
const E = () => ({ start: [], end: [] })

// Along the list's axis: x (bottom bar) or y (left bar).
const AXES = {
  h: { name: 'bottom', v: false, pos: 'scrollLeft', size: 'scrollWidth', client: 'clientWidth', lo: 'x', ext: 'width', pt: (along, across) => ({ x: along, y: across }) },
  v: { name: 'left', v: true, pos: 'scrollTop', size: 'scrollHeight', client: 'clientHeight', lo: 'y', ext: 'height', pt: (along, across) => ({ x: across, y: along }) },
}
const crossLo = (ax) => (ax.v ? 'x' : 'y')
const crossExt = (ax) => (ax.v ? 'width' : 'height')

export default async (ctx, h) => {
  const box = (sel) => ctx.page.evaluate((sel) => document.querySelector(sel).getBoundingClientRect().toJSON(), sel)
  const cls = (sel) => ctx.page.evaluate((sel) => [...document.querySelector(sel).classList], sel)
  const scroll = (sel, ax) => ctx.page.evaluate(([sel, ax]) => {
    const el = document.querySelector(sel)
    return { pos: el[ax.pos], size: el[ax.size], client: el[ax.client], max: el[ax.size] - el[ax.client] }
  }, [sel, { pos: ax.pos, size: ax.size, client: ax.client }])
  const currentVisible = async (ax) => {
    const list = await box('#tab-list')
    const cur = await box('.tab.current')
    const lo = ax.lo
    return cur[lo] >= list[lo] - 1 && cur[lo] + cur[ax.ext] <= list[lo] + list[ax.ext] + 1
  }
  const fades = async (sel, start, end, what) => {
    const c = await cls(sel)
    const depth = await ctx.page.evaluate((sel) => { const cs = getComputedStyle(document.querySelector(sel)); return [cs.getPropertyValue('--fade-s').trim(), cs.getPropertyValue('--fade-e').trim()] }, sel)
    h.assert((depth[0] === '24px') === start && (depth[1] === '24px') === end, `${what}: mask depths (${depth})`)
    h.assert(c.includes('more-start') === start && c.includes('more-end') === end, `${what}: fades ${start ? 'start' : ''}${start && end ? ' + ' : ''}${end ? 'end' : ''}${!start && !end ? 'none' : ''} (${c})`)
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

  const H = AXES.h
  // The overflow happens in new tabs: their shelves are empty (one slot long); measured as such.
  const shelf0 = await box('#shelf.empty')
  const shelved = [(await ctx.tie('add', 'terminal', '--shelved')).id]
  await h.resizeWindow(ctx, 900, 600)
  h.assert(!(await cls('#tabs')).includes('overflow'), 'one tab: no overflow')

  await openTabs(1) // one past the overflow: tab 1, whose shelf holds one item (as long as an empty one), overflows too
  const n = await tabCount()
  h.assert(n > 1 && (await h.list(ctx)).tabs.length === n, `${n} tabs`)
  h.assert((await cls('#tabs')).includes('overflow'), 'tabs overflow: divider state')
  let s = await scroll('#tab-list', H)
  h.assert(s.size > s.client, `tab list scrolls (${s.size} > ${s.client})`)
  h.assert(await currentVisible(H), 'new (last) tab scrolled into view')
  await fades('#tab-list', true, false, 'at the end')
  const shelf1 = await box('#shelf')
  h.assert(Math.abs(shelf1.width - shelf0.width) < 1 && shelf1.right <= (await box('#templates')).left, 'shelf keeps its width, before the templates')
  await ctx.shot('overflow-end')

  await h.press(ctx, 'Meta+1')
  await h.eventually(ctx, async () => {
    h.assert(await currentVisible(H), 'first tab scrolled into view')
    await fades('#tab-list', false, true, 'at the start')
  })
  await ctx.shot('overflow-start')

  // A vertical wheel over the list scrolls it sideways (scrollLeft), and back.
  const tl = await h.boxOf(ctx, '#tab-list')
  await ctx.page.mouse.move(tl.x, tl.y)
  await ctx.page.mouse.wheel(0, 120)
  await h.eventually(ctx, async () => {
    const s = await scroll('#tab-list', H)
    h.assert(s.pos > 0, `wheel down: list scrolled right (${s.pos})`)
    h.assert((await cls('#tab-list')).includes('more-start'), 'start fade once scrolled')
  })
  await ctx.page.mouse.wheel(0, -120)
  await h.eventually(ctx, async () => h.assert((await scroll('#tab-list', H)).pos === 0, 'wheel up: back to the start'))
  const away = async () => {
    const { board } = await h.list(ctx)
    await ctx.page.mouse.move(board.x + board.w / 2, board.y + board.h / 2)
  }
  await away()

  // Narrow window, more shelved tiles: the tab list stops at its floor, the shelf scrolls.
  for (let i = 0; i < 5; i++) shelved.push((await ctx.tie('add', 'terminal', '--shelved')).id)
  await h.resizeWindow(ctx, 420, 600)
  const floor = await ctx.page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tabs-min')))
  const tabs = await box('#tabs')
  h.assert(tabs.width >= floor - 1 && tabs.width < floor + 20, `tab list at its floor (${tabs.width} vs ${floor})`)
  s = await scroll('#shelf', H)
  h.assert(s.size > s.client + 10, `shelf scrolls (${s.size} > ${s.client})`)
  const tpl = await box('#templates')
  h.assert(tpl.right <= 420 && tpl.left > (await box('#shelf')).right - 1, 'templates stay at the edge')
  await ctx.shot('narrow')

  await h.resizeWindow(ctx, 1400, 800)
  // The overflow state follows the width: class and fades as the list's real overflow says.
  await h.eventually(ctx, async () => {
    const s = await scroll('#tab-list', H)
    const over = s.size > s.client + 1
    h.assert((await cls('#tabs')).includes('overflow') === over, `overflow class ${!over ? 'left on' : 'missing'} (${s.size} vs ${s.client})`)
    h.assert(!over, `1400 px: the tabs fit (${s.size} vs ${s.client})`) // they overflowed 900 px by less than a tab
    await fades('#tab-list', false, false, 'no overflow')
  })
  s = await scroll('#shelf', H)
  h.assert(s.size <= s.client + 1, 'shelf fits again')
  await h.assertPtySizes(ctx)

  // Auto-scroll. The first tab holds only its board tile again (case b empties it), and 4 more tabs past
  // the overflow at 900 px: room to scroll.
  for (const id of shelved.splice(0)) await ctx.tie('close', '--tile', id)
  await h.waitFor(ctx, async () => !(await h.state(ctx)).shelf.length, 'shelf empty')
  await h.resizeWindow(ctx, 900, 600)
  await openTabs(4)
  h.assert((await cls('#tabs')).includes('overflow'), 'tabs overflow')
  await autoscroll(ctx, h, H)

  // Left bar, everything in it: the same along y. A vertical list scrolls natively under the wheel.
  const V = AXES.v
  await h.setBars(ctx, { top: E(), bottom: E(), right: E(), left: { start: ['tabs'], end: ['shelf', 'templates'] } })
  await h.resizeWindow(ctx, 900, 500)
  await h.press(ctx, 'Meta+9')
  await h.eventually(ctx, async () => {
    h.assert((await cls('#tabs')).includes('overflow'), 'left bar: tabs overflow')
    h.assert(await currentVisible(V), 'left bar: last tab scrolled into view')
    await fades('#tab-list', true, false, 'left bar, at the end')
  })
  const tabsV = await box('#tabs')
  h.assert(Math.abs(tabsV.bottom - (await box('#tab-add')).bottom) <= 7, 'left bar: + at the bottom of the tabs')
  await ctx.shot('vertical-overflow-end')
  await h.press(ctx, 'Meta+1')
  await h.eventually(ctx, async () => {
    h.assert(await currentVisible(V), 'left bar: first tab scrolled into view')
    await fades('#tab-list', false, true, 'left bar, at the start')
  })
  await ctx.shot('vertical-overflow-start')
  const tv = await h.boxOf(ctx, '#tab-list')
  await ctx.page.mouse.move(tv.x, tv.y)
  await ctx.page.mouse.wheel(0, 120)
  await h.eventually(ctx, async () => {
    const s = await scroll('#tab-list', V)
    h.assert(s.pos > 0 && (await scroll('#tab-list', H)).pos === 0, `left bar, wheel down: list scrolled down natively (${s.pos})`)
    await fades('#tab-list', true, s.pos < s.max - 1, 'left bar, scrolled')
  })
  await away()

  // Contest along y: shelved tiles until the shelf fills the bar; the tabs at their floor, the
  // shelf scrolls, templates whole.
  for (let i = 0; i < 10; i++) shelved.push((await ctx.tie('add', 'terminal', '--shelved')).id)
  await h.eventually(ctx, async () => {
    const t = await box('#tabs')
    h.assert(t.height >= floor - 1 && t.height < floor + 20, `left bar: tab list at its floor (${t.height} vs ${floor})`)
    const s = await scroll('#shelf', V)
    h.assert(s.size > s.client + 10, `left bar: shelf scrolls (${s.size} > ${s.client})`)
    const tp = await box('#templates')
    h.assert(Math.round(tp.height) >= 3 * 28 && tp.top >= (await box('#shelf')).bottom - 1, `left bar: templates whole, after the shelf (${tp.height})`)
  })
  await ctx.shot('vertical-contest')
  for (const id of shelved.splice(0)) await ctx.tie('close', '--tile', id)
  await h.waitFor(ctx, async () => !(await h.state(ctx)).shelf.length, 'shelf empty')
  await h.settle(ctx)
  await autoscroll(ctx, h, V)
}

async function autoscroll(ctx, h, ax) {
  const scroll = () => ctx.page.evaluate((ax) => {
    const el = document.getElementById('tab-list')
    return { pos: el[ax.pos], max: el[ax.size] - el[ax.client] }
  }, { pos: ax.pos, size: ax.size, client: ax.client })
  const setScroll = (n) => ctx.page.evaluate(([n, p]) => (document.getElementById('tab-list')[p] = n), [n, ax.pos])
  const listBox = async () => (await h.boxOf(ctx, '#tab-list')).box
  const tabBoxes = () => ctx.page.evaluate(() =>
    Object.fromEntries([...document.querySelectorAll('.tab')].map((t) => [t.dataset.space, t.getBoundingClientRect().toJSON()])))
  const order = async () => (await h.list(ctx)).tabs.map((t) => t.id)
  const dropMark = () => ctx.page.evaluate(() => [...document.querySelectorAll('.tab.drop')].map((e) => e.dataset.space))
  const mid = (b) => b[ax.lo] + b[ax.ext] / 2
  const m = ctx.page.mouse
  const go = (p, o) => m.move(p.x, p.y, o) // a point's x, y only (Playwright reads x, y from the options too)
  const at = (along, across) => {
    const p = ax.pt(along, across)
    return m.move(p.x, p.y, { steps: 12 })
  }
  const what = (s) => `${ax.name} bar: ${s}`
  // A loop left running would keep scrolling: the position holds after a drop, also from mid-list.
  const stays = async (w) => {
    await h.settle(ctx)
    const s0 = (await scroll()).pos
    await ctx.sleep(300) // absence: no scrolling meanwhile
    h.assert((await scroll()).pos === s0, what(`${w}: scroll stays after the drop (${s0})`))
    const half = Math.round((await scroll()).max / 2)
    await setScroll(half)
    await ctx.sleep(300) // absence: no scrolling meanwhile
    h.assert((await scroll()).pos === half, what(`${w}: no scrolling after the drop (mid ${half})`))
  }

  await h.press(ctx, 'Meta+1')
  await setScroll(0) // the first tab may already be current, the list scrolled by hand
  await h.eventually(ctx, async () => h.assert((await scroll()).pos === 0, what('first tab shown: scrolled to the start')))

  // (a) The first tab dragged into the end zone, held: the list scrolls, the tab moves on with it.
  let list = await listBox()
  const across = list[crossLo(ax)] + list[crossExt(ax)] / 2
  const zEnd = list[ax.lo] + list[ax.ext] - 8
  let ids = await order()
  const first = ids[0]
  let boxes = await tabBoxes()
  const idx0 = ids.slice(1).filter((id) => mid(boxes[id]) < zEnd).length // index if nothing scrolled
  await go(ax.pt(mid(boxes[first]), across))
  await m.down()
  await at(zEnd, across)
  let s
  let idx
  await h.eventually(ctx, async () => {
    s = await scroll()
    idx = (await order()).indexOf(first)
    h.assert(s.pos > 0, what(`tab drag at the end: list scrolled (${s.pos})`))
    h.assert(idx > idx0, what(`dragged tab moved on with the scroll (index ${idx} > ${idx0})`))
  })
  await ctx.shot(`${ax.name}-tab-drag-end`)
  await m.up()
  await stays('tab drag')

  // (b) A board tile's title bar into the end zone: scrolls, highlight on a tab that was out of view;
  // dropped there, the tile joins it.
  await h.press(ctx, 'Meta+1')
  await h.eventually(ctx, async () => h.assert((await scroll()).pos === 0, what('back at the start')))
  let l = await h.list(ctx)
  const tile = l.active
  const src = l.tab
  list = await listBox()
  boxes = await tabBoxes()
  await go(await h.titlePoint(ctx, tile))
  await m.down()
  await at(zEnd, across)
  await h.waitFor(ctx, async () => {
    const s = await scroll()
    return s.pos >= 300 || s.pos >= s.max - 1 // the end (fractional scroll positions)
  }, what('tile drag scrolled'))
  let mark
  await h.eventually(ctx, async () => {
    mark = await dropMark()
    h.assert(mark.length === 1 && mark[0] !== src, what(`one tab highlighted (${mark})`))
    h.assert(boxes[mark[0]][ax.lo] >= list[ax.lo] + list[ax.ext] - 1, what(`highlighted tab was out of view (${boxes[mark[0]][ax.lo]}, list end ${list[ax.lo] + list[ax.ext]})`))
  })
  await ctx.shot(`${ax.name}-tile-drag-end`)
  await m.up()
  await h.eventually(ctx, async () => {
    l = await h.list(ctx)
    h.assert((await h.tileOf(ctx, tile)).tab === mark[0] && l.tab === mark[0] && l.active === tile, what(`tile joined the highlighted tab, shown (${l.tab})`))
    h.assert(!l.tabs.some((t) => t.id === src), what('emptied source tab closed'))
  })
  await stays('tile drag')

  // (c) Start end, from the end of the list: the last tab dragged into the start zone.
  await setScroll((await scroll()).max)
  await h.settle(ctx)
  const s0 = (await scroll()).pos
  ids = await order()
  const last = ids[ids.length - 1]
  boxes = await tabBoxes()
  list = await listBox()
  const zStart = list[ax.lo] + 8
  await go(ax.pt(mid(boxes[last]), across))
  await m.down()
  await at(zStart, across)
  const before = ids.filter((id) => mid(boxes[id]) < zStart).length
  await h.eventually(ctx, async () => {
    s = await scroll()
    idx = (await order()).indexOf(last)
    h.assert(s.pos < s0, what(`tab drag at the start: list scrolled back (${s.pos} < ${s0})`))
    h.assert(idx < before, what(`dragged tab moved back with the scroll (index ${idx} < ${before})`))
  })
  await ctx.shot(`${ax.name}-tab-drag-start`)
  await m.up()
  await stays('start drag')
}
