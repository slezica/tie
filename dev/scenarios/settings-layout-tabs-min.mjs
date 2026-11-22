// Tabs dragged in the edit layout mode over a side bar narrower than TABS_MIN (feel round 5): the bar grows to TABS_MIN, animated (intermediate widths seen), as part of the drag preview, for an existing bar (bar, board, outline follow) and an absent bar's zone; off it, back to its size, animated; Escape mid-drag: back too; dropped there: kept (the bar's stored size), written only at Done; Cancel reverts the size and the layout.
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, uiStatePath } from '../lib.mjs'

export const uiState = { bars: { left: 48, right: 48 } }

const E = () => ({ start: [], end: [] })
const layout = (patch) => ({ top: E(), bottom: E(), left: E(), right: E(), ...patch })
const TABS_MIN = 65 // core/barsize.ts: a side bar holding the tabs
const SMALL = 48

export default async (ctx, h) => {
  const page = ctx.page
  const m = page.mouse
  const file = uiStatePath(ctx.instance)
  const fileBars = () => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).bars : null)
  const outline = (b) => page.$eval(`#layout-edit .le-bar[data-bar="${b}"]`, (e) => e.getBoundingClientRect().width)
  const barWidth = (b) => page.$eval(`#bar-${b}`, (e) => e.getBoundingClientRect().width)
  const near = (a, b, what, d = 0.5) => h.assert(Math.abs(a - b) <= d, `${what}: ${a} vs ${b}`)
  // A bar at `px`: shown size, its outline in the mode, and (an existing bar) the bar itself and the board.
  const widthIs = (b, px, what, exists) =>
    h.eventually(ctx, async () => {
      h.assert((await h.barSizes(ctx)).shown[b] === px, `${what}: ${b} shown ${px} (${JSON.stringify((await h.barSizes(ctx)).shown)})`)
      near(await outline(b), px, `${what}: ${b} outline`)
      if (!exists) return
      near(await barWidth(b), px, `${what}: ${b} bar`)
      near((await h.list(ctx)).board.x, px, `${what}: the board follows`)
    })
  // The bar's shown size (`tie state`: computed when asked, from the animation's clock) sampled for
  // 800 ms from now, as fast as the socket answers. An offscreen page paints at a few frames per
  // second when idle (the animation may get only its first and last frame painted); the model's
  // values in between show the animation. The animation: values between the two ends.
  let sampling = null
  const sample = (b) => {
    const vals = []
    const t0 = Date.now()
    sampling = (async () => {
      while (Date.now() - t0 < 800) vals.push((await h.barSizes(ctx)).shown[b])
      return vals
    })()
  }
  const animated = async (what) => {
    const w = await sampling
    h.assert(w.some((x) => x > SMALL + 1 && x < TABS_MIN - 1), `${what}: animated (intermediate sizes: ${[...new Set(w)]})`)
  }
  const tabsAt = async () => (await h.barOf(ctx, 'tabs')).bar
  const press = async () => {
    const from = await h.boxOf(ctx, '#layout-edit .le-comp[data-c="tabs"]')
    await m.move(from.x, from.y)
    await m.down()
    await m.move(from.x + 10, from.y - 10, { steps: 2 }) // past the threshold: the drag starts
  }

  // Shelf in a 48 px left bar; right bar absent, 48 (seeded).
  await h.setBars(ctx, layout({ bottom: { start: ['tabs'], end: ['templates'] }, left: { start: ['shelf'], end: [] } }))
  h.assert((await h.barSizes(ctx)).shown.left === SMALL, 'left bar 48 (seeded)')
  await h.editLayout(ctx)

  // Existing bar: over it, it grows (animated); away, it shrinks back (animated); over it again, dropped: kept.
  await press()
  sample('left')
  let at = await h.layoutPoint(ctx, 'tabs', 'left', 'end')
  await m.move(at.x, at.y, { steps: 6 })
  await widthIs('left', TABS_MIN, 'tabs over the left bar: grown', true)
  await animated('left grows')
  h.assert((await h.barSizes(ctx)).stored.left === SMALL, 'a preview: stored size unchanged')
  const box = await page.$eval('#layout-edit .le-preview', (e) => e.getBoundingClientRect().toJSON())
  h.assert(box.x >= 0 && box.x + box.width <= TABS_MIN + 0.5, `the preview box inside the grown bar (${JSON.stringify(box)})`)
  await ctx.shot('left-grown')
  mkdirSync(join(ROOT, 'tmp/shots'), { recursive: true })
  await page.screenshot({ path: join(ROOT, 'tmp/shots/round5-tabs-drag-over.png') })

  sample('left')
  const center = await h.boardCenter(ctx)
  await m.move(center.x, center.y, { steps: 6 })
  await widthIs('left', SMALL, 'tabs off the left bar: back to 48', true)
  await animated('left shrinks')

  at = await h.layoutPoint(ctx, 'tabs', 'left', 'end')
  await m.move(at.x, at.y, { steps: 6 })
  await widthIs('left', TABS_MIN, 'over the left bar again', true)
  await m.up()
  await h.settle(ctx)
  h.assert((await tabsAt()) === 'left', `dropped: tabs in the left bar (${await tabsAt()})`)
  let s = await h.barSizes(ctx)
  h.assert(s.stored.left === TABS_MIN && s.shown.left === TABS_MIN, `dropped: kept, the stored size (${JSON.stringify(s)})`)
  h.assert(fileBars()?.left === SMALL, `in the mode: file untouched (${JSON.stringify(fileBars())})`)
  await page.locator('#layout-edit .le-done').click()
  await page.waitForSelector('#layout-edit', { state: 'detached' })
  await h.eventually(ctx, async () => h.assert(fileBars()?.left === TABS_MIN, `Done: written (${JSON.stringify(fileBars())})`))
  // The panel's Cancel: the layout reverts, the size stays (UI state, S46).
  await page.locator('.settings .cancel').click()
  await page.waitForSelector('.settings', { state: 'detached' })
  await h.eventually(ctx, async () => h.assert((await tabsAt()) === 'bottom', 'panel Cancel: tabs back at the bottom'))
  s = await h.barSizes(ctx)
  h.assert(s.stored.left === TABS_MIN && s.shown.left === TABS_MIN, `panel Cancel: the size kept (${JSON.stringify(s)})`)
  await h.setBarSize(ctx, 'left', SMALL)

  // Absent bar (right, 48): its zone grows; Escape mid-drag: back; dropped: kept; Cancel: reverted.
  await h.editLayout(ctx)
  near(await outline('right'), SMALL, 'right zone: 48')
  await press()
  sample('right')
  at = await h.layoutPoint(ctx, 'tabs', 'right', 'start')
  await m.move(at.x, at.y, { steps: 6 })
  await widthIs('right', TABS_MIN, 'tabs over the absent right bar: its zone grown', false)
  await animated('right zone grows')
  h.assert((await h.barSizes(ctx)).shown.left === SMALL, 'the left bar not grown meanwhile')
  await ctx.shot('right-zone-grown')
  sample('right')
  await page.keyboard.press('Escape')
  await widthIs('right', SMALL, 'Escape mid-drag: the zone back to 48', false)
  await animated('right zone shrinks after Escape')
  await m.up()
  h.assert(await page.$('#layout-edit'), 'Escape ended the drag only: the mode stays')
  h.assert((await tabsAt()) === 'bottom', 'Escape: no drop')

  await press()
  at = await h.layoutPoint(ctx, 'tabs', 'right', 'start')
  await m.move(at.x, at.y, { steps: 6 })
  await widthIs('right', TABS_MIN, 'over the right zone again', false)
  await m.up()
  await h.settle(ctx)
  h.assert((await tabsAt()) === 'right', 'dropped: tabs in the right bar')
  s = await h.barSizes(ctx)
  h.assert(s.stored.right === TABS_MIN && s.shown.right === TABS_MIN, `dropped on the absent bar: kept (${JSON.stringify(s)})`)
  near(await barWidth('right'), TABS_MIN, 'the right bar shown at TABS_MIN')
  await page.locator('#layout-edit .le-cancel').click()
  await page.waitForSelector('#layout-edit', { state: 'detached' })
  await h.eventually(ctx, async () => h.assert((await tabsAt()) === 'bottom', 'Cancel: tabs back at the bottom'))
  s = await h.barSizes(ctx)
  h.assert(s.stored.right === SMALL && s.stored.left === SMALL, `Cancel: sizes reverted (${JSON.stringify(s.stored)})`)
  h.assert(fileBars()?.right === SMALL, `Cancel: file as before (${JSON.stringify(fileBars())})`)
  await page.locator('.settings .cancel').click()
}
