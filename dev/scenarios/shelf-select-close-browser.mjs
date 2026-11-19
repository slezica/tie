// Group close (cmd+W on the shelf selection, SHELF.md "Selection") with a browser tile whose page
// holds its unload (beforeunload, after a real click): the page asks Leave / Stay like a single
// close. Stay: that tile stays (shelved, not selected), the others still close, then the recent
// board tile is active. Leave: it closes with the rest.
export const hiddenWindow = true

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="margin:0;font:16px sans-serif">${body}</body></html>`
const HOLD = `<script>addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = '' })</script>`

export default async (ctx, h) => {
  const s = await h.site(ctx, (path) => (path === '/form' ? page('Form', `<div style="height:400px"></div>${HOLD}`) : null))
  const L = () => h.list(ctx)
  const has = async (id) => !!(await h.tileOf(ctx, id))
  const leave = () => ctx.page.isVisible('.dialog.leave-page')
  const away = async () => {
    await ctx.page.mouse.move(300, 300, { steps: 5 })
    await h.settle(ctx)
  }
  const add = async () => (await ctx.tie('add', 'terminal', '--shelved')).id
  // Playwright would answer the guests' beforeunload dialogs itself (browser-unload.mjs): a listener
  // that never answers leaves them to Tie.
  const browser = ctx.page.context().browser()
  const quiet = (p) => p.on('dialog', () => {})
  for (const c of browser.contexts()) {
    c.pages().forEach(quiet)
    c.on('page', quiet)
  }
  try {
    const [a] = (await L()).tiles.map((t) => t.id)
    await h.waitShell(ctx, a)
    // A browser tile holding its unload, then shelved: the click needs it on the board.
    const held = async () => {
      const id = (await ctx.tie('add', s.url + '/form', '--at', a, '--side', 'r', '--focus')).id
      await h.guestPage(ctx, id)
      await h.guestClick(ctx, id, 200, 200) // sticky activation: Chromium ignores beforeunload without it
      await ctx.sleep(200) // the click lands: not observable from here (browser-unload.mjs `touch`)
      await ctx.tie('move', '--tile', id, '--shelve')
      return id
    }

    // Stay: c1, then b asks (Stay: b stays), then c2 still closes.
    const c1 = await add()
    const b = await held()
    const c2 = await add()
    await away()
    h.assert((await L()).shelf.join() === [c1, b, c2].join(), 'shelf: c1 b c2')
    await h.selectShelf(ctx, c2, b, c1)
    await h.press(ctx, 'Meta+w')
    await h.waitFor(ctx, leave, 'b: Leave page? dialog')
    h.assert(!(await has(c1)) && (await has(c2)), 'shelf order: c1 closed before b asks, c2 waits')
    await ctx.shot('group-close-leave-page')
    await ctx.page.click('.dialog .cancel') // Stay
    await h.waitGone(ctx, c2)
    await h.waitNoDialog(ctx)
    let l = await L()
    const tb = l.tiles.find((t) => t.id === b)
    h.assert(tb && tb.state === 'shelved' && !tb.selected, `Stay: b stays, shelved, not selected (${tb?.state})`)
    h.assert(!l.tiles.some((t) => t.selected) && l.active === a, `then the recent board tile (${l.active})`)
    h.assert((await h.tileOf(ctx, b)).web.url === s.url + '/form', 'Stay: b keeps its page')

    // Leave: b closes with the rest.
    const c3 = await add()
    await away()
    await h.selectShelf(ctx, b, c3)
    await h.press(ctx, 'Meta+w')
    await h.waitFor(ctx, leave, 'b asks again')
    await ctx.page.click('.dialog .confirm') // Leave
    await h.waitGone(ctx, b)
    await h.waitGone(ctx, c3)
    await h.waitNoDialog(ctx)
    l = await L()
    h.assert(l.active === a && l.tiles.length === 1, `Leave: all closed, a active (${l.tiles.map((t) => t.id)})`)
  } finally {
    await s.close()
  }
}
