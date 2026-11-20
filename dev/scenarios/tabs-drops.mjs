// Drops onto tabs: empty bar space goes to the nearest component (shelf / new tab), a board tile, a tab's last tile (the tab closes), onto + (new tab), a shelf item, templates (tab, empty tab-list space); tabs and shelf in different bars; a templates-only bar takes nothing.
export default async (ctx, h) => {
  const L = () => h.list(ctx)
  let l
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

  // Empty bar space between the tabs and the shelf: the nearest of the two (S26). One tab, empty shelf.
  const ghosts = () => ctx.page.locator('#shelf .item.ghost').count()
  const tb = (await h.boxOf(ctx, '#bar-bottom')).box
  const gapL = (await h.boxOf(ctx, '#tabs')).box
  const gapR = (await h.boxOf(ctx, '#shelf')).box
  const mid = (gapL.x + gapL.width + gapR.x) / 2
  h.assert(gapL.x + gapL.width < mid - 40 && gapR.x > mid + 40, `free bar on both sides of the gap's midpoint (tabs ${gapL.x + gapL.width}, mid ${mid}, shelf ${gapR.x})`)
  const gy = tb.y + tb.height / 2
  // Right half: the shelf, slot 0 (ghost, no hint). + is a slot square while dragging.
  await h.drag(ctx, await h.titlePoint(ctx, b), { x: mid + 20, y: gy }, {
    during: async () => {
      const add = await ctx.page.evaluate(() => document.getElementById('tab-add').getBoundingClientRect().toJSON())
      h.assert(add.width === 28 && add.height === 28, `dragging: + is a 28px square (${add.width}x${add.height})`)
      const m = await marks()
      h.assert((await ghosts()) === 1 && !m.add && m.tabs.length === 0, `nearer the shelf: shelf ghost, no tab marks (${JSON.stringify(m)})`)
      await ctx.shot('gap-shelf')
    },
  })
  h.assert((await h.tileOf(ctx, b)).state === 'shelved' && (await L()).shelf[0] === b, 'gap right of mid: b shelved')
  // Left half: a new tab (+ highlighted, no ghost).
  await h.drag(ctx, await h.shelfItem(ctx, b), { x: mid - 20, y: gy }, {
    during: async () => {
      const m = await marks()
      h.assert(m.add && (await ghosts()) === 0, `gap left of mid: + highlighted, no ghost (${JSON.stringify(m)})`)
    },
  })
  l = await L()
  h.assert(l.tabs.length === 2 && (await tabsOf(l.tab)).join() === b && !l.shelf?.includes(b), `gap left of mid: new tab with b (${JSON.stringify(l.tabs)})`)
  // Back to tab 1: a, b.
  await h.drag(ctx, await h.titlePoint(ctx, b), await tabPoint(l.tabs[0].id))
  await h.waitFor(ctx, async () => (await L()).tabs.length === 1, 'b back in tab 1')
  await k('Meta+t')
  l = await L()
  const [t1, t2] = l.tabs.map((t) => t.id)
  const c = l.active
  await k('Meta+1')

  // A board tile over its own tab: no target, nothing happens (layout, active tile, tabs).
  const own0 = await h.state(ctx)
  const tabs0 = (await L()).tabs.map((t) => t.id).join()
  await h.drag(ctx, await h.titlePoint(ctx, b), await tabPoint(t1), {
    during: async () => {
      const m = await marks()
      h.assert(m.tabs.length === 0 && !m.add, `own tab: no highlight (${JSON.stringify(m)})`)
      h.assert(!(await ctx.page.isVisible('#preview')), 'own tab: no drop preview')
    },
  })
  const own1 = await h.state(ctx)
  l = await L()
  h.assert((await tabOf(b)) === t1 && l.tab === t1 && l.tabs.map((t) => t.id).join() === tabs0, 'dropped on its own tab: same tab, tabs unchanged')
  h.assert(JSON.stringify(own1.tree) === JSON.stringify(own0.tree) && own1.floats.length === 0 && own1.shelf.length === 0 && own1.active === own0.active, `own tab: layout and active unchanged: ${JSON.stringify(own0)} -> ${JSON.stringify(own1)}`)

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
  await h.assertPtySizes(ctx)
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
  await h.assertPtySizes(ctx)

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
  h.assert(mid - (add.x + add.width) > 40, 'empty space right of +, nearer the tabs')
  const n = (await L()).tabs.length
  await h.drag(ctx, await h.template(ctx), { x: add.x + add.width + 20, y: tabs.y + tabs.height / 2 }, {
    during: async () => h.assert((await marks()).add, 'empty tab-list space: + highlighted'),
  })
  await h.waitFor(ctx, async () => (await L()).tabs.length === n + 1, 'new tab from template')
  l = await L()
  h.assert((await tabsOf(l.tab)).length === 1 && (await h.tileOf(ctx, l.active)).kind === 'terminal', 'new tab holds one terminal')

  // File template onto a tab: picker, then the file there.
  const md = `${process.cwd()}/dev/samples/markdown.md`
  await h.drag(ctx, await h.template(ctx, 'file'), await tabPoint(t2))
  await h.pick(ctx, md)
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

  // Tabs on top, shelf + templates at the bottom (each bar's own components, survey B5).
  const E = () => ({ start: [], end: [] })
  await h.setBars(ctx, { top: { start: ['tabs'], end: [] }, bottom: { start: [], end: ['shelf', 'templates'] }, left: E(), right: E() })
  const top = (await h.boxOf(ctx, '#bar-top')).box
  const bottom = (await h.boxOf(ctx, '#bar-bottom')).box
  const away = async (id) => {
    const p = await h.titlePoint(ctx, id)
    return { x: p.x, y: p.y }
  }
  // Top bar, far right (no shelf there): a new tab.
  let n2 = (await L()).tabs.length
  const f = (await ctx.tie('add', 'terminal')).id
  await h.drag(ctx, await away(f), { x: top.x + top.width - 30, y: top.y + top.height / 2 }, {
    during: async () => h.assert((await marks()).add && (await ghosts()) === 0, 'top bar, far from the tabs: + highlighted (no shelf in this bar)'),
  })
  await h.waitFor(ctx, async () => (await L()).tabs.length === n2 + 1 && (await tabsOf((await L()).tab)).join() === f, 'top bar space: a new tab with f')
  // Bottom bar, far left (no tabs there): the shelf, at its near end (before the items).
  await ctx.tie('add', 'terminal', '--shelved')
  const g = (await ctx.tie('add', 'terminal')).id
  await h.settle(ctx)
  const shelf0 = (await L()).shelf
  await h.drag(ctx, await away(g), { x: bottom.x + 30, y: bottom.y + bottom.height / 2 }, {
    during: async () => h.assert((await ghosts()) === 1 && !(await marks()).add, 'bottom bar, far from the shelf: shelf ghost, no tab mark'),
  })
  l = await L()
  h.assert((await h.tileOf(ctx, g)).state === 'shelved' && l.shelf[0] === g && l.shelf.slice(1).join() === shelf0.join(), `bottom bar space: g shelved first (${l.shelf})`)
  await ctx.shot('split-bars')

  // A bar holding only the templates takes nothing; over the templates: nothing either.
  await h.setBars(ctx, { top: { start: ['tabs'], end: ['shelf'] }, bottom: { start: [], end: ['templates'] }, left: E(), right: E() })
  const only = (await h.boxOf(ctx, '#bar-bottom')).box
  const st0 = await h.state(ctx)
  const tabs0b = (await L()).tabs.length
  const t = (await L()).active
  await h.drag(ctx, await away(t), { x: only.x + 40, y: only.y + only.height / 2 }, {
    during: async () => {
      h.assert((await ghosts()) === 0 && !(await marks()).add && !(await ctx.page.isVisible('#preview')), 'templates-only bar: no target')
    },
  })
  await h.drag(ctx, await away(t), await h.template(ctx), {
    during: async () => h.assert((await ghosts()) === 0 && !(await marks()).add, 'over the templates: no target'),
  })
  const st1 = await h.state(ctx)
  h.assert(JSON.stringify(st1.tree) === JSON.stringify(st0.tree) && st1.shelf.join() === st0.shelf.join() && (await L()).tabs.length === tabs0b, 'nothing moved')
}
