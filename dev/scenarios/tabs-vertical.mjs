// Tabs in a left / right bar (mixed layouts: shelf in the other side bar, templates top / bottom): one row per tab, full width, brand above, + below; new tab (+), switch, reorder by drag along y, close (×, on hover); drops along y: a tile onto a tab, onto +, a template onto a tab, the bar space below +; the minimum width (40, as any side bar: S54): edge drag clamps there, double-click default, tabs placed in or dragged (edit mode) to a 40 px bar stay at 40, a 40 px bar with the tabs renders inside itself (rows, brand, +, ellipsis; characters shown measured), a window too small (the minimum wins).
import { join } from 'node:path'
import { ROOT } from '../lib.mjs'

const E = () => ({ start: [], end: [] })
const layout = (patch) => ({ top: E(), bottom: E(), left: E(), right: E(), ...patch })
const MIN = 40 // core/barsize.ts: every bar's minimum, the tabs' side bar too

export default async (ctx, h) => {
  const page = ctx.page
  const m = page.mouse
  const L = () => h.list(ctx)
  const order = async () => (await L()).tabs.map((t) => t.id)
  const tabBox = async (id) => (await h.boxOf(ctx, `.tab[data-space="${id}"]`)).box
  const tabPoint = (id) => h.boxOf(ctx, `.tab[data-space="${id}"]`)
  const tabsOf = async (tab) => (await L()).tiles.filter((t) => t.tab === tab).map((t) => t.id)
  const marks = () => page.evaluate(() => ({
    tabs: [...document.querySelectorAll('.tab.drop')].map((e) => e.dataset.space),
    add: document.getElementById('tab-add').classList.contains('drop'),
  }))
  const newTab = async () => {
    const n = (await L()).tabs.length
    await page.locator('#tab-add').click()
    await h.waitFor(ctx, async () => (await L()).tabs.length === n + 1, '+ adds a tab')
    await h.waitShell(ctx, (await L()).active)
  }

  for (const [side, other, tpl] of [['left', 'right', 'top'], ['right', 'left', 'bottom']]) {
    await h.setBars(ctx, layout({ [side]: { start: ['tabs'], end: [] }, [other]: { start: ['shelf'], end: [] }, [tpl]: { start: [], end: ['templates'] } }))
    const p = await h.barOf(ctx, 'tabs')
    h.assert(p.bar === side && p.vertical, `${side}: tabs in the ${side} bar`)
    while ((await L()).tabs.length < 3) await newTab()

    // Rows: one per tab, full bar width (less --pad each side), stacked; brand above, + below.
    const bar = (await h.boxOf(ctx, `#bar-${side}`)).box
    let ids = await order()
    const boxes = await Promise.all(ids.map(tabBox))
    for (const [i, b] of boxes.entries()) {
      h.assert(Math.abs(b.x - (bar.x + 6)) <= 1 && Math.abs(b.width - (bar.width - 12)) <= 1, `${side}: tab ${i} full width (${b.x}, ${b.width} in ${bar.x}, ${bar.width})`)
      if (i) h.assert(b.y >= boxes[i - 1].y + boxes[i - 1].height, `${side}: tab ${i} below tab ${i - 1}`)
    }
    const brand = (await h.boxOf(ctx, '#brand')).box
    const add = (await h.boxOf(ctx, '#tab-add')).box
    h.assert(brand.y + brand.height <= boxes[0].y && add.y >= boxes.at(-1).y + boxes.at(-1).height, `${side}: brand above the tabs, + below`)
    await ctx.shot(`${side}-tabs`)

    // Switch by click; reorder: the first tab dragged down past the third.
    await m.click((await tabPoint(ids[0])).x, (await tabPoint(ids[0])).y)
    await h.waitFor(ctx, async () => (await L()).tab === ids[0], `${side}: click switches`)
    const from = await tabPoint(ids[0])
    const to = await tabBox(ids[2])
    await h.drag(ctx, from, { x: from.x + 3, y: to.y + to.height * 0.75 })
    await h.eventually(ctx, async () => {
      const o = await order()
      h.assert(o.join() === [ids[1], ids[2], ids[0]].join(), `${side}: dragged down to the end (${o})`)
    })
    // And back up, above the first.
    const top = await tabBox(ids[1])
    await h.drag(ctx, await tabPoint(ids[0]), { x: from.x - 3, y: top.y + 3 })
    await h.eventually(ctx, async () => h.assert((await order()).join() === ids.join(), `${side}: dragged back up (${await order()})`))

    // A board tile onto the second tab (along y: every row its own target, survey B2).
    const a = (await L()).active
    const b = (await ctx.tie('add', 'terminal', '--at', a, '--side', 'r')).id
    await h.waitShell(ctx, b)
    await h.drag(ctx, await h.titlePoint(ctx, b), await tabPoint(ids[1]), {
      during: async () => {
        const mk = await marks()
        h.assert(mk.tabs.join() === ids[1] && !mk.add, `${side}: over tab 2: it is highlighted (${JSON.stringify(mk)})`)
        await ctx.shot(`${side}-over-tab`)
      },
    })
    await h.eventually(ctx, async () => {
      const l = await L()
      h.assert((await h.tileOf(ctx, b)).tab === ids[1] && l.tab === ids[1] && l.active === b, `${side}: b joined tab 2, shown`)
    })
    // The third tab, near its lower edge: still the third (nearest along y).
    const t3 = await tabBox(ids[2])
    await h.drag(ctx, await h.titlePoint(ctx, b), { x: t3.x + t3.width / 2, y: t3.y + t3.height - 2 })
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, b)).tab === ids[2], `${side}: b joined tab 3 (lower edge of its row)`)

    // Onto +: a new tab with b; the bar space below +: a new tab too.
    let n = (await L()).tabs.length
    await h.drag(ctx, await h.titlePoint(ctx, b), await h.boxOf(ctx, '#tab-add'), {
      during: async () => {
        const plus = (await h.boxOf(ctx, '#tab-add')).box
        h.assert((await marks()).add && Math.abs(plus.width - (bar.width - 12)) <= 1 && plus.height === 28, `${side}: + highlighted, a full-width slot row (${plus.width}x${plus.height})`)
        await ctx.shot(`${side}-over-add`)
      },
    })
    await h.waitFor(ctx, async () => (await L()).tabs.length === n + 1 && (await tabsOf((await L()).tab)).join() === b, `${side}: + made a tab with b`)
    const below = { x: bar.x + bar.width / 2, y: bar.y + bar.height - 40 }
    const c = (await ctx.tie('add', 'terminal', '--at', b, '--side', 'b')).id
    await h.waitShell(ctx, c)
    n = (await L()).tabs.length
    await h.drag(ctx, await h.titlePoint(ctx, c), below, { during: async () => h.assert((await marks()).add, `${side}: bar space below +: + highlighted`) })
    await h.waitFor(ctx, async () => (await L()).tabs.length === n + 1 && (await tabsOf((await L()).tab)).join() === c, `${side}: bar space made a tab with c`)

    // A template (top / bottom bar) onto the first tab: a new terminal there, tab shown.
    const before = (await tabsOf(ids[0])).length
    await h.drag(ctx, await h.template(ctx), await tabPoint(ids[0]))
    await h.waitFor(ctx, async () => (await tabsOf(ids[0])).length === before + 1 && (await L()).tab === ids[0], `${side}: template tile in tab 1, shown`)

    // Close the tabs b and c made (idle terminals: at once) with their ×, shown on hover.
    for (const t of (await order()).filter((t) => !ids.includes(t))) {
      const tp = await tabPoint(t)
      await m.move(tp.x, tp.y)
      await page.locator(`.tab[data-space="${t}"] .tab-close`).click()
      await h.waitFor(ctx, async () => !(await order()).includes(t), `${side}: × closes the tab`)
    }
    h.assert((await order()).join() === ids.join(), `${side}: three tabs left`)
    await ctx.shot(`${side}-after`)
  }
  await h.assertPtySizes(ctx)

  // Minimum width (S54): a side bar holding the tabs goes down to 40, as any other. Edge drag clamps
  // there (live and at the release); double-click: the default.
  await h.setBars(ctx, layout({ left: { start: ['tabs'], end: [] }, right: { start: ['shelf'], end: [] }, top: { start: [], end: ['templates'] } }))
  const width = async (b) => (await h.boxOf(ctx, `#bar-${b}`)).box.width
  let sz = await h.resizeBar(ctx, 'left', 30, { during: async () => h.assert((await h.barSizes(ctx)).shown.left === MIN, 'edge drag: never under 40, live') })
  h.assert(sz.shown.left === MIN && sz.stored.left === MIN && Math.abs((await width('left')) - MIN) <= 0.5, `edge drag clamps at 40 (${JSON.stringify(sz)})`)

  // At 40 px: every row, the brand and + inside the bar (less the narrow --pad), nothing past it
  // across; titles cut with an ellipsis (a tab titled node_modules). How many characters show:
  // measured (logged).
  await ctx.tie('add', 'terminal', '--tab', 'new', '--cwd', join(ROOT, 'node_modules'))
  await h.waitFor(ctx, async () => (await L()).tabs.some((t) => t.title === 'node_modules'), 'a tab titled node_modules')
  await h.settle(ctx)
  const NARROW_PAD = 4
  const tight = await page.evaluate(() => {
    const r = (e) => e.getBoundingClientRect().toJSON()
    const bar = document.getElementById('bar-left')
    const fits = (t) => {
      const m = document.createElement('span')
      Object.assign(m.style, { font: getComputedStyle(t).font, position: 'absolute', whiteSpace: 'pre' })
      document.body.appendChild(m)
      let n = 0
      for (; n < t.textContent.length; n++) {
        m.textContent = t.textContent.slice(0, n + 1) + '…'
        if (m.getBoundingClientRect().width > t.clientWidth + 0.5) break
      }
      m.remove()
      return n
    }
    return {
      bar: r(bar),
      scroll: { w: bar.scrollWidth, cw: bar.clientWidth },
      brand: { r: r(document.getElementById('brand')), cut: document.getElementById('brand').scrollWidth > document.getElementById('brand').clientWidth, overflow: getComputedStyle(document.getElementById('brand')).textOverflow },
      add: r(document.getElementById('tab-add')),
      plus: r(document.querySelector('#tab-add svg') ?? document.getElementById('tab-add')),
      tabs: [...document.querySelectorAll('#bar-left .tab')].map((e) => {
        const t = e.querySelector('.tab-title')
        return { r: r(e), title: t.textContent, w: t.clientWidth, cut: t.scrollWidth > t.clientWidth, overflow: getComputedStyle(t).textOverflow, chars: fits(t) }
      }),
    }
  })
  const inBar = (q, what) => h.assert(q.left >= tight.bar.left + NARROW_PAD - 0.5 && q.right <= tight.bar.right - NARROW_PAD + 0.5, `40 px: ${what} inside the bar (${JSON.stringify(q)} in ${JSON.stringify(tight.bar)})`)
  h.assert(tight.scroll.w <= tight.scroll.cw, `40 px: no overflow across (${JSON.stringify(tight.scroll)})`)
  for (const [i, t] of tight.tabs.entries()) {
    inBar(t.r, `tab ${i}`)
    h.assert(t.overflow === 'ellipsis' && t.w > 0, `40 px: tab ${i} title with an ellipsis (${JSON.stringify(t)})`)
  }
  h.assert(tight.tabs.some((t) => t.cut), `40 px: a title cut (${JSON.stringify(tight.tabs)})`)
  inBar(tight.add, '+')
  inBar(tight.plus, "+'s glyph")
  if (tight.brand.r.width > 0) (inBar(tight.brand.r, 'brand'), h.assert(tight.brand.overflow === 'ellipsis', '40 px: brand with an ellipsis'))
  console.log('tabs at 40 px: characters shown', JSON.stringify(tight.tabs.map((t) => ({ title: t.title, w: t.w, chars: t.chars }))), 'brand', JSON.stringify(tight.brand))
  await ctx.shot('tabs-40')

  sz = await h.resizeBar(ctx, 'right', 30) // no tabs there: the same minimum
  h.assert(sz.shown.right === MIN, `a side bar without the tabs: 40 (${JSON.stringify(sz)})`)
  await page.dblclick(`.bar-edge[data-bar="left"]`)
  await h.eventually(ctx, async () => h.assert((await h.barSizes(ctx)).stored.left === 160, 'double-click: the default'))

  // Tabs placed (settings) in a 40 px bar: shown at 40.
  await h.setBars(ctx, layout({ top: { start: ['tabs'], end: ['templates'] }, left: { start: ['shelf'], end: [] } }))
  await h.setBarSize(ctx, 'left', MIN)
  await h.setBars(ctx, layout({ top: { start: [], end: ['templates'] }, left: { start: ['tabs', 'shelf'], end: [] } }))
  sz = await h.barSizes(ctx)
  h.assert(sz.shown.left === MIN && sz.stored.left === MIN && Math.abs((await width('left')) - MIN) <= 0.5, `tabs moved in: shown 40 (${JSON.stringify(sz)})`)
  await ctx.shot('tabs-40-from-settings')

  // Tabs dragged in the edit mode onto a 40 px side bar: it stays at 40, during the drag and after.
  await h.setBars(ctx, layout({ top: { start: ['tabs'], end: ['templates'] }, left: { start: ['shelf'], end: [] } }))
  await h.editLayout(ctx)
  await h.dragComponent(ctx, 'tabs', 'left', 'start', {
    during: async () => {
      h.assert((await h.barSizes(ctx)).shown.left === MIN && Math.abs((await width('left')) - MIN) <= 0.5, 'edit mode: tabs over the 40 px bar, it stays 40')
    },
  })
  h.assert((await h.barOf(ctx, 'tabs')).bar === 'left', 'edit mode: tabs dropped in the left bar')
  sz = await h.barSizes(ctx)
  h.assert(sz.shown.left === MIN && sz.stored.left === MIN && Math.abs((await width('left')) - MIN) <= 0.5, `edit mode: dropped, still 40 (${JSON.stringify(sz)})`)
  await page.locator('#layout-edit .le-cancel').click()
  await page.keyboard.press('Escape')
  await page.waitForSelector('.settings', { state: 'detached' })

  // A window too small: the minimum wins over the 30% cap.
  await h.setBars(ctx, layout({ top: { start: [], end: ['templates'] }, left: { start: ['tabs'], end: ['shelf'] } }))
  await h.setBarSize(ctx, 'left', 160)
  const win = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }))
  await h.resizeWindow(ctx, 120, win.h)
  sz = await h.barSizes(ctx)
  h.assert(sz.shown.left === MIN && sz.stored.left === 160, `120 px window (30% = 36): shown 40, stored kept (${JSON.stringify(sz)})`)
  await h.resizeWindow(ctx, win.w, win.h)
  h.assert((await h.barSizes(ctx)).shown.left === 160, 'window back: the stored size')
}
