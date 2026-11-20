// Bar content by size (LAYOUT.md "Bar sizes"): horizontal bars scale tabs, brand, shelf items and
// templates with the thickness (32 / 40 / 60 px: heights, glyphs, centring; drop at a slot, reveal next
// to the item, overflow fades at 60), bottom and top; vertical forms across widths (narrow up to 1.5x
// then centred, list from LIST_MIN), narrow tabs keep their title on hover (no close button; menu Close, middle-click); a mixed layout.
import { join } from 'node:path'
import { ROOT } from '../lib.mjs'

const E = () => ({ start: [], end: [] })
const layout = (patch) => ({ top: E(), bottom: E(), left: E(), right: E(), ...patch })
const PEAK = 8

export default async (ctx, h) => {
  const page = ctx.page
  const m = page.mouse
  const L = () => h.list(ctx)
  const near = (a, b, what, tol = 1) => h.assert(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`)
  const box = (sel) => page.$eval(sel, (e) => e.getBoundingClientRect().toJSON())
  const a = (await L()).tiles[0].id
  const items = []
  for (let i = 0; i < 2; i++) items.push((await ctx.tie('add', 'terminal', '--shelved', '--title', `item ${i}`)).id)
  // A second tab titled by a long directory name (node_modules): truncation in narrow bars.
  await ctx.tie('add', 'terminal', '--tab', 'new', '--cwd', join(ROOT, 'node_modules'))
  const away = async () => {
    const { board } = await L()
    await m.move(board.x + board.w / 2, board.y + board.h / 2, { steps: 4 })
    await h.waitRevealed(ctx, null)
    await h.settle(ctx)
  }
  await away()

  // What scales in a horizontal bar, measured.
  const measure = (bar) =>
    page.evaluate((bar) => {
      const r = (e) => e.getBoundingClientRect()
      const tab = document.querySelector('.tab.current')
      const tpl = document.querySelector('.template')
      const item = document.querySelector('#shelf .item')
      return {
        bar: r(document.getElementById(`bar-${bar}`)).toJSON(),
        tab: r(tab).toJSON(),
        tabFont: parseFloat(getComputedStyle(tab).fontSize),
        tpl: r(tpl).toJSON(),
        glyph: r(tpl.querySelector('svg')).width,
        item: r(item).toJSON(),
        itemGlyph: r(item.querySelector('svg')).width,
        add: r(document.getElementById('tab-add')).toJSON(),
        brandFont: parseFloat(getComputedStyle(document.getElementById('brand')).fontSize),
      }
    }, bar)
  const mid = (r) => r.y + r.height / 2
  for (const bar of ['bottom', 'top']) {
    if (bar === 'top') await h.setBars(ctx, layout({ top: { start: ['tabs'], end: ['shelf', 'templates'] } }))
    // size → [scale, text scale]: below 35 px a compact floor (0.875), text never below its default.
    for (const [size, k, kt] of [[40, 1, 1], [60, 1.5, 1.5], [32, 0.875, 1], [50, 1.25, 1.25]]) {
      await h.setBarSize(ctx, bar, size)
      const s = await measure(bar)
      near(s.bar.height, size, `${bar} ${size}: bar height`)
      near(s.tab.height, size - 10 * k, `${bar} ${size}: tab height`)
      near(s.tabFont, 12 * kt, `${bar} ${size}: tab text`, 0.1)
      near(s.brandFont, 11 * kt, `${bar} ${size}: brand text`, 0.1)
      near(s.tpl.width, 28 * k, `${bar} ${size}: template slot`)
      near(s.item.height, 28 * k, `${bar} ${size}: shelf item slot`)
      near(s.glyph, 16 * k, `${bar} ${size}: template glyph`, 0.5)
      near(s.itemGlyph, 16 * k, `${bar} ${size}: item glyph`, 0.5)
      near(s.add.width, 26 * k, `${bar} ${size}: + width`)
      for (const [what, r] of [['tab', s.tab], ['template', s.tpl], ['item', s.item], ['+', s.add]]) near(mid(r), mid(s.bar), `${bar} ${size}: ${what} centred`)
      await ctx.shot(`${bar}-${size}`)
    }
    await h.setBarSize(ctx, bar, null)
  }

  // At 60 (top bar): a drop at a slot (pitch from the scaled item), the reveal next to the item.
  await h.setBarSize(ctx, 'top', 60)
  const b = (await ctx.tie('add', 'terminal', '--at', a, '--side', 'r')).id
  await h.waitShell(ctx, b)
  // Slot 1 measured mid-drag: the strip holds the "+" hint as one more slot by then (grown toward the
  // bar's middle). Its pitch: the scaled item (42) + the slot gap.
  const from = await h.titlePoint(ctx, b)
  await m.move(from.x, from.y)
  await m.down()
  await m.move(from.x + 40, from.y + 40, { steps: 4 })
  await h.settle(ctx)
  const sb = await box('#shelf')
  await m.move(sb.x + 44 + 22, sb.y + sb.height / 2, { steps: 8 })
  await h.settle(ctx)
  await h.eventually(ctx, async () => {
    const g = await page.$$eval('#shelf > .item:not(.drag-source)', (els) => ({ at: els.findIndex((e) => e.classList.contains('ghost')), w: els.find((e) => e.classList.contains('ghost'))?.getBoundingClientRect().width }))
    h.assert(g.at === 1, `ghost at slot 1 (${g.at})`)
    near(g.w, 42, 'ghost slot scaled')
  })
  await m.up()
  await h.eventually(ctx, async () => h.assert((await L()).shelf.indexOf(b) === 1, `b shelved at slot 1 (${(await L()).shelf})`))
  await away()
  await h.hoverShelf(ctx, b)
  const ib = await box(`.item[data-id="${b}"]`)
  const r = (await L()).tiles.find((t) => t.id === b).rect
  const { board } = await L()
  near(r.y, board.y + PEAK + 2, 'reveal below the top bar')
  h.assert(r.x <= ib.x + ib.width / 2 && ib.x + ib.width / 2 <= r.x + r.w, 'reveal spans the item')
  const pk = await box('#peak')
  near(pk.x + pk.width / 2, ib.x + ib.width / 2, 'peak level with the item')
  await ctx.shot('top-60-reveal')
  await away()

  // Overflow at 60: a narrow window, many items: the strip scrolls, fades at its cut end.
  const W = await page.evaluate(() => innerWidth)
  const H = await page.evaluate(() => innerHeight)
  for (let i = 0; i < 12; i++) await ctx.tie('add', 'terminal', '--shelved')
  await h.resizeWindow(ctx, 800, H)
  await h.eventually(ctx, async () => {
    const f = await page.$eval('#shelf', (e) => ({ more: [...e.classList].filter((c) => c.startsWith('more-')), scroll: e.scrollWidth > e.clientWidth, fade: getComputedStyle(e).getPropertyValue('--fade-e').trim() }))
    h.assert(f.scroll && f.more.includes('more-end') && f.fade === '24px', `strip overflows, fade at the end: ${JSON.stringify(f)}`)
  })
  await page.$eval('#shelf', (e) => (e.scrollLeft = e.scrollWidth))
  await h.eventually(ctx, async () => h.assert(await page.$eval('#shelf', (e) => e.classList.contains('more-start') && !e.classList.contains('more-end')), 'scrolled to the end: fade at the start only'))
  await ctx.shot('top-60-overflow')
  await h.resizeWindow(ctx, W, H)
  for (const t of (await L()).tiles.filter((t) => t.state === 'shelved' && !items.includes(t.id) && t.id !== b)) await ctx.tie('close', '--tile', t.id)
  await h.setBarSize(ctx, 'top', null)

  // Vertical: tabs, shelf, templates in the left bar; forms by width.
  await h.setBars(ctx, layout({ left: { start: ['tabs'], end: ['shelf', 'templates'] } }))
  await away()
  const forms = () =>
    page.evaluate(() => {
      const bar = document.getElementById('bar-left').getBoundingClientRect()
      const rows = [...document.querySelectorAll('#bar-left .item, #bar-left .template')].map((e) => {
        const r = e.getBoundingClientRect()
        return { w: r.width, h: r.height, cx: r.x + r.width / 2, lbl: getComputedStyle(e.querySelector('.lbl')).display !== 'none', svg: e.querySelector('svg')?.getBoundingClientRect().width }
      })
      return { bar: bar.toJSON(), narrow: document.getElementById('bar-left').classList.contains('narrow'), rows }
    })
  // width → item size (narrow: width less --pad each side, up to 1.5 × 28; list: rows 28 tall).
  for (const [w, size] of [[48, 36], [54, 42], [80, 42], [99, 42], [100, null], [160, null], [240, null]]) {
    await h.setBarSize(ctx, 'left', w)
    const f = await forms()
    near(f.bar.width, w, `left ${w}: width`)
    h.assert(f.narrow === (size !== null), `left ${w}: ${size ? 'narrow' : 'list'} form`)
    for (const row of f.rows) {
      if (size) {
        h.assert(!row.lbl, `left ${w}: no titles`)
        near(row.w, size, `left ${w}: item width`)
        near(row.h, size, `left ${w}: item height`)
        near(row.cx, f.bar.x + f.bar.width / 2, `left ${w}: centred`)
        near(row.svg, (size * 16) / 28, `left ${w}: glyph scaled`, 0.5)
      } else {
        h.assert(row.lbl, `left ${w}: titles`)
        near(row.h, 28, `left ${w}: row height`)
        near(row.w, w - 12, `left ${w}: row width`)
        near(row.svg, 16, `left ${w}: glyph default`, 0.5)
      }
    }
    await ctx.shot(`left-${w}`)
  }

  // Narrow tabs (48): a title of a few letters with an ellipsis; hovering keeps it (no close button).
  await h.setBarSize(ctx, 'left', 48)
  const nm = (await L()).tabs.find((t) => t.title === 'node_modules')
  h.assert(nm, `a node_modules tab: ${JSON.stringify((await L()).tabs)}`)
  const title = () => page.$eval(`.tab[data-space="${nm.id}"]`, (e) => {
    const t = e.querySelector('.tab-title')
    return { w: t.getBoundingClientRect().width, cut: t.scrollWidth > t.clientWidth, close: getComputedStyle(e.querySelector('.tab-close')).display }
  })
  const t0 = await title()
  h.assert(t0.w >= 24 && t0.cut, `48: title shows a few letters, cut (${JSON.stringify(t0)})`)
  const tb = await h.boxOf(ctx, `.tab[data-space="${nm.id}"]`)
  await m.move(tb.x, tb.y, { steps: 3 })
  await h.settle(ctx)
  const t1 = await title()
  h.assert(t1.close === 'none' && Math.abs(t1.w - t0.w) < 1, `48, hover: title kept, no close button (${JSON.stringify(t1)})`)
  await ctx.shot('left-48-tab-hover')
  // From the list form on, hover shows the close button again.
  await h.setBarSize(ctx, 'left', 160)
  const tb2 = await h.boxOf(ctx, `.tab[data-space="${nm.id}"]`)
  await m.move(tb2.x + 2, tb2.y, { steps: 3 })
  await h.settle(ctx)
  h.assert((await title()).close !== 'none', '160, hover: close button')
  // Narrow again: the tab's menu has Close; a middle-click closes it.
  await h.setBarSize(ctx, 'left', 48)
  const tb3 = await h.boxOf(ctx, `.tab[data-space="${nm.id}"]`)
  await m.click(tb3.x, tb3.y, { button: 'right' })
  await page.waitForSelector('.menu')
  h.assert((await page.$$eval('.menu .menu-item', (els) => els.map((e) => e.textContent))).includes('Close'), 'tab menu: Close')
  await h.press(ctx, 'Escape')
  await page.waitForSelector('.menu', { state: 'detached' })
  await m.click(tb3.x, tb3.y, { button: 'middle' })
  await h.waitFor(ctx, async () => !(await L()).tabs.some((t) => t.id === nm.id), 'middle-click closed the tab')
  await away()

  // A mixed layout, a size per side.
  await h.setBars(ctx, layout({ top: { start: ['tabs'], end: [] }, left: { start: [], end: ['shelf'] }, right: { start: ['templates'], end: [] } }))
  await h.setBarSize(ctx, 'top', 52)
  await h.setBarSize(ctx, 'left', 54)
  await h.setBarSize(ctx, 'right', 200)
  const l = await L()
  near(l.board.x, 54, 'mixed: board left')
  near(l.board.x + l.board.w, W - 200, 'mixed: board right')
  near(l.board.y, 28 + 52, 'mixed: board top')
  await ctx.shot('mixed')
  await h.assertPtySizes(ctx)
}
