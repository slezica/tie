// Toolbar contest: tabs that don't fit scroll (fades, divider toward the shelf, current tab kept in
// view); the shelf keeps its width until the tab list hits its floor, then the shelf scrolls.
export default async (ctx, h) => {
  const box = (sel) => ctx.page.evaluate((sel) => document.querySelector(sel).getBoundingClientRect().toJSON(), sel)
  const cls = (sel) => ctx.page.evaluate((sel) => [...document.querySelector(sel).classList], sel)
  const scroll = (sel) => ctx.page.evaluate((sel) => {
    const el = document.querySelector(sel)
    return { left: el.scrollLeft, width: el.scrollWidth, client: el.clientWidth }
  }, sel)
  const currentVisible = async () => {
    const list = await box('#tab-list')
    const cur = await box('.tab.current')
    return cur.left >= list.left - 1 && cur.right <= list.right + 1
  }
  const tabCount = () => ctx.page.$$eval('.tab', (els) => els.length)

  await ctx.tie('add', 'terminal', '--shelved')
  await h.resizeWindow(ctx, 900, 600)
  const shelf0 = await box('#shelf')
  h.assert(!(await cls('#tabs')).includes('overflow'), 'one tab: no overflow')

  // Tab titles are the terminals' cwd (this run's directory name; "terminal", then the shell's
  // name, until the cwd arrives), so the count that overflows a 900px window varies: open tabs
  // until the list overflows with settled titles, i.e. all like the first tab's (capped).
  const settled = () => ctx.page.evaluate(() => {
    const [first, ...rest] = [...document.querySelectorAll('.tab')].map((t) => t.textContent)
    return rest.every((t) => t === first)
  })
  let n = 1
  while (!(await cls('#tabs')).includes('overflow') && n < 24) {
    await h.press(ctx, 'Meta+t')
    await h.waitFor(ctx, async () => (await tabCount()) === n + 1 && (await settled()), 'new tab, title settled')
    await h.settle(ctx) // overflow classes set on render
    n++
  }
  h.assert((await h.list(ctx)).tabs.length === n, `${n} tabs`)
  h.assert((await cls('#tabs')).includes('overflow'), 'tabs overflow: divider state')
  let s = await scroll('#tab-list')
  h.assert(s.width > s.client, `tab list scrolls (${s.width} > ${s.client})`)
  h.assert(await currentVisible(), 'new (last) tab scrolled into view')
  h.assert((await cls('#tab-list')).includes('more-left') && !(await cls('#tab-list')).includes('more-right'), 'fade on the left only')
  const shelf1 = await box('#shelf')
  h.assert(Math.abs(shelf1.width - shelf0.width) < 1 && shelf1.right <= (await box('#templates')).left, 'shelf keeps its width, before the templates')
  await ctx.shot('overflow-end')

  await h.press(ctx, 'Meta+1')
  await h.eventually(ctx, async () => {
    h.assert(await currentVisible(), 'first tab scrolled into view')
    h.assert((await cls('#tab-list')).includes('more-right') && !(await cls('#tab-list')).includes('more-left'), 'fade on the right only')
  })

  await ctx.shot('overflow-start')

  // Narrow window, more shelved tiles: the tab list stops at its floor, the shelf scrolls.
  for (let i = 0; i < 5; i++) await ctx.tie('add', 'terminal', '--shelved')
  await h.resizeWindow(ctx, 420, 600)
  const tabs = await box('#tabs')
  const floor = await ctx.page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tabs-min')))
  h.assert(tabs.width >= floor - 1 && tabs.width < floor + 20, `tab list at its floor (${tabs.width} vs ${floor})`)
  s = await scroll('#shelf')
  h.assert(s.width > s.client + 10, `shelf scrolls (${s.width} > ${s.client})`)
  const tpl = await box('#templates')
  h.assert(tpl.right <= 420 && tpl.left > (await box('#shelf')).right - 1, 'templates stay at the edge')
  await ctx.shot('narrow')

  await h.resizeWindow(ctx, 1400, 800)
  h.assert(!(await cls('#tabs')).includes('overflow') || (await scroll('#tab-list')).width > (await scroll('#tab-list')).client, 'overflow state follows the width')
  s = await scroll('#shelf')
  h.assert(s.width <= s.client + 1, 'shelf fits again')
  await h.assertPtySizes(ctx)
}
