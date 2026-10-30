// Drops onto tabs: a board tile, a tab's last tile (the tab closes), onto + (new tab), a shelf item, templates (tab, empty tab-list space).
export default async (ctx, h) => {
  const L = () => h.list(ctx)
  // Tab keys here always change the visible tab.
  const k = async (chord) => {
    const tab = (await L()).tab
    await h.press(ctx, chord)
    await h.waitFor(ctx, async () => (await L()).tab !== tab, `${chord} switches tab`)
  }
  const tabOf = async (id) => (await h.tileOf(ctx, id))?.tab
  const tabsOf = async (tab) => (await L()).tiles.filter((t) => t.tab === tab).map((t) => t.id)
  const tabPoint = (sp) => h.boxOf(ctx, `.tab[data-space="${sp}"]`)
  const marks = () => ctx.page.evaluate(() => ({
    tabs: [...document.querySelectorAll('.tab.drop')].map((e) => e.dataset.space),
    add: document.getElementById('tab-add').classList.contains('drop'),
  }))
  const noMarks = async (what) => {
    const m = await marks()
    h.assert(m.tabs.length === 0 && !m.add, `${what}: drop marks cleared (${JSON.stringify(m)})`)
  }

  // Tab 1: a | b. Tab 2: c.
  const a = (await L()).tiles[0].id
  const b = (await ctx.tie('add', 'terminal', '--at', a, '--side', 'r')).id
  await k('Meta+t')
  let l = await L()
  const [t1, t2] = l.tabs.map((t) => t.id)
  const c = l.active
  await k('Meta+1')

  // A board tile over its own tab: no target, nothing happens.
  await h.drag(ctx, await h.titlePoint(ctx, b), await tabPoint(t1), {
    during: async () => h.assert((await marks()).tabs.length === 0, 'own tab: no highlight'),
  })
  h.assert((await tabOf(b)) === t1 && (await L()).tab === t1, 'dropped on its own tab: unchanged')

  // Board tile onto tab 2: joins it, tab 2 shown, b active there; tab 1 keeps a.
  await h.drag(ctx, await h.titlePoint(ctx, b), await tabPoint(t2), {
    during: async () => {
      const m = await marks()
      h.assert(m.tabs.join() === t2 && !m.add, `over tab 2: it is highlighted (${JSON.stringify(m)})`)
      await ctx.shot('over-tab')
    },
  })
  await noMarks('dropped')
  l = await L()
  h.assert((await tabOf(b)) === t2 && l.tab === t2 && l.active === b, `b moved to tab 2, shown, active (tab ${l.tab}, active ${l.active})`)
  h.assert((await tabsOf(t1)).join() === a, 'tab 1 keeps a')
  h.assert(l.tabs.find((t) => t.id === t1).active === a, 'a still active in tab 1')
  await h.eventually(ctx, () => h.assertPtySizes(ctx)) // pty resizes are async
  await ctx.shot('moved')

  // A tab's last tile onto another tab: the emptied tab closes.
  await k('Meta+1')
  await h.drag(ctx, await h.titlePoint(ctx, a), await tabPoint(t2))
  l = await L()
  h.assert(l.tabs.length === 1 && l.tab === t2 && (await tabOf(a)) === t2 && l.active === a, `last tile moved: tab 1 gone (${l.tabs.map((t) => t.id)})`)
  h.assert((await tabsOf(t2)).sort().join() === [a, b, c].sort().join(), 'tab 2 holds a, b, c')

  // Onto +: a new tab holding just that tile.
  await h.drag(ctx, await h.titlePoint(ctx, a), await h.boxOf(ctx, '#tab-add'), {
    during: async () => {
      const m = await marks()
      h.assert(m.add && m.tabs.length === 0, `over +: it is highlighted (${JSON.stringify(m)})`)
      await ctx.shot('over-add')
    },
  })
  await noMarks('dropped on +')
  l = await L()
  const t3 = l.tab
  h.assert(l.tabs.length === 2 && t3 !== t2 && (await tabsOf(t3)).join() === a && l.active === a, `new tab with only a (${JSON.stringify(l.tabs)})`)
  h.assert((await h.tileOf(ctx, a)).state === 'slotted', 'a slotted (root) in the new tab')
  h.assert((await tabsOf(t2)).sort().join() === [b, c].sort().join(), 'tab 2 keeps b, c')
  await h.eventually(ctx, () => h.assertPtySizes(ctx)) // pty resizes are async

  // Shelf item onto another tab: unshelved there (slotted), active.
  const d = (await ctx.tie('add', 'terminal', '--shelved')).id
  await h.settle(ctx)
  await h.drag(ctx, await h.shelfItem(ctx, d), await tabPoint(t2))
  l = await L()
  const dt = await h.tileOf(ctx, d)
  h.assert(dt.tab === t2 && dt.state === 'slotted' && l.tab === t2 && l.active === d, `shelf item d moved to tab 2, slotted (${dt.tab}, ${dt.state})`)
  h.assert(!l.shelf?.includes(d), 'd off the shelf')

  // A shelf item onto its own tab: back on the board there.
  const e = (await ctx.tie('add', 'terminal', '--shelved')).id
  await h.settle(ctx)
  await h.drag(ctx, await h.shelfItem(ctx, e), await tabPoint(t2))
  const et = await h.tileOf(ctx, e)
  h.assert(et.tab === t2 && et.state === 'slotted' && (await L()).active === e, `shelf item onto own tab: unshelved (${et.state})`)

  // Template onto a tab: a new terminal there, tab shown.
  await h.drag(ctx, await h.template(ctx), await tabPoint(t3))
  await h.waitFor(ctx, async () => (await tabsOf(t3)).length === 2, 'template tile in tab 3')
  l = await L()
  h.assert(l.tab === t3 && l.active !== a && (await tabsOf(t3)).includes(l.active), 'template: tab 3 shown, new tile active')

  // Template onto the tab list's empty space: a new tab with that tile.
  const tabs = (await h.boxOf(ctx, '#tabs')).box
  const add = (await h.boxOf(ctx, '#tab-add')).box
  h.assert(tabs.x + tabs.width - (add.x + add.width) > 40, 'empty space right of +')
  const n = (await L()).tabs.length
  await h.drag(ctx, await h.template(ctx), { x: tabs.x + tabs.width - 20, y: tabs.y + tabs.height / 2 }, {
    during: async () => h.assert((await marks()).add, 'empty tab-list space: + highlighted'),
  })
  await h.waitFor(ctx, async () => (await L()).tabs.length === n + 1, 'new tab from template')
  l = await L()
  h.assert((await tabsOf(l.tab)).length === 1 && (await h.tileOf(ctx, l.active)).kind === 'terminal', 'new tab holds one terminal')

  // File template onto a tab: picker, then the file there.
  const md = `${process.cwd()}/dev/samples/markdown.md`
  await h.pickNext(ctx, md)
  await h.drag(ctx, await h.template(ctx, 'file'), await tabPoint(t2))
  await h.waitFor(ctx, async () => (await L()).tiles.some((t) => t.kind === 'markdown' && t.tab === t2), 'markdown tile in tab 2')
  h.assert((await L()).tab === t2, 'file template: tab 2 shown')

  // Escape mid-drag: marks cleared, nothing moved.
  const m0 = await tabOf(b)
  await h.drag(ctx, await h.titlePoint(ctx, b), await tabPoint(t3), {
    during: async () => {
      await ctx.page.keyboard.press('Escape')
      await h.settle(ctx)
      await noMarks('escape')
    },
  })
  h.assert((await tabOf(b)) === m0, 'escape: b stays')
  await ctx.shot('after')
}
