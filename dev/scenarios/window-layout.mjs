// Toolbar bottom (default) / top, borderless + bottom (no top strip): live, re-laid out, persisted.
// The board spans the full width; the shelf sits in the toolbar.
export default async (ctx, h) => {
  await ctx.tie('open', 'terminal', '--shelved')
  const board = async () => (await h.list(ctx)).board
  const stripOf = () => ctx.page.evaluate(() => document.getElementById('toolbar').parentElement.id)
  const box = (sel) => ctx.page.evaluate((sel) => document.querySelector(sel).getBoundingClientRect().toJSON(), sel)
  const W = await ctx.page.evaluate(() => window.innerWidth)
  const set = async (fn) => {
    await ctx.page.evaluate(() => document.dispatchEvent(new CustomEvent('tie:settings')))
    await ctx.page.waitForSelector('.settings')
    await ctx.page.locator('nav button[data-page="appearance"]').click()
    await fn()
    await ctx.page.locator('.save').click()
    await ctx.sleep(300)
  }

  // Default: toolbar at the bottom, a short strip on top for the traffic lights.
  let b = await board()
  h.assert((await stripOf()) === 'bottom', 'toolbar in the bottom strip')
  h.assert(b.x + b.w > W - 20, `board spans the width (${b.w} of ${W})`)
  const bar = await box('#toolbar')
  h.assert(bar.y > b.y + b.h - 1, 'board ends above the toolbar')
  const shelf = await box('#shelf')
  const tpl = await box('#templates')
  const tabs = await box('#tabs')
  h.assert(shelf.y >= bar.y && tpl.x > shelf.x && tabs.x < shelf.x, 'order: tabs, shelf, templates; all in the toolbar')
  h.assert(!(await ctx.page.isVisible('.item .lbl')), 'icon-only items')
  await ctx.shot('bottom')
  const b0 = b

  await set(() => ctx.page.selectOption('#set-toolbar', 'top'))
  b = await board()
  h.assert((await stripOf()) === 'top', 'toolbar in the top strip')
  h.assert(b.y > b0.y && b.y + b.h > b0.y + b0.h, 'board moves down, reaches the bottom')
  await h.assertPtySizes(ctx)
  await ctx.shot('top')

  await set(() => ctx.page.selectOption('#set-toolbar', 'bottom'))
  await set(() => ctx.page.check('#set-borderless'))
  b = await board()
  h.assert(b.y < b0.y, `borderless + bottom: board reaches the top (${b.y})`)
  await h.assertPtySizes(ctx)
  await ctx.shot('bottom-borderless')

  const s = (await ctx.page.evaluate(() => window.tie.settings.get())).settings
  h.assert(s.toolbar === 'bottom' && s.borderless, 'persisted')
}
