// Edit layout mode drags: each component to each bar, gravity by the pointer's half, reorder in a
// group, previews (box at the landing place, animated; a potential bar's own preview), the dragged
// component dimmed, emptied bars hidden, drops outside any bar, clicks; light theme look.
export default async (ctx, h) => {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const BARS = ['top', 'bottom', 'left', 'right']
  const rect = (sel) => ctx.page.$eval(sel, (e) => e.getBoundingClientRect().toJSON())
  const vertical = (bar) => bar === 'left' || bar === 'right'

  // Content: two tabs, two shelved tiles (the shelf has items to show).
  await h.press(ctx, 'Meta+t')
  await h.waitFor(ctx, async () => (await h.list(ctx)).tabs.length === 2, 'second tab')
  for (let i = 0; i < 2; i++) await h.waitTile(ctx, (await ctx.tie('add', 'terminal', '--shelved')).id)

  // Every bar holding something is shown and indicated as existing; empty ones hidden, potential.
  const consistent = async (what) => {
    const m = await h.mountedBars(ctx)
    for (const bar of BARS) {
      const empty = !m[bar].start.length && !m[bar].end.length
      const hidden = await ctx.page.$eval(`#bar-${bar}`, (e) => e.hidden)
      const exists = await ctx.page.$eval(`#layout-edit .le-bar[data-bar="${bar}"]`, (e) => e.classList.contains('exists'))
      h.assert(hidden === empty && exists === !empty, `${what}: bar ${bar} empty=${empty} hidden=${hidden} indicated existing=${exists}`)
    }
    // Labels: inside the window, over no bar and no component, apart from each other.
    await h.settle(ctx)
    const boxes = await ctx.page.evaluate(() => {
      const r = (e) => e.getBoundingClientRect().toJSON()
      return {
        labels: [...document.querySelectorAll('#layout-edit .le-label')].map((e) => ({ c: e.dataset.c, r: r(e) })),
        solid: [...document.querySelectorAll('.bar:not([hidden]), #layout-edit .le-bar')].map(r), // bars and potential zones
        win: { w: innerWidth, h: innerHeight },
      }
    })
    const ov = (p, q) => p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom
    for (const [i, l] of boxes.labels.entries()) {
      h.assert(l.r.left >= 0 && l.r.top >= 0 && l.r.right <= boxes.win.w && l.r.bottom <= boxes.win.h, `${what}: label ${l.c} inside the window`)
      h.assert(!boxes.solid.some((b) => ov(b, l.r)), `${what}: label ${l.c} over no bar or zone`)
      for (const k of boxes.labels.slice(i + 1)) h.assert(!ov(l.r, k.r), `${what}: labels ${l.c} / ${k.c} apart`)
    }
    return m
  }

  await h.editLayout(ctx)

  // Each component to each bar (start), back to the bottom last.
  for (const c of ['tabs', 'shelf', 'templates'])
    for (const bar of ['top', 'left', 'right', 'bottom']) {
      await h.dragComponent(ctx, c, bar, 'start')
      const at = await h.barOf(ctx, c)
      h.assert(at.bar === bar && at.gravity === 'start', `${c} → ${bar} start: ${JSON.stringify(at)}`)
      await consistent(`${c} → ${bar}`)
    }
  h.assert(same(await h.mountedBars(ctx), { top: { start: [], end: [] }, bottom: { start: ['templates', 'shelf', 'tabs'], end: [] }, left: { start: [], end: [] }, right: { start: [], end: [] } }), 'all at the bottom start, in drop order')

  // Gravity by the pointer's half: end, then start again, in a bar of each axis.
  for (const bar of ['top', 'right']) {
    await h.dragComponent(ctx, 'shelf', bar, 'end')
    h.assert(same(await h.barOf(ctx, 'shelf'), { bar, gravity: 'end', vertical: vertical(bar) }), `shelf at ${bar} end`)
    await h.dragComponent(ctx, 'shelf', bar, 'start')
    h.assert((await h.barOf(ctx, 'shelf')).gravity === 'start', `shelf at ${bar} start`)
  }

  // Reorder within one group (left start): first, last, between.
  for (const c of ['tabs', 'shelf', 'templates']) await h.dragComponent(ctx, c, 'left', 'start', { index: 9 })
  h.assert(same((await h.mountedBars(ctx)).left.start, ['tabs', 'shelf', 'templates']), 'left start: tabs, shelf, templates')
  await consistent('all left')
  await h.dragComponent(ctx, 'templates', 'left', 'start', { index: 0 })
  h.assert(same((await h.mountedBars(ctx)).left.start, ['templates', 'tabs', 'shelf']), 'templates first')
  await h.dragComponent(ctx, 'shelf', 'left', 'start', { index: 1 })
  h.assert(same((await h.mountedBars(ctx)).left.start, ['templates', 'shelf', 'tabs']), 'shelf between')
  await ctx.shot('all-left')

  // A drop outside every bar, a click on a component: nothing changes.
  const before = await h.mountedBars(ctx)
  await h.dragComponent(ctx, 'tabs', null)
  const tc = await h.boxOf(ctx, '#layout-edit .le-comp[data-c="tabs"]')
  await ctx.page.mouse.click(tc.x, tc.y)
  h.assert(same(await h.mountedBars(ctx), before), 'drop on the board, click: no change')

  // A side layout to look at: tabs top, shelf left, templates right end.
  await h.dragComponent(ctx, 'tabs', 'top', 'start')
  await h.dragComponent(ctx, 'templates', 'right', 'end')
  await consistent('side layout')
  await ctx.shot('mode-sides')

  // Previews. Over an absent bar (bottom): its own preview at the bar's future rect, the box in it,
  // the dragged component dimmed; the box lands where the component then sits.
  const W = await ctx.page.evaluate(() => innerWidth)
  const H = await ctx.page.evaluate(() => innerHeight)
  let box
  await h.dragComponent(ctx, 'shelf', 'bottom', 'start', {
    during: async () => {
      const bar = await rect('#layout-edit .le-bar[data-bar="bottom"].target:not(.exists)')
      h.assert(bar.left === 0 && bar.width === W && bar.bottom === H && bar.height === 40, `bottom bar preview at its future rect: ${JSON.stringify(bar)}`)
      box = await rect('#layout-edit .le-preview.shown')
      h.assert(box.left >= bar.left && box.right <= bar.right && box.top >= bar.top && box.bottom <= bar.bottom, 'box inside the bar preview')
      const op = await ctx.page.$eval('#shelf', (e) => getComputedStyle(e).opacity)
      h.assert(Number(op) < 0.5, `dragged shelf dimmed (${op})`)
      await ctx.shot('drag-absent-bar')
    },
  })
  const shelfNow = await rect('#shelf')
  h.assert(Math.abs(shelfNow.left - box.left) <= 8 && Math.abs(shelfNow.top - box.top) <= 8, `box at the landing place: box ${JSON.stringify(box)}, shelf ${JSON.stringify(shelfNow)}`)
  h.assert(!(await ctx.page.$('#layout-edit .le-preview.shown')) && (await ctx.page.$eval('#shelf', (e) => getComputedStyle(e).opacity)) === '1', 'after the drop: no preview, not dimmed')
  await ctx.shot('after-drop')

  // Over an existing bar: the box moves (animated) from one end to the other as the pointer
  // crosses the middle.
  const from = await h.boxOf(ctx, '#layout-edit .le-comp[data-c="templates"]')
  const start = await h.layoutPoint(ctx, 'templates', 'bottom', 'start')
  const end = await h.layoutPoint(ctx, 'templates', 'bottom', 'end')
  const m = ctx.page.mouse
  await m.move(from.x, from.y)
  await m.down()
  await m.move(start.x, start.y, { steps: 10 })
  await ctx.page.waitForSelector('#layout-edit .le-preview.shown')
  await h.settle(ctx)
  const atStart = await rect('#layout-edit .le-preview')
  h.assert(atStart.left < W / 2 && (await ctx.page.$('#layout-edit .le-bar[data-bar="bottom"].target.exists')), `box at the bar's start: ${JSON.stringify(atStart)}`)
  await ctx.shot('drag-existing-start')
  h.assert((await ctx.page.$eval('#layout-edit .le-preview', (e) => parseFloat(getComputedStyle(e).transitionDuration))) > 0, 'box moves with a transition')
  await m.move(end.x, end.y, { steps: 10 })
  await h.eventually(ctx, async () => {
    const r = await rect('#layout-edit .le-preview')
    h.assert(r.right > W - 20, `box at the bar's end: ${JSON.stringify(r)}`)
  })
  await ctx.shot('drag-existing-end')
  await m.up()
  await h.settle(ctx)
  h.assert(same(await h.barOf(ctx, 'templates'), { bar: 'bottom', gravity: 'end', vertical: false }), 'templates at the bottom end')
  await consistent('after the animated drag')

  // An emptied bar disappears and is indicated as potential.
  await h.dragComponent(ctx, 'tabs', 'bottom', 'start')
  const now = await consistent('top emptied')
  h.assert(!now.top.start.length && !now.top.end.length, 'top bar empty')

  // Light theme: previewed in the panel, the mode drawn on it.
  await ctx.page.locator('#layout-edit .le-cancel').click()
  await ctx.page.selectOption('#set-theme', 'solarized-light')
  await h.editLayout(ctx)
  await ctx.shot('mode-light')
  await h.dragComponent(ctx, 'templates', 'right', 'start', { during: () => ctx.shot('drag-light') })
  await ctx.page.keyboard.press('Escape')
  await ctx.page.keyboard.press('Escape')
  await ctx.page.waitForSelector('.settings', { state: 'detached' })
}
