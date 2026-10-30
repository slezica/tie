// Browser beforeunload (BROWSER.md "Leaving a page"): a page holding its unload (after a real click:
// sticky activation) makes Tie ask Leave / Stay before closing the tile (⌘W), reloading, the page's
// own navigation and quitting. Stay keeps the page; Leave proceeds.
import { existsSync } from 'node:fs'
import { infoPath } from '../lib.mjs'

export const hiddenWindow = true

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="margin:0;font:16px sans-serif">${body}</body></html>`
const HOLD = `<script>addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = '' })</script>`

export default async (ctx, h) => {
  const s = await h.site(ctx, (path) => {
    if (path === '/form') return page('Form', `<a id="b" href="/b" style="display:block;padding:20px">to b</a><div style="height:300px"></div>${HOLD}`)
    if (path === '/b') return page('B', '<h1>b</h1>')
    return null
  })
  const alive = () => existsSync(infoPath(ctx.instance))
  const leave = () => ctx.page.isVisible('.dialog.leave-page')
  const k = async (chord) => {
    await h.press(ctx, chord)
    await ctx.sleep(400)
  }
  const touch = async (id) => {
    await h.guestPage(ctx, id)
    await h.guestClick(ctx, id, 200, 200) // sticky activation (no link there): Chromium ignores beforeunload without it
    await ctx.sleep(200)
  }
  const hits = (p) => s.hits.filter((x) => x === p).length
  // Playwright attaches to guest pages over CDP and would answer their beforeunload dialogs itself
  // (and fail: Electron runs them); a listener that never answers leaves them to Tie.
  const browser = ctx.page.context().browser()
  const quiet = (p) => p.on('dialog', () => {})
  for (const c of browser.contexts()) {
    c.pages().forEach(quiet)
    c.on('page', quiet)
  }
  try {
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const open = async () => {
      const id = (await ctx.tie('add', s.url + '/form', '--at', t0, '--side', 'r', '--focus')).id
      await touch(id)
      return id
    }

    // ⌘W: asks; Stay keeps the page (alive, same document).
    const b = await open()
    await (await h.guestPage(ctx, b)).evaluate(() => (window.__mark = 1))
    await k('Meta+w')
    h.assert(await leave(), 'close: Leave page? dialog')
    h.assert((await ctx.page.textContent('.dialog h2')) === 'Leave page?' && (await ctx.page.evaluate(() => document.activeElement?.textContent)) === 'Leave', 'Leave focused')
    await ctx.shot('leave-page')
    await ctx.page.keyboard.press('Escape')
    await ctx.sleep(300)
    h.assert(!(await leave()) && (await h.tileOf(ctx, b)), 'Stay keeps the tile')
    h.assert((await (await h.guestPage(ctx, b)).evaluate(() => window.__mark)) === 1, 'same page, still alive')

    // Reload (UI): asks; Stay: no reload; Leave: reloads.
    await ctx.tie('focus', b)
    let n = hits('/form')
    await k('Meta+r')
    h.assert(await leave(), 'reload: dialog')
    await ctx.page.click('.dialog .cancel')
    await ctx.sleep(500)
    h.assert(hits('/form') === n, 'Stay: no reload')
    await k('Meta+r')
    h.assert(await leave(), 'reload again: dialog')
    await ctx.page.keyboard.press('Enter')
    await ctx.sleep(1500)
    h.assert(hits('/form') === n + 1, `Leave: reloaded: ${JSON.stringify(s.hits)} n=${n}`)
    await touch(b)

    // The page's own navigation (link click): asks (Leave armed); Leave allows the next try.
    const g = await h.guestPage(ctx, b)
    const r = await g.evaluate(() => JSON.parse(JSON.stringify(document.getElementById('b').getBoundingClientRect())))
    await h.guestClick(ctx, b, r.x + 10, r.y + r.height / 2)
    await ctx.sleep(400)
    h.assert(await leave(), 'link: dialog')
    h.assert(await ctx.page.$eval('.dialog .confirm', (e) => e.disabled), 'page-initiated: Leave armed')
    await ctx.sleep(700)
    await ctx.page.click('.dialog .confirm')
    await ctx.sleep(300)
    h.assert((await h.tileOf(ctx, b)).web.url === s.url + '/form', 'not redone by Tie (page navigation)')
    await h.guestClick(ctx, b, r.x + 10, r.y + r.height / 2)
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, b)).web.url === s.url + '/b', 'next click navigates')
    await ctx.tie('close', b)

    // ⌘W, Leave: closes.
    const c = await open()
    await k('Meta+w')
    h.assert(await leave(), 'dialog')
    await ctx.page.keyboard.press('Enter')
    await ctx.sleep(400)
    h.assert(!(await h.tileOf(ctx, c)), 'Leave closes the tile')

    // Quit: after the quit question, the page asks; Stay aborts the quit, Leave quits.
    const d = await open()
    await k('Meta+q')
    h.assert(await ctx.page.isVisible('.dialog.quit'), 'quit dialog')
    await ctx.page.keyboard.press('Enter')
    await h.waitFor(ctx, leave, 'then the page asks')
    await ctx.page.keyboard.press('Escape')
    await ctx.sleep(500)
    h.assert(alive() && (await h.tileOf(ctx, d)), 'Stay: no quit, page kept')
    await k('Meta+q')
    await ctx.page.keyboard.press('Enter')
    await h.waitFor(ctx, leave, 'asks again')
    await ctx.page.click('.dialog .confirm')
    for (let i = 0; i < 40 && alive(); i++) await ctx.sleep(100)
    h.assert(!alive(), 'Leave: quits')
  } finally {
    await s.close()
  }
}
