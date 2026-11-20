// Tabs in a left / right bar (mixed layouts: shelf in the other side bar, templates top / bottom): one row per tab, full width, brand above, + below; new tab (+), switch, reorder by drag along y, close (×, on hover); drops along y: a tile onto a tab, onto +, a template onto a tab, the bar space below +.
const E = () => ({ start: [], end: [] })
const layout = (patch) => ({ top: E(), bottom: E(), left: E(), right: E(), ...patch })

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
}
