// Bar sizes (LAYOUT.md "Bar sizes"): drag each bar's edge (all four sides), board insets follow live;
// clamps (horizontal 40..60, vertical 40..30% of the window, kept stored when the window narrows);
// double-click resets; edges vs corners, tile borders, edit mode (edges shown); panel layout Reset leaves sizes;
// UI state file written at drag end only (0600) and restored after a restart.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { uiStatePath } from '../lib.mjs'

export default async (ctx, h) => {
  const file = uiStatePath(ctx.instance)
  const fileBars = () => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).bars : null)
  const near = (a, b, what, tol = 1) => h.assert(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`)
  const board = async () => (await h.list(ctx)).board
  const W = await ctx.page.evaluate(() => innerWidth)
  const H = await ctx.page.evaluate(() => innerHeight)
  const STRIP = 28

  // Default: bottom bar 40, only its edge shown; no file yet.
  let s = await h.barSizes(ctx)
  h.assert(JSON.stringify(s.stored) === JSON.stringify({ top: 40, bottom: 40, left: 160, right: 160 }), `defaults: ${JSON.stringify(s.stored)}`)
  const shownEdges = () => ctx.page.$$eval('.bar-edge', (els) => els.filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.dataset.bar).join())
  h.assert((await shownEdges()) === 'bottom', `edges shown: ${await shownEdges()}`)
  h.assert(fileBars() === null, 'no state file before a resize')
  h.assert((await ctx.page.$eval('.bar-edge[data-bar="bottom"]', (e) => getComputedStyle(e).webkitAppRegion ?? getComputedStyle(e).getPropertyValue('-webkit-app-region'))) === 'no-drag', 'edge: not a window drag region')
  let b = await board()
  near(b.y + b.h, H - 40, 'board bottom at the 40 px bar')

  // The edge's line (feel round 6): not lit on hover in normal use (the cursor says it), lit while
  // dragged (below). Hover in the edit mode: settings-layout-resize.
  const lit = (bar) => ctx.page.$eval(`.bar-edge[data-bar="${bar}"]`, (e) => Number(getComputedStyle(e, '::after').opacity))
  const hover = await h.barEdge(ctx, 'bottom')
  await ctx.page.mouse.move(hover.x, hover.y)
  await h.waitFor(ctx, () => ctx.page.$eval('.bar-edge[data-bar="bottom"]', (e) => e.matches(':hover')), 'pointer over the bottom edge')
  h.assert((await lit('bottom')) === 0, `hovered edge not lit: ${await lit('bottom')}`)

  // Bottom edge dragged up: live insets during the drag, the file only at the end.
  await h.resizeBar(ctx, 'bottom', 56, {
    during: async () => {
      h.assert((await lit('bottom')) > 0, 'live: the dragged edge lit')
      const l = await board()
      near(l.y + l.h, H - 56, 'live: board bottom follows the drag')
      h.assert(fileBars() === null, 'live: nothing written during the drag')
      h.assert(await ctx.page.evaluate(() => document.body.classList.contains('resizing-col')), 'live: row-resize cursor class')
    },
  })
  await h.eventually(ctx, async () => h.assert(fileBars()?.bottom === 56, `written at the end: ${JSON.stringify(fileBars())}`))
  h.assert((statSync(file).mode & 0o777) === 0o600, `state file 0600 (${(statSync(file).mode & 0o777).toString(8)})`)
  h.assert(JSON.stringify(Object.keys(JSON.parse(readFileSync(file, 'utf8')))) === '["bars"]', 'file: only `bars`')
  b = await board()
  near(b.y + b.h, H - 56, 'board bottom at 56')
  h.assert(!(await ctx.page.evaluate(() => document.body.classList.contains('resizing-col') || document.body.classList.contains('dragging'))), 'drag classes cleared')
  await h.assertPtySizes(ctx)

  // Clamps: 40 .. 60.
  s = await h.resizeBar(ctx, 'bottom', 10)
  h.assert(s.stored.bottom === 40, `min 40: ${s.stored.bottom}`)
  s = await h.resizeBar(ctx, 'bottom', 200)
  h.assert(s.stored.bottom === 60, `max 60: ${s.stored.bottom}`)
  await h.eventually(ctx, async () => h.assert(fileBars()?.bottom === 60, 'file: 60'))
  // Double-click: the default.
  const e = await h.barEdge(ctx, 'bottom')
  await ctx.page.mouse.dblclick(e.x, e.y)
  await h.eventually(ctx, async () => h.assert((await h.barSizes(ctx)).stored.bottom === 40 && fileBars()?.bottom === 40, 'double-click: back to 40, written'))
  b = await board()
  near(b.y + b.h, H - 40, 'board bottom back at 40')

  // Three bars: tabs top, shelf left, templates right. Each edge, each its own size.
  await h.setBars(ctx, { top: { start: ['tabs'], end: [] }, bottom: { start: [], end: [] }, left: { start: [], end: ['shelf'] }, right: { start: ['templates'], end: [] } })
  h.assert((await shownEdges()) === 'left,right,top', `edges shown: ${await shownEdges()}`)
  await h.resizeBar(ctx, 'top', 60, { during: async () => near((await board()).y, STRIP + 60, 'live: board top follows') })
  await h.resizeBar(ctx, 'left', 240, { during: async () => near((await board()).x, 240, 'live: board left follows') })
  await h.resizeBar(ctx, 'right', 100, {
    during: async () => {
      const l = await board()
      near(l.x + l.w, W - 100, 'live: board right follows')
    },
  })
  s = await h.barSizes(ctx)
  h.assert(s.stored.top === 60 && s.stored.left === 240 && s.stored.right === 100 && s.stored.bottom === 40, `each its own: ${JSON.stringify(s.stored)}`)
  b = await board()
  near(b.y, STRIP + 60, 'board top')
  near(b.x, 240, 'board left')
  near(b.x + b.w, W - 100, 'board right')
  const box = async (sel) => (await h.boxOf(ctx, sel)).box
  near((await box('#bar-left')).width, 240, 'left bar 240 wide')
  near((await box('#bar-right')).width, 100, 'right bar 100 wide')
  near((await box('#bar-top')).height, 60, 'top bar 60 high')
  await h.eventually(ctx, async () => h.assert(JSON.stringify(fileBars()) === JSON.stringify({ top: 60, bottom: 40, left: 240, right: 100 }), `file: ${JSON.stringify(fileBars())}`))
  await ctx.shot('three-bars')

  // Edges at the corners: the top edge wins where it meets a side edge; side edges start below it.
  const hit = (x, y) => ctx.page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e?.classList.contains('bar-edge') ? e.dataset.bar : e?.closest('.tile') ? 'tile' : e?.closest('.bar')?.dataset.bar ?? e?.id ?? e?.tagName }, [x, y])
  h.assert((await hit(239, STRIP + 59)) === 'top', `corner: top edge (${await hit(239, STRIP + 59)})`)
  h.assert((await hit(239, STRIP + 80)) === 'left', `left edge below the corner (${await hit(239, STRIP + 80)})`)
  h.assert((await hit(W - 101, STRIP + 80)) === 'right', `right edge (${await hit(W - 101, STRIP + 80)})`)
  // Over the board: 2 px only; tiles keep the rest.
  h.assert((await hit(241, b.y + 200)) === 'left' && (await hit(243, b.y + 200)) === 'tile', `left edge: 2 px over the board (${await hit(241, b.y + 200)}, ${await hit(243, b.y + 200)})`)
  h.assert((await hit(500, STRIP + 61)) === 'top' && (await hit(500, STRIP + 63)) === 'tile', `top edge: 2 px over the board`)

  // Vertical clamps: 40 .. 30% of the window width.
  s = await h.resizeBar(ctx, 'left', 10)
  h.assert(s.stored.left === 40, `left min 40: ${s.stored.left}`)
  s = await h.resizeBar(ctx, 'left', 5000)
  const max = Math.floor(W * 0.3)
  h.assert(s.stored.left === max, `left max 30% of ${W}: ${s.stored.left} vs ${max}`)
  near((await board()).x, max, 'board left at the max')
  // Window narrowed: shown clamped to 30% of the new width, stored kept; wider again: back.
  await h.resizeWindow(ctx, 1000, H)
  s = await h.barSizes(ctx)
  h.assert(s.shown.left === 300 && s.stored.left === max, `narrow window: shown 300, stored ${max}: ${JSON.stringify(s)}`)
  near((await board()).x, 300, 'board left clamped')
  near((await box('#bar-left')).width, 300, 'left bar clamped')
  h.assert(fileBars().left === max, 'file keeps the stored size')
  await ctx.shot('narrow-window')
  await h.resizeWindow(ctx, W, H)
  s = await h.barSizes(ctx)
  h.assert(s.shown.left === max, `wide again: ${s.shown.left}`)
  // Back to 240 by double-click (160) then a drag.
  const le = await h.barEdge(ctx, 'left')
  await ctx.page.mouse.dblclick(le.x, le.y)
  await h.eventually(ctx, async () => h.assert((await h.barSizes(ctx)).stored.left === 160, 'left double-click: 160'))
  await h.resizeBar(ctx, 'left', 240)

  // Edit layout mode: the same edges (resize there: settings-layout-resize); the panel's layout Reset
  // (and Save) leaves the sizes.
  await h.editLayout(ctx)
  h.assert((await shownEdges()) === 'left,right,top', `edit mode: the edges (${await shownEdges()})`)
  await ctx.page.locator('#layout-edit .le-cancel').click()
  await ctx.page.waitForSelector('#layout-edit', { state: 'detached' })
  await ctx.page.locator('#set-layout-reset').click()
  await ctx.page.locator('.settings .save').click()
  await ctx.page.waitForSelector('.settings', { state: 'detached' })
  await h.waitFor(ctx, async () => (await h.barOf(ctx, 'tabs')).bar === 'bottom', 'layout reset to the default')
  h.assert((await shownEdges()) === 'bottom', 'default layout: the bottom edge')
  s = await h.barSizes(ctx)
  h.assert(JSON.stringify(s.stored) === JSON.stringify({ top: 60, bottom: 40, left: 240, right: 100 }), `layout Reset: sizes kept: ${JSON.stringify(s.stored)}`)
  h.assert(JSON.stringify(fileBars()) === JSON.stringify({ top: 60, bottom: 40, left: 240, right: 100 }), 'file kept')

  // A size for the bottom bar, then a restart of the same instance: sizes and layout come back.
  await h.resizeBar(ctx, 'bottom', 50)
  await h.eventually(ctx, async () => h.assert(fileBars()?.bottom === 50, 'file: bottom 50'))
  await ctx.restart()
  s = await h.barSizes(ctx)
  h.assert(JSON.stringify(s.stored) === JSON.stringify({ top: 60, bottom: 50, left: 240, right: 100 }), `restart: sizes restored: ${JSON.stringify(s.stored)}`)
  b = await board()
  near(b.y + b.h, H - 50, 'restart: board bottom at 50')
  near((await box('#bar-bottom')).height, 50, 'restart: bottom bar 50 high')
  h.assert(!/\[error\]/.test(ctx.appLog()), 'no errors')
  await ctx.shot('restarted')
}
