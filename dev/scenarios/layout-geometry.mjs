// Bars layout (`bars`): old `toolbar: "top"` migrated; default look; tabs top + shelf bottom; gravity and order; empty bars hidden; left / right bars; mixed (tabs left, shelf right, templates top); board insets; reveal side and peak per bar; borderless; invalid → default; persisted without `toolbar`.
import { readFileSync } from 'node:fs'

// An old file: the toolbar on top, no `bars` (S40).
export const settings = { toolbar: 'top' }

const E = () => ({ start: [], end: [] })
const layout = (patch) => ({ top: E(), bottom: E(), left: E(), right: E(), ...patch })
const DEFAULT = layout({ bottom: { start: ['tabs'], end: ['shelf', 'templates'] } })

export default async (ctx, h) => {
  const page = ctx.page
  const sh = (await ctx.tie('add', 'terminal', '--shelved')).id
  const board = async () => (await h.list(ctx)).board
  const box = (sel) => page.evaluate((sel) => document.querySelector(sel).getBoundingClientRect().toJSON(), sel)
  const shown = (bar) => page.isVisible(`#bar-${bar}`)
  const shownBars = async () => (await Promise.all(['top', 'bottom', 'left', 'right'].map(async (b) => ((await shown(b)) ? b : null)))).filter(Boolean).join()
  const W = await page.evaluate(() => window.innerWidth)
  const H = await page.evaluate(() => window.innerHeight)
  const PAD = 6
  const STRIP = 28
  const HBAR = 40
  const VBAR = 160
  const near = (a, b, what) => h.assert(Math.abs(a - b) <= 1, `${what}: ${a} vs ${b}`)
  const insets = async (want, what) => {
    const b = await board()
    near(b.x, want.left, `${what}: board left`)
    near(b.y, want.top, `${what}: board top`)
    near(W - (b.x + b.w), want.right, `${what}: board right`)
    near(H - (b.y + b.h), want.bottom, `${what}: board bottom`)
    return b
  }
  const at = async (c, bar, gravity, what) => {
    const p = await h.barOf(ctx, c)
    h.assert(p.bar === bar && p.gravity === gravity, `${what}: ${c} in ${bar} ${gravity} (${JSON.stringify(p)})`)
  }
  const peak = () => page.evaluate(() => {
    const e = document.getElementById('peak')
    return { shown: getComputedStyle(e).display !== 'none', up: e.classList.contains('up'), left: e.classList.contains('left'), right: e.classList.contains('right') }
  })
  const away = async () => {
    const b = await board()
    await page.mouse.move(b.x + b.w / 2, b.y + 20) // clear of reveals
    await h.waitRevealed(ctx, null)
    await h.settle(ctx)
  }

  // Migrated: the default layout on the top bar. The bar sits below the title strip (S10).
  let s = (await page.evaluate(() => window.tie.settings.get())).settings
  h.assert(JSON.stringify(s.bars) === JSON.stringify(layout({ top: { start: ['tabs'], end: ['shelf', 'templates'] } })) && !('toolbar' in s), `toolbar "top" migrated (${JSON.stringify(s.bars)})`)
  h.assert((await shownBars()) === 'top', 'only the top bar shown')
  let b = await insets({ top: STRIP + HBAR, left: PAD, right: PAD, bottom: PAD }, 'top bar')
  const strip = await box('#titlebar')
  const top = await box('#bar-top')
  h.assert(strip.height === STRIP && top.y === STRIP && top.height === HBAR && top.width === W, `title strip, then the top bar, full width (${JSON.stringify(top)})`)
  h.assert((await page.locator('#titlebar *').count()) === 0, 'the title strip holds no Tie UI')
  await h.hoverShelf(ctx, sh)
  let r = await h.rectOf(ctx, sh)
  const shelfTop = await box('#shelf')
  h.assert(r.y >= shelfTop.bottom && r.y >= b.y && r.y + r.h <= b.y + b.h + 1, `shelf on top: reveal below the item (${JSON.stringify(r)})`)
  h.assert((await peak()).shown && (await peak()).up, 'peak points up')
  await ctx.shot('migrated-top')
  await away()
  // The toolbar select is gone (layout by file until the editor); the next Save drops `toolbar`.
  await h.openSettings(ctx, 'appearance')
  h.assert((await page.locator('#set-toolbar').count()) === 0, 'no toolbar select in the panel')
  await page.locator('#set-borderless').check()
  await page.locator('#set-borderless').uncheck()
  h.assert(await page.locator('.save').isDisabled(), 'layout not part of the panel: nothing to save')
  await page.locator('#set-gitignore').evaluate((e) => e.click()) // any change, to Save
  await page.locator('.save').click()
  await page.waitForSelector('.settings', { state: 'detached' })
  const file = JSON.parse(readFileSync((await page.evaluate(() => window.tie.settings.get())).path, 'utf8'))
  h.assert(!('toolbar' in file) && file.bars?.top.start[0] === 'tabs', `saved: bars, no toolbar (${JSON.stringify(file)})`)

  // Default: as before (a strip for the traffic lights, everything in the bottom bar).
  await h.setBars(ctx, DEFAULT)
  h.assert((await shownBars()) === 'bottom', 'default: only the bottom bar')
  b = await insets({ top: STRIP, left: PAD, right: PAD, bottom: HBAR }, 'default')
  const tabs = await box('#tabs')
  let shelf = await box('#shelf')
  let tpl = await box('#templates')
  near(tabs.x, PAD + (await box('#brand')).width + ((await box('#brand')).width ? 12 : 0), 'default: tabs at the start (after the brand)')
  near(tpl.right, W - PAD, 'default: templates at the end')
  h.assert(tabs.right < shelf.x && shelf.right < tpl.x, 'default order: tabs, shelf, templates')
  h.assert(await page.$eval('#templates', (e) => e.classList.contains('after-shelf')), 'default: templates divider beside the shelf')
  h.assert(!(await page.isVisible('.item .lbl')), 'icon-only items')
  await h.hoverShelf(ctx, sh)
  r = await h.rectOf(ctx, sh)
  h.assert(r.y + r.h <= shelf.y && r.y >= b.y && r.x >= b.x && r.x + r.w <= b.x + b.w + 1, `reveal above the item, inside the board (${JSON.stringify(r)})`)
  h.assert((await peak()).shown && !(await peak()).up, 'peak points down')
  await ctx.shot('default-reveal')
  await away()
  await ctx.shot('default')
  await h.assertPtySizes(ctx)

  // Tabs top, shelf + templates bottom.
  await h.setBars(ctx, layout({ top: { start: ['tabs'], end: [] }, bottom: { start: [], end: ['shelf', 'templates'] } }))
  h.assert((await shownBars()) === 'top,bottom', 'tabs top + shelf bottom: two bars')
  b = await insets({ top: STRIP + HBAR, left: PAD, right: PAD, bottom: HBAR }, 'tabs top + shelf bottom')
  await at('tabs', 'top', 'start', 'split')
  await at('shelf', 'bottom', 'end', 'split')
  await h.hoverShelf(ctx, sh)
  r = await h.rectOf(ctx, sh)
  h.assert(r.y + r.h <= (await box('#shelf')).y && r.y >= b.y, `shelf at the bottom: reveal above (${JSON.stringify(r)})`)
  await ctx.shot('tabs-top-shelf-bottom')
  await away()
  await h.assertPtySizes(ctx)

  // All three on top; gravity and order: shelf at the start; templates, then tabs at the end. No
  // divider: the templates are not beside the shelf.
  await h.setBars(ctx, layout({ top: { start: ['shelf'], end: ['templates', 'tabs'] } }))
  h.assert((await shownBars()) === 'top', 'all on top: the bottom bar hidden')
  h.assert((await box('#bar-bottom')).height === 0, 'hidden bar takes no space')
  await insets({ top: STRIP + HBAR, left: PAD, right: PAD, bottom: PAD }, 'all on top')
  shelf = await box('#shelf')
  tpl = await box('#templates')
  const tabs2 = await box('#tabs')
  near(shelf.x, PAD, 'shelf at the start')
  near(tabs2.right, W - PAD, 'tabs at the end')
  const brand = await box('#brand')
  h.assert(tpl.right < brand.x + 1 && tpl.right <= tabs2.x && shelf.right < tpl.x, 'order: shelf | templates, brand + tabs')
  h.assert(tabs2.x - brand.right <= 13, `brand right beside the tabs (${brand.right} → ${tabs2.x})`)
  h.assert(!(await page.$eval('#templates', (e) => e.className)), 'no templates divider away from the shelf')
  await ctx.shot('all-top-gravity')

  // Order inside a group: templates before the shelf (divider on the shelf's side), tabs at the end.
  await h.setBars(ctx, layout({ bottom: { start: ['templates', 'shelf'], end: ['tabs'] } }))
  tpl = await box('#templates')
  shelf = await box('#shelf')
  near(tpl.x, PAD, 'templates first')
  h.assert(tpl.right <= shelf.x && (await box('#tabs')).right > W - PAD - 1, 'templates, shelf | tabs')
  h.assert(await page.$eval('#templates', (e) => e.classList.contains('before-shelf')), 'divider between templates and shelf')
  await ctx.shot('bottom-reordered')

  // Left bar (tabs) + right bar (shelf, templates): side insets; side bars fit under the strip.
  await h.setBars(ctx, layout({ left: { start: ['tabs'], end: [] }, right: { start: ['shelf'], end: ['templates'] } }))
  h.assert((await shownBars()) === 'left,right', 'side bars shown')
  b = await insets({ top: STRIP, left: VBAR, right: VBAR, bottom: PAD }, 'left + right')
  const left = await box('#bar-left')
  h.assert(left.x === 0 && left.y === STRIP && left.width === VBAR && left.bottom === H, `left bar between strip and bottom (${JSON.stringify(left)})`)
  const tabsL = await box('#tabs')
  h.assert(tabsL.x >= 0 && tabsL.right <= VBAR && tabsL.y >= STRIP, `tabs inside the left bar (${JSON.stringify(tabsL)})`)
  const sl = await box('#shelf')
  h.assert(sl.x >= W - VBAR && (await box('#templates')).y > sl.y, 'right bar: shelf at the start, templates at the end, in a column')
  await h.assertPtySizes(ctx)
  await ctx.shot('left-right')
  // Shelf in the right bar: the reveal left of the item, at the board's right edge; peak ">".
  await h.hoverShelf(ctx, sh)
  r = await h.rectOf(ctx, sh)
  near(r.x + r.w, b.x + b.w - 10, 'right bar: reveal against the board\'s right edge, --peak + 2 in')
  h.assert(r.y >= b.y && (await peak()).right && !(await peak()).up, `right bar: reveal left of the item, peak points right (${JSON.stringify(r)})`)
  await ctx.shot('left-right-reveal')
  await away()

  // Mixed: tabs left, shelf right, templates top.
  await h.setBars(ctx, layout({ left: { start: ['tabs'], end: [] }, right: { start: ['shelf'], end: [] }, top: { start: [], end: ['templates'] } }))
  h.assert((await shownBars()) === 'top,left,right', 'mixed: three bars')
  b = await insets({ top: STRIP + HBAR, left: VBAR, right: VBAR, bottom: PAD }, 'mixed')
  near((await box('#templates')).right, W - PAD, 'mixed: templates at the top bar\'s end')
  await ctx.shot('mixed')

  // Left (all three) with a top bar: the side bar fits between top and bottom (S9).
  await h.setBars(ctx, layout({ left: { start: ['tabs'], end: ['shelf', 'templates'] }, top: E() }))
  b = await insets({ top: STRIP, left: VBAR, right: PAD, bottom: PAD }, 'left bar')
  await ctx.shot('left')
  // Shelf in the left bar: the reveal right of the item, at the board's left edge; peak "<".
  await h.hoverShelf(ctx, sh)
  r = await h.rectOf(ctx, sh)
  near(r.x, b.x + 10, 'left bar: reveal against the board\'s left edge, --peak + 2 in')
  h.assert((await peak()).left, 'left bar: peak points left')
  await ctx.shot('left-reveal')
  await away()
  await h.setBars(ctx, layout({ top: { start: ['tabs'], end: [] }, left: { start: [], end: ['shelf', 'templates'] } }))
  const l2 = await box('#bar-left')
  h.assert(l2.y === STRIP + HBAR && l2.bottom === H, `left bar under the top bar (${JSON.stringify(l2)})`)
  await insets({ top: STRIP + HBAR, left: VBAR, right: PAD, bottom: PAD }, 'top + left')

  // Borderless: no title strip; with the top bar empty the board reaches the top.
  await h.setBars(ctx, DEFAULT, { borderless: true })
  await insets({ top: PAD, left: PAD, right: PAD, bottom: HBAR }, 'borderless default')
  h.assert((await box('#titlebar')).height === 0, 'borderless: no strip')
  await h.assertPtySizes(ctx)
  await ctx.shot('borderless')

  // Invalid layout (tabs twice): the whole default (S39).
  await h.setBars(ctx, layout({ top: { start: ['tabs'], end: [] }, bottom: { start: ['tabs'], end: ['shelf', 'templates'] } }), { borderless: false })
  s = (await page.evaluate(() => window.tie.settings.get())).settings
  h.assert(JSON.stringify(s.bars) === JSON.stringify(DEFAULT), `invalid → default (${JSON.stringify(s.bars)})`)
  await at('tabs', 'bottom', 'start', 'invalid → default')
  await insets({ top: STRIP, left: PAD, right: PAD, bottom: HBAR }, 'invalid → default')
}
