// Browser beforeunload (BROWSER.md "Leaving a page"): a page holding its unload (after a real click:
// sticky activation) makes Tie ask Leave / Stay before closing the tile (⌘W), reloading, the page's
// own navigation, closing its tab and quitting. Stay keeps the page; Leave proceeds. Shift+click on
// the ×: no question. One prompt at a time (a page's prompt while a dialog is open: dropped, Stay); a
// hung handler (no answer in 3 s) doesn't keep the tile open.
import { existsSync } from 'node:fs'
import { infoPath } from '../lib.mjs'

export const hiddenWindow = true

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="margin:0;font:16px sans-serif">${body}</body></html>`
const HOLD = `<script>addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = '' })</script>`
// The page reports clicks to the site (touch(): the click landed, without an evaluate in the guest).
const CLICKS = `<script>addEventListener('click', () => fetch('/clicked').catch(() => {}))</script>`
// A beforeunload handler that never answers in time (busy 6 s; Tie gives up after 3 s).
const HANG = `<script>addEventListener('beforeunload', () => { const t = Date.now(); while (Date.now() - t < 6000); })</script>`

export default async (ctx, h) => {
  const s = await h.site(ctx, (path) => {
    if (path === '/form') return page('Form', `<a id="b" href="/b" style="display:block;padding:20px">to b</a><div style="height:300px"></div>${HOLD}${CLICKS}`)
    if (path === '/hang') return page('Hang', `<div style="height:300px"></div>${HANG}${CLICKS}`)
    if (path === '/clicked') return ''
    if (path === '/b') return page('B', '<h1>b</h1>')
    return null
  })
  const alive = () => existsSync(infoPath(ctx.instance))
  const leave = () => ctx.page.isVisible('.dialog.leave-page')
  const k = (chord) => h.press(ctx, chord)
  const hits = (p) => s.hits.filter((x) => x === p).length
  const touch = async (id) => {
    await h.guestPage(ctx, id)
    // Sticky activation (a real click, no link there): Chromium ignores beforeunload without it. The
    // click is confirmed by the page's own report (a fetch from its click handler), not by an
    // evaluate in the guest (any evaluate grants activation itself, and one racing a reload hung
    // under load). A click lost while the guest settles is repeated.
    const n = hits('/clicked')
    for (let i = 0; i < 3 && hits('/clicked') === n; i++) {
      await h.guestClick(ctx, id, 200, 200)
      await h.waitFor(ctx, () => hits('/clicked') > n, 'click landed in the guest', 1500).catch(() => {})
    }
    h.assert(hits('/clicked') > n, `click landed in the guest ${id}`)
  }
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
    await h.waitFor(ctx, leave, 'close: Leave page? dialog')
    h.assert((await ctx.page.textContent('.dialog h2')) === 'Leave page?' && (await ctx.page.evaluate(() => document.activeElement?.textContent)) === 'Leave', 'Leave focused')
    await ctx.shot('leave-page')
    await ctx.page.keyboard.press('Escape')
    await h.eventually(ctx, async () => h.assert(!(await leave()) && (await h.tileOf(ctx, b)), 'Stay keeps the tile'))
    h.assert((await (await h.guestPage(ctx, b)).evaluate(() => window.__mark)) === 1, 'same page, still alive')

    // Reload (UI): asks; Stay: no reload; Leave: reloads.
    await ctx.tie('focus', '--tile', b)
    let n = hits('/form')
    await k('Meta+r')
    await h.waitFor(ctx, leave, 'reload: dialog')
    await ctx.page.click('.dialog .cancel')
    await h.waitNoDialog(ctx)
    await ctx.sleep(500) // absence: no reload follows Stay
    h.assert(hits('/form') === n, 'Stay: no reload')
    await k('Meta+r')
    await h.waitFor(ctx, leave, 'reload again: dialog')
    await ctx.page.keyboard.press('Enter')
    await h.eventually(ctx, async () => h.assert(hits('/form') === n + 1, `Leave: reloaded: ${JSON.stringify(s.hits)} n=${n}`))
    await touch(b)

    // The page's own navigation (link click): asks (Leave armed); Leave allows the next try.
    const g = await h.guestPage(ctx, b)
    const r = await g.evaluate(() => JSON.parse(JSON.stringify(document.getElementById('b').getBoundingClientRect())))
    await h.guestClick(ctx, b, r.x + 10, r.y + r.height / 2)
    await h.waitFor(ctx, leave, 'link: dialog')
    h.assert(await ctx.page.$eval('.dialog .confirm', (e) => e.disabled), 'page-initiated: Leave armed')
    await h.waitArmed(ctx)
    await ctx.page.click('.dialog .confirm')
    await h.waitNoDialog(ctx)
    await ctx.sleep(300) // absence: Tie doesn't redo the page's navigation
    h.assert((await h.tileOf(ctx, b)).web.url === s.url + '/form', 'not redone by Tie (page navigation)')
    await h.guestClick(ctx, b, r.x + 10, r.y + r.height / 2)
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, b)).web.url === s.url + '/b', 'next click navigates')
    await ctx.tie('close', '--tile', b)

    // ⌘W, Leave: closes.
    const c = await open()
    await k('Meta+w')
    await h.waitFor(ctx, leave, 'dialog')
    await ctx.page.keyboard.press('Enter')
    await h.eventually(ctx, async () => h.assert(!(await h.tileOf(ctx, c)), 'Leave closes the tile'))

    // Shift+click on the ×: closes without asking.
    const f = await open()
    await h.clickButton(ctx, f, 'close', ['Shift'])
    await h.waitGone(ctx, f)
    await ctx.sleep(300) // absence: no dialog follows the forced close
    h.assert(!(await leave()), 'shift+click ×: no Leave page? dialog')

    // One prompt at a time: while the ⌘W question is open, another page's own navigation (held) gets
    // no second dialog: dropped (logged), that page stays (Stay).
    const e1 = await open()
    const e2 = await open() // active
    await k('Meta+w')
    await h.waitFor(ctx, leave, '⌘W: dialog')
    const r1 = await (await h.guestPage(ctx, e1)).evaluate(() => JSON.parse(JSON.stringify(document.getElementById('b').getBoundingClientRect())))
    await h.guestClick(ctx, e1, r1.x + 10, r1.y + r1.height / 2)
    await h.waitLog(ctx, new RegExp(`\\[guest\\] unload prompt dropped \\(dialog open\\) ${e1}`))
    h.assert((await ctx.page.locator('.dialog').count()) === 1, 'one dialog at a time')
    await ctx.page.click('.dialog .cancel') // Stay (the click into the other guest took the keyboard)
    await h.waitNoDialog(ctx)
    await ctx.sleep(300) // absence: no second dialog follows
    h.assert(!(await leave()) && (await h.tileOf(ctx, e1)).web.url === s.url + '/form' && (await h.tileOf(ctx, e2)), 'dropped prompt: page stays; Stay keeps the other')
    for (const x of [e1, e2]) await ctx.tie('close', '--tile', x)

    // Closing a tab holding such a page (⌘⇧W): asks; Stay keeps the tab and the page; Leave closes it.
    await k('Meta+t')
    await h.waitFor(ctx, async () => (await h.list(ctx)).tabs.length === 2, 'new tab')
    const tb = (await ctx.tie('add', s.url + '/form', '--focus')).id // the visible (new) tab
    await touch(tb)
    await k('Meta+Shift+w')
    await h.waitFor(ctx, leave, 'tab close: dialog')
    await ctx.page.keyboard.press('Escape')
    await h.waitNoDialog(ctx)
    await ctx.sleep(300) // absence: the tab stays
    h.assert((await h.list(ctx)).tabs.length === 2 && (await h.tileOf(ctx, tb)), 'Stay: tab and page kept')
    await k('Meta+Shift+w')
    await h.waitFor(ctx, leave, 'tab close again: dialog')
    await ctx.page.keyboard.press('Enter')
    await h.waitFor(ctx, async () => (await h.list(ctx)).tabs.length === 1 && !(await h.tileOf(ctx, tb)), 'Leave: tab closed')

    // A handler that never answers: no question, the tile closes after Tie's 3 s (main gives up),
    // before the page's handler would have finished (6 s).
    const hg = (await ctx.tie('add', s.url + '/hang', '--at', t0, '--side', 'r', '--focus')).id
    await touch(hg)
    const gid = (await h.tileOf(ctx, hg)).web.guest
    const t = Date.now()
    await k('Meta+w')
    await h.waitGone(ctx, hg, 8000)
    const took = Date.now() - t
    h.assert(took >= 2500 && took < 5500 && !(await leave()), `hung handler: closed after Tie's 3 s, no dialog (${took} ms)`)
    h.assert(new RegExp(`\\[guest\\] unload ${gid} closed`).test(ctx.appLog()), 'unload gave up (closed)')

    // Quit: after the quit question, the page asks; Stay aborts the quit, Leave quits.
    const d = await open()
    await k('Meta+q')
    await h.waitDialog(ctx, '.dialog.quit')
    await ctx.page.keyboard.press('Enter')
    await h.waitFor(ctx, leave, 'then the page asks')
    await ctx.page.keyboard.press('Escape')
    await h.waitNoDialog(ctx)
    await ctx.sleep(500) // absence: Stay aborts the quit
    h.assert(alive() && (await h.tileOf(ctx, d)), 'Stay: no quit, page kept')
    await k('Meta+q')
    await h.waitDialog(ctx, '.dialog.quit')
    await ctx.page.keyboard.press('Enter')
    await h.waitFor(ctx, leave, 'asks again')
    await ctx.page.click('.dialog .confirm')
    await h.waitFor(ctx, async () => !alive(), 'Leave: quits')
  } finally {
    await s.close()
  }
}
