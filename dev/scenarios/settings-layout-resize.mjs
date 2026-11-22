// Bar resize inside the edit layout mode: edges shown above the mode's root; a drag resizes live (dim layer, bar outlines, potential zones, component boxes, labels follow at each move), applied and persisted at the release as in normal use; double-click: the default; an edge press over a component (the tabs, full bar height) resizes, never drags the component; edges out of the way during a component drag; Cancel / Done and the panel's Cancel never revert a size.
import { existsSync, readFileSync } from 'node:fs'
import { uiStatePath } from '../lib.mjs'

const E = () => ({ start: [], end: [] })
const layout = (patch) => ({ top: E(), bottom: E(), left: E(), right: E(), ...patch })

export default async (ctx, h) => {
  const page = ctx.page
  const file = uiStatePath(ctx.instance)
  const fileBars = () => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).bars : null)
  const near = (a, b, what, d = 1) => h.assert(Math.abs(a - b) <= d, `${what}: ${a} vs ${b}`)
  const STRIP = 28
  const W = await page.evaluate(() => innerWidth)

  await h.setBars(ctx, layout({ top: { start: ['tabs'], end: [] }, left: { start: [], end: ['shelf', 'templates'] } }))
  const before = await h.mountedBars(ctx)
  await h.editLayout(ctx)

  // Edges: shown, above the mode's root (the pointer reaches them), only the shown bars'.
  const shownEdges = () => page.$$eval('.bar-edge', (els) => els.filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.dataset.bar).join())
  h.assert((await shownEdges()) === 'left,top', `edit mode: the shown bars' edges (${await shownEdges()})`)
  const hit = (x, y) => page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e?.classList.contains('bar-edge') ? `edge:${e.dataset.bar}` : e?.closest('#layout-edit') ? 'mode' : e?.tagName }, [x, y])
  for (const bar of ['left', 'top']) {
    const e = await h.barEdge(ctx, bar)
    h.assert((await hit(e.x, e.y)) === `edge:${bar}`, `${bar} edge takes the pointer over the mode (${await hit(e.x, e.y)})`)
  }

  // The mode's overlays as drawn, against the bars and components they stand for.
  const overlays = () =>
    page.evaluate(() => {
      const r = (e) => e.getBoundingClientRect().toJSON()
      const q = (s) => document.querySelector(s)
      return {
        dim: r(q('#layout-edit .le-dim')),
        bars: Object.fromEntries(['top', 'bottom', 'left', 'right'].map((b) => [b, r(q(`#layout-edit .le-bar[data-bar="${b}"]`))])),
        comps: Object.fromEntries(['tabs', 'shelf', 'templates'].map((c) => [c, { box: r(q(`#layout-edit .le-comp[data-c="${c}"]`)), el: r(q(`#${c}`)) }])),
        real: Object.fromEntries(['top', 'left'].map((b) => [b, r(q(`#bar-${b}`))])),
      }
    })
  const follows = async (what) => {
    await h.settle(ctx)
    const o = await overlays()
    const { board } = await h.list(ctx)
    near(o.dim.x, board.x, `${what}: dim layer from the left bar (board left)`)
    near(o.dim.y, board.y, `${what}: dim layer from the top bar (board top)`)
    for (const b of ['top', 'left']) for (const k of ['x', 'y', 'width', 'height']) near(o.bars[b][k], o.real[b][k], `${what}: ${b} outline = bar ${k}`)
    // Potential zones: the right one between the top bar and the window bottom, the bottom one right of the left bar.
    near(o.bars.right.y, o.real.top.bottom, `${what}: right zone starts below the top bar`)
    near(o.bars.bottom.x, o.real.left.right, `${what}: bottom zone starts right of the left bar`)
    for (const c of ['shelf', 'templates']) for (const k of ['x', 'y', 'width', 'height']) near(o.comps[c].box[k], o.comps[c].el[k], `${what}: ${c} box ${k}`)
    await h.checkLabels(ctx, what)
  }
  await follows('edit mode, default sizes')

  // Left edge dragged: live overlays, nothing written until the release; persisted at it.
  let s = await h.resizeBar(ctx, 'left', 90, {
    during: async () => {
      near((await h.barSizes(ctx)).shown.left, 90, 'live: left bar 90')
      await follows('live: left 90 (narrow form)')
      h.assert(fileBars() === null, 'live: nothing written during the drag')
      h.assert(await page.$('#layout-edit'), 'live: still in the mode')
      await ctx.shot('live-left-90')
    },
  })
  h.assert(s.stored.left === 90, `left 90 stored: ${JSON.stringify(s.stored)}`)
  await h.eventually(ctx, async () => h.assert(fileBars()?.left === 90, `written at the release: ${JSON.stringify(fileBars())}`))
  await follows('after: left 90')

  // Top edge pressed over the tabs (they span the bar's height): a resize, not a component drag.
  const tabs = (await h.boxOf(ctx, '#layout-edit .le-comp[data-c="tabs"]')).box
  const te = (await h.barEdge(ctx, 'top')).box
  const from = { x: tabs.x + Math.min(30, tabs.width / 2), y: te.y + te.height / 2 }
  h.assert(from.y < tabs.y + tabs.height && from.y > tabs.y, 'the top edge overlaps the tabs box')
  h.assert((await hit(from.x, from.y)) === 'edge:top', `over the tabs: the edge takes the press (${await hit(from.x, from.y)})`)
  await h.drag(ctx, from, { x: from.x, y: from.y + 16 }, {
    steps: 8,
    during: async () => {
      h.assert(!(await page.$('#layout-edit.dragging')) && !(await page.$('#layout-edit .le-preview.shown')), 'edge drag: no component drag, no preview')
      await follows('live: top 56')
    },
  })
  s = await h.barSizes(ctx)
  h.assert(s.stored.top === 56, `top 56: ${JSON.stringify(s.stored)}`)
  h.assert(JSON.stringify(await h.mountedBars(ctx)) === JSON.stringify(before), 'layout unchanged by the edge drags')
  await h.eventually(ctx, async () => h.assert(fileBars()?.top === 56, 'top written'))
  near((await overlays()).bars.left.y, STRIP + 56, 'left outline below the resized top bar')
  await ctx.shot('resized-in-mode')

  // A component drag still works; edges ignore the pointer meanwhile.
  await h.dragComponent(ctx, 'templates', 'bottom', 'end', {
    during: async () => {
      const pe = await page.$$eval('.bar-edge', (els) => els.map((e) => getComputedStyle(e).pointerEvents))
      h.assert(pe.every((p) => p === 'none'), `component drag: edges ignore the pointer (${pe})`)
    },
  })
  await h.eventually(ctx, async () => h.assert((await h.barOf(ctx, 'templates')).bar === 'bottom', 'templates dropped on the bottom bar'))
  h.assert((await shownEdges()) === 'left,top,bottom', `the new bar's edge (${await shownEdges()})`)
  const pe = await page.$eval('.bar-edge[data-bar="left"]', (e) => getComputedStyle(e).pointerEvents)
  h.assert(pe !== 'none', 'after the drag: edges take the pointer again')

  // Cancel: the layout back, the sizes kept (not part of the changeset).
  await page.locator('#layout-edit .le-cancel').click()
  await page.waitForSelector('#layout-edit', { state: 'detached' })
  h.assert(JSON.stringify(await h.mountedBars(ctx)) === JSON.stringify(before), 'Cancel: layout as before')
  s = await h.barSizes(ctx)
  h.assert(s.stored.left === 90 && s.stored.top === 56, `Cancel: sizes kept: ${JSON.stringify(s.stored)}`)

  // Double-click in the mode: the default; Done, then the panel's Cancel: still the default.
  await h.editLayout(ctx)
  const le = await h.barEdge(ctx, 'left')
  await page.mouse.dblclick(le.x, le.y)
  await h.eventually(ctx, async () => h.assert((await h.barSizes(ctx)).stored.left === 160 && fileBars()?.left === 160, 'double-click in the mode: 160, written'))
  await follows('after the double-click')
  await page.locator('#layout-edit .le-done').click()
  await page.waitForSelector('#layout-edit', { state: 'detached' })
  await page.keyboard.press('Escape')
  await page.waitForSelector('.settings', { state: 'detached' })
  s = await h.barSizes(ctx)
  h.assert(s.stored.left === 160 && s.stored.top === 56 && fileBars().left === 160, `panel Cancel: sizes kept: ${JSON.stringify(s.stored)}`)
  h.assert(W > 0 && !/\[error\]/.test(ctx.appLog()), 'no errors')
}
