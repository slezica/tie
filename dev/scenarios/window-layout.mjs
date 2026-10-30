// Toolbar bottom (default) / top, borderless + bottom (no top strip): live, re-laid out, persisted.
// The board spans the full width; the shelf sits in the toolbar.
export default async (ctx, h) => {
  const sh = (await ctx.tie('add', 'terminal', '--shelved')).id
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
  // Reveal: next to the item on the board side, inside the board; the peak points at the item.
  const peak = () => ctx.page.evaluate(() => ({ shown: getComputedStyle(document.getElementById('peak')).display !== 'none', up: document.getElementById('peak').classList.contains('up') }))
  await h.hoverShelf(ctx, sh)
  let r = await h.rectOf(ctx, sh)
  h.assert(r.y + r.h <= shelf.y && r.y >= b.y && r.x >= b.x && r.x + r.w <= b.x + b.w + 1, `reveal above the item, inside the board (${JSON.stringify(r)})`)
  h.assert((await peak()).shown && !(await peak()).up, 'peak points down')
  await ctx.shot('reveal-bottom')
  await ctx.page.mouse.move(400, 300)
  await ctx.sleep(200)
  await ctx.shot('bottom')
  const b0 = b

  await set(() => ctx.page.selectOption('#set-toolbar', 'top'))
  b = await board()
  h.assert((await stripOf()) === 'top', 'toolbar in the top strip')
  h.assert(b.y > b0.y && b.y + b.h > b0.y + b0.h, 'board moves down, reaches the bottom')
  await h.assertPtySizes(ctx)
  await h.hoverShelf(ctx, sh)
  r = await h.rectOf(ctx, sh)
  const shelfTop = await box('#shelf')
  h.assert(r.y >= shelfTop.bottom && r.y >= b.y && r.y + r.h <= b.y + b.h + 1, `toolbar on top: reveal below the item (${JSON.stringify(r)})`)
  h.assert((await peak()).shown && (await peak()).up, 'peak points up')
  await ctx.shot('reveal-top')
  await ctx.page.mouse.move(400, 300)
  await ctx.sleep(200)
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
