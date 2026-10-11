// Tab bar top/bottom, borderless + bottom (no top strip), compact shelf: live, re-laid out, persisted.
export default async (ctx, h) => {
  const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
  await ctx.tie('open', 'terminal', '--shelved')
  const board = async () => (await h.list(ctx)).board
  const shelfW = () => ctx.page.evaluate(() => document.getElementById('shelf').getBoundingClientRect().width)
  const set = async (fn) => {
    await ctx.page.evaluate(() => document.dispatchEvent(new CustomEvent('tie:settings')))
    await ctx.page.waitForSelector('.settings')
    await ctx.page.locator('nav button[data-page="appearance"]').click()
    await fn()
    await ctx.page.locator('.save').click()
    await ctx.sleep(300)
  }
  const top0 = await board()

  await set(() => ctx.page.selectOption('#set-tab-bar', 'bottom'))
  let b = await board()
  h.assert(await ctx.page.evaluate(() => document.getElementById('tabs').parentElement.id === 'bottom'), 'tabs in bottom bar')
  h.assert(b.y === top0.y && b.y + b.h < top0.y + top0.h, 'board ends above bottom bar; top strip kept for traffic lights')
  await h.assertPtySizes(ctx)
  await ctx.shot('tabs-bottom')

  await set(() => ctx.page.check('#set-borderless'))
  b = await board()
  h.assert(b.y < top0.y, `borderless + bottom: board reaches the top (${b.y})`)
  await ctx.shot('tabs-bottom-borderless')

  const w0 = await shelfW()
  await set(() => ctx.page.selectOption('#set-shelf-style', 'compact'))
  h.assert((await shelfW()) < w0 - 20, 'compact shelf narrower')
  h.assert(!(await ctx.page.isVisible('.item .lbl')), 'no labels')
  h.assert((await board()).w > b.w, 'board widens')
  await h.assertPtySizes(ctx)
  await ctx.shot('compact')

  // Back to top: tabs return, top strip back.
  await set(() => ctx.page.selectOption('#set-tab-bar', 'top'))
  h.assert(await ctx.page.evaluate(() => document.getElementById('tabs').parentElement.id === 'top'), 'tabs back on top')
  const s = (await ctx.page.evaluate(() => window.tie.settings.get())).settings
  h.assert(s.tabBar === 'top' && s.shelfStyle === 'compact' && s.borderless, 'persisted')
}
