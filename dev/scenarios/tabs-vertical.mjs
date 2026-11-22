// Tabs in a left / right bar (mixed layouts: shelf in the other side bar, templates top / bottom): one row per tab, full width, brand above, + below; new tab (+), switch, reorder by drag along y, close (×, on hover); drops along y: a tile onto a tab, onto +, a template onto a tab, the bar space below +; the minimum width (TABS_MIN): edge drag clamps, double-click default, tabs placed in a smaller bar shown at the minimum (stored kept), a window too small (the minimum wins).
const E = () => ({ start: [], end: [] })
const layout = (patch) => ({ top: E(), bottom: E(), left: E(), right: E(), ...patch })
const TABS_MIN = 65 // core/barsize.ts: a side bar holding the tabs

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

  // Minimum width (feel round 5): a side bar holding the tabs is at least TABS_MIN (5 letters of a
  // title). Edge drag clamps there (live and at the release); double-click: the default as before.
  await h.setBars(ctx, layout({ left: { start: ['tabs'], end: [] }, right: { start: ['shelf'], end: [] }, top: { start: [], end: ['templates'] } }))
  const width = async (b) => (await h.boxOf(ctx, `#bar-${b}`)).box.width
  let sz = await h.resizeBar(ctx, 'left', 30, { during: async () => h.assert((await h.barSizes(ctx)).shown.left === TABS_MIN, 'edge drag: never under TABS_MIN, live') })
  h.assert(sz.shown.left === TABS_MIN && sz.stored.left === TABS_MIN && Math.abs((await width('left')) - TABS_MIN) <= 0.5, `edge drag clamps at TABS_MIN (${JSON.stringify(sz)})`)
  sz = await h.resizeBar(ctx, 'right', 30) // no tabs there: the plain minimum
  h.assert(sz.shown.right === 48, `a side bar without the tabs: 48 (${JSON.stringify(sz)})`)
  await page.dblclick(`.bar-edge[data-bar="left"]`)
  await h.eventually(ctx, async () => h.assert((await h.barSizes(ctx)).stored.left === 160, 'double-click: the default'))

  // Tabs placed (settings) in a bar whose stored size is smaller: shown at TABS_MIN, stored kept; the
  // tabs gone, the stored size again.
  await h.setBars(ctx, layout({ top: { start: ['tabs'], end: ['templates'] }, left: { start: ['shelf'], end: [] } }))
  await h.setBarSize(ctx, 'left', 48)
  h.assert(Math.abs((await width('left')) - 48) <= 0.5, 'left 48 without the tabs')
  await h.setBars(ctx, layout({ top: { start: [], end: ['templates'] }, left: { start: ['tabs', 'shelf'], end: [] } }))
  sz = await h.barSizes(ctx)
  h.assert(sz.shown.left === TABS_MIN && sz.stored.left === 48 && Math.abs((await width('left')) - TABS_MIN) <= 0.5, `tabs moved in: shown TABS_MIN, stored 48 (${JSON.stringify(sz)})`)
  await ctx.shot('tabs-min-from-settings')
  await h.setBars(ctx, layout({ top: { start: ['tabs'], end: ['templates'] }, left: { start: ['shelf'], end: [] } }))
  h.assert(Math.abs((await width('left')) - 48) <= 0.5, 'tabs gone: back to the stored 48')

  // A window too small for both rules: TABS_MIN wins over the 30% cap (as 48 does for any side bar).
  await h.setBars(ctx, layout({ top: { start: [], end: ['templates'] }, left: { start: ['tabs'], end: ['shelf'] } }))
  await h.setBarSize(ctx, 'left', 160)
  const win = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }))
  await h.resizeWindow(ctx, 200, win.h)
  sz = await h.barSizes(ctx)
  h.assert(sz.shown.left === TABS_MIN && sz.stored.left === 160, `200 px window (30% = 60): shown TABS_MIN, stored kept (${JSON.stringify(sz)})`)
  await h.resizeWindow(ctx, win.w, win.h)
  h.assert((await h.barSizes(ctx)).shown.left === 160, 'window back: the stored size')
}
