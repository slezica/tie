// Settings Layout row and edit mode: summary, Modify (panel hidden, dim, indicators, labels, box),
// input blocked in the mode, Done → draft (Save state, Save persists), Cancel / Escape / menu toggle,
// panel Cancel reverts, Reset, put back → Save disabled, window resize.
import { readFileSync } from 'node:fs'

export default async (ctx, h) => {
  const DEFAULT = { top: { start: [], end: [] }, bottom: { start: ['tabs'], end: ['shelf', 'templates'] }, left: { start: [], end: [] }, right: { start: [], end: [] } }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const summary = () => ctx.page.textContent('#set-layout-summary')
  const disabled = (sel) => ctx.page.$eval(sel, (e) => e.disabled)
  const inMode = () => ctx.page.$('#layout-edit').then(Boolean)
  const panelShown = () => ctx.page.isVisible('.settings')
  const settingsPath = (await ctx.page.evaluate(() => window.tie.settings.get())).path
  const fileBars = () => JSON.parse(readFileSync(settingsPath, 'utf8')).bars

  // Two tabs (the second current), a shelved tile in it: targets for clicks that must do nothing.
  const first = (await h.list(ctx)).tab
  await h.press(ctx, 'Meta+t')
  const l0 = await h.waitFor(ctx, async () => { const l = await h.list(ctx); return l.tabs.length === 2 && l.active && l }, 'second tab')
  const a = l0.active
  await h.waitShell(ctx, a)
  const { id: b } = await ctx.tie('add', 'terminal', '--shelved')
  await h.waitTile(ctx, b)
  const tilesBefore = (await h.list(ctx)).tiles.length

  // Row: summary of the active layout; default: Reset disabled; nothing to save.
  await h.openSettings(ctx, 'appearance')
  h.assert((await summary()) === 'Bottom: Tabs, Shelf, Templates', `summary: ${await summary()}`)
  h.assert((await disabled('#set-layout-reset')) && (await disabled('.settings .save')), 'default layout: Reset and Save disabled')
  await ctx.shot('row')

  // Modify: panel hidden (kept), dim layer, four indicators (bottom exists), labels, the box.
  await h.editLayout(ctx)
  h.assert(!(await panelShown()) && (await ctx.page.$('.settings')), 'panel hidden, not destroyed')
  h.assert(await ctx.page.isVisible('#layout-edit .le-dim'), 'board dimmed')
  const bars = await ctx.page.$$eval('#layout-edit .le-bar', (els) => els.map((e) => ({ bar: e.dataset.bar, exists: e.classList.contains('exists'), r: e.getBoundingClientRect().toJSON() })))
  h.assert(bars.length === 4 && bars.every((x) => x.r.width > 0 && x.r.height > 0), `four indicators: ${JSON.stringify(bars)}`)
  h.assert(bars.filter((x) => x.exists).map((x) => x.bar).join() === 'bottom', 'only the bottom bar exists')
  const W = await ctx.page.evaluate(() => innerWidth)
  const H = await ctx.page.evaluate(() => innerHeight)
  const ov = (p, q) => p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom
  for (let i = 0; i < bars.length; i++) for (let j = i + 1; j < bars.length; j++) h.assert(!ov(bars[i].r, bars[j].r), `zones ${bars[i].bar} / ${bars[j].bar} don't overlap`)
  const labels = await ctx.page.$$eval('#layout-edit .le-label', (els) => els.map((e) => ({ c: e.dataset.c, text: e.textContent, r: e.getBoundingClientRect().toJSON() })))
  const comps = await ctx.page.$$eval('#layout-edit .le-comp', (els) => els.map((e) => e.getBoundingClientRect().toJSON()))
  h.assert(labels.map((x) => x.text).join() === 'Tabs,Shelf,Templates', `labels: ${labels.map((x) => x.text)}`)
  for (const x of labels) {
    h.assert(x.r.left >= 0 && x.r.top >= 0 && x.r.right <= W && x.r.bottom <= H, `label ${x.text} inside the window`)
    h.assert(!comps.some((c) => ov(c, x.r)), `label ${x.text} covers no component`)
  }
  h.assert(!ov(labels[1].r, labels[2].r) && !ov(labels[0].r, labels[1].r), 'labels apart')
  const box = await ctx.page.$eval('#layout-edit .le-box', (e) => ({ text: e.textContent.replace(/\s+/g, ' ').trim(), r: e.getBoundingClientRect().toJSON() }))
  h.assert(/Drag Tabs, Shelf and Templates to any edge/.test(box.text) && /Cancel/.test(box.text) && /Done/.test(box.text), `box: ${box.text}`)
  const { board } = await h.list(ctx)
  h.assert(Math.abs((box.r.left + box.r.right) / 2 - (board.x + board.w / 2)) < 8 && Math.abs((box.r.top + box.r.bottom) / 2 - (board.y + board.h / 2)) < 8, 'box centred on the board')
  h.assert(!(await ctx.page.$('#layout-edit .dialog, #layout-edit h2')), 'box: no dialog, no title')
  await ctx.shot('mode')

  // Nothing under the mode acts: tab click, shelf click / hover, template click, right-click, board.
  const pt = (sel) => h.boxOf(ctx, sel)
  const tab1 = await pt(`.tab[data-space="${first}"]`)
  await ctx.page.mouse.click(tab1.x, tab1.y)
  const item = await pt(`.item[data-id="${b}"]`)
  await ctx.page.mouse.move(item.x, item.y)
  await ctx.page.mouse.click(item.x, item.y)
  const tpl = await h.template(ctx)
  await ctx.page.mouse.click(tpl.x, tpl.y)
  await ctx.page.mouse.click(tab1.x, tab1.y, { button: 'right' })
  const add = await pt('#tab-add')
  await ctx.page.mouse.click(add.x, add.y)
  const st0 = await h.state(ctx)
  const title = await h.titlePoint(ctx, a)
  await h.drag(ctx, title, { x: title.x + 200, y: title.y + 300 }, { shift: true }) // would float it
  // Keys: typing reaches no tile; shortcuts are suspended (main: fields mode).
  await h.waitKeyMode(ctx, 'fields')
  // Focus pulled into the terminal (as refocus() after a dialog over the mode would): keys still blocked.
  await ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] .xterm-helper-textarea`).focus(), a)
  await ctx.page.keyboard.type('echo typed-in-mode')
  await h.press(ctx, 'Meta+t')
  await ctx.sleep(400) // absence: nothing of the above takes effect meanwhile
  const st = await h.state(ctx)
  const l1 = await h.list(ctx)
  h.assert(l1.tab === l0.tab && l1.tabs.length === 2, 'no tab switch, no new tab')
  h.assert(!st.revealed && !st.pinned, 'no reveal, no pin')
  h.assert(l1.tiles.length === tilesBefore, 'no tile spawned')
  h.assert(!(await ctx.page.$('.menu')), 'no context menu')
  h.assert(same(st.tree, st0.tree) && !st.floats.length, 'tile drag did not start')
  h.assert(!(await h.screen(ctx, a)).includes('typed-in-mode'), 'typing reached no terminal')
  h.assert(await inMode(), 'still in the mode')
  // Focus stays in the box: Tab goes between Cancel and Done.
  const focusedIs = (cls) => ctx.page.evaluate((cls) => document.activeElement?.classList.contains(cls), cls)
  await ctx.page.focus('#layout-edit .le-done')
  await ctx.page.keyboard.press('Tab')
  h.assert(await focusedIs('le-cancel'), 'Tab: Cancel')
  await ctx.page.keyboard.press('Tab')
  h.assert(await focusedIs('le-done'), 'Tab: back to Done')

  // Window resize: indicators, box follow.
  await h.resizeWindow(ctx, 1100, 700)
  await h.eventually(ctx, async () => {
    const r = await ctx.page.$eval('#layout-edit .le-bar[data-bar="bottom"]', (e) => e.getBoundingClientRect().toJSON())
    h.assert(r.width === 1100 && r.bottom === 700, `bottom indicator follows: ${JSON.stringify(r)}`)
    const t = await ctx.page.$eval('#layout-edit .le-label[data-c="templates"]', (e) => e.getBoundingClientRect().right)
    h.assert(t <= 1100, 'labels follow')
  })

  // Cancel: back to the panel, layout as at Modify; Escape the same; Escape mid-drag cancels the drag only.
  await h.dragComponent(ctx, 'shelf', 'left', 'start')
  h.assert((await h.barOf(ctx, 'shelf')).bar === 'left', 'drop applied live')
  await ctx.page.locator('#layout-edit .le-cancel').click()
  h.assert(!(await inMode()) && (await panelShown()), 'Cancel: back to the panel')
  h.assert(same(await h.mountedBars(ctx), DEFAULT), 'Cancel: layout restored')
  h.assert((await disabled('.settings .save')) && (await summary()) === 'Bottom: Tabs, Shelf, Templates', 'Cancel: draft unchanged')

  await h.editLayout(ctx)
  const from = await pt('#layout-edit .le-comp[data-c="templates"]')
  const to = await h.layoutPoint(ctx, 'templates', 'top', 'start')
  await ctx.page.mouse.move(from.x, from.y)
  await ctx.page.mouse.down()
  await ctx.page.mouse.move(to.x, to.y, { steps: 8 })
  await ctx.page.waitForSelector('#layout-edit .le-preview.shown')
  await ctx.page.keyboard.press('Escape')
  await ctx.page.mouse.up()
  await h.settle(ctx)
  h.assert((await inMode()) && (await h.barOf(ctx, 'templates')).bar === 'bottom', 'Escape mid-drag: drag cancelled, mode stays')
  await h.dragComponent(ctx, 'tabs', 'right', 'end')
  h.assert((await h.barOf(ctx, 'tabs')).bar === 'right', 'tabs moved')
  await ctx.page.keyboard.press('Escape')
  h.assert(!(await inMode()) && (await panelShown()) && same(await h.mountedBars(ctx), DEFAULT), 'Escape: back, layout restored')

  // Done: the mode's layout becomes the draft; summary, Reset, Save enabled.
  await h.editLayout(ctx)
  await h.dragComponent(ctx, 'tabs', 'top', 'start')
  await h.dragComponent(ctx, 'templates', 'left', 'end')
  const edited = await h.mountedBars(ctx)
  await ctx.page.locator('#layout-edit .le-done').click()
  h.assert(!(await inMode()) && (await panelShown()), 'Done: back to the panel')
  h.assert(same(await h.mountedBars(ctx), edited), 'Done: layout kept (previewed)')
  h.assert((await summary()) === 'Top: Tabs · Bottom: Shelf · Left: Templates', `summary: ${await summary()}`)
  h.assert(!(await disabled('.settings .save')) && !(await disabled('#set-layout-reset')), 'Save and Reset enabled')
  h.assert(same(fileBars(), undefined) || same(fileBars(), DEFAULT), 'Done never writes the file')
  await ctx.shot('done')

  // Panel Cancel after Done: the live layout reverts.
  await ctx.page.locator('.settings .cancel').click()
  await ctx.page.waitForSelector('.settings', { state: 'detached' })
  h.assert(same(await h.mountedBars(ctx), DEFAULT), 'panel Cancel reverts the layout')

  // Changed, then dragged back to the original: nothing to save.
  await h.editLayout(ctx)
  await h.dragComponent(ctx, 'templates', 'bottom', 'end', { index: 0 })
  h.assert(same((await h.mountedBars(ctx)).bottom, { start: ['tabs'], end: ['templates', 'shelf'] }), 'reordered')
  await ctx.page.locator('#layout-edit .le-done').click()
  h.assert(!(await disabled('.settings .save')), 'order change: Save enabled')
  await h.editLayout(ctx)
  await h.dragComponent(ctx, 'templates', 'bottom', 'end')
  await ctx.page.locator('#layout-edit .le-done').click()
  h.assert(same(await h.mountedBars(ctx), DEFAULT), 'back to the original order')
  h.assert((await disabled('.settings .save')) && (await disabled('#set-layout-reset')), 'put back: Save and Reset disabled')

  // Save persists the layout to the file.
  await h.editLayout(ctx)
  await h.dragComponent(ctx, 'shelf', 'right', 'start')
  await h.dragComponent(ctx, 'tabs', 'top', 'end')
  const saved = await h.mountedBars(ctx)
  await ctx.page.locator('#layout-edit .le-done').click()
  await ctx.page.locator('.settings .save').click()
  await ctx.page.waitForSelector('.settings', { state: 'detached' })
  h.assert(same(fileBars(), saved), `file has the layout: ${JSON.stringify(fileBars())}`)
  h.assert(same((await ctx.page.evaluate(() => window.tie.settings.get())).settings.bars, saved), 'active settings have it')
  h.assert(same(await h.mountedBars(ctx), saved), 'layout stays after Save')

  // Reset: the default, previewed; enabled only off-default; Save enabled (saved is not default).
  await h.openSettings(ctx, 'appearance')
  h.assert((await summary()) === 'Top: Tabs · Bottom: Templates · Right: Shelf', `summary of the saved layout: ${await summary()}`)
  h.assert(!(await disabled('#set-layout-reset')) && (await disabled('.settings .save')), 'saved, off-default: Reset enabled, Save disabled')
  await ctx.page.locator('#set-layout-reset').click()
  h.assert(same(await h.mountedBars(ctx), DEFAULT), 'Reset: default previewed')
  h.assert((await disabled('#set-layout-reset')) && !(await disabled('.settings .save')), 'Reset: disabled now, Save enabled')
  h.assert((await summary()) === 'Bottom: Tabs, Shelf, Templates', 'Reset: summary')

  // The menu's settings toggle (cmd+,) while in the mode: the mode's Cancel, then the panel's.
  await h.editLayout(ctx)
  await h.dragComponent(ctx, 'tabs', 'left', 'start')
  await ctx.page.evaluate(() => document.dispatchEvent(new CustomEvent('tie:settings')))
  await ctx.page.waitForSelector('.settings', { state: 'detached' })
  h.assert(!(await inMode()), 'settings toggle: mode gone')
  h.assert(same(await h.mountedBars(ctx), saved), 'settings toggle: back to the saved layout')
  await h.waitKeyMode(ctx, 'off')
}
