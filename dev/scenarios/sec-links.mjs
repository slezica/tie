// Security: terminal links (OSC 8) show their real target in the tile's link strip, open only on
// cmd-click, only http(s), only after the user confirms, only via main's openExternal.
export default async (ctx, h) => {
  const p = await h.probe(ctx)
  try {
    // A confirm() would block the renderer (and this run): record instead.
    await ctx.page.evaluate(() => ((window.__confirms = []), (window.confirm = (m) => (window.__confirms.push(m), false))))
    const link = (url, text) => `printf '\\033]8;;${url}\\033\\\\${text}\\033]8;;\\033\\\\\\n'`
    await ctx.page.keyboard.type(`clear; ${link(p.url + '/osc', 'web-link')}; ${link('file:///etc/hosts', 'file-link')}`)
    await ctx.page.keyboard.press('Enter')
    // Center of a word printed in the terminal (DOM renderer rows).
    const pointOf = (word) =>
      ctx.page.evaluate((word) => {
        for (const row of document.querySelectorAll('.xterm-rows > div')) {
          const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
          for (let n; (n = walker.nextNode()); ) {
            const i = n.textContent.indexOf(word)
            if (i < 0 || row.textContent.startsWith('%') || row.textContent.includes('printf')) continue
            const r = document.createRange()
            r.setStart(n, i)
            r.setEnd(n, i + word.length)
            const b = r.getBoundingClientRect()
            return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
          }
        }
        return null
      }, word)
    // Printed, not just typed: the command line (which names them too) cleared.
    const t1 = (await h.list(ctx)).tiles[0].id
    const [web, file] = await h.waitFor(ctx, async () => {
      if ((await h.screen(ctx, t1)).includes('printf')) return null
      const w = await pointOf('web-link')
      const f = await pointOf('file-link')
      return w && f && [w, f]
    }, 'links printed')
    const opened = () => ctx.appLog().match(/external open .*/g) || []

    await ctx.page.mouse.click(web.x, web.y)
    await p.assertUntouched('plain click', 500)
    h.assert(!opened().length, 'plain click opens nothing')
    h.assert(!(await ctx.page.evaluate(() => window.__confirms.length)), 'no confirm() dialog')

    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const strip = () => ctx.page.textContent(`.tile[data-id="${t0}"] .link-strip`).catch(() => null)
    await ctx.page.mouse.move(web.x, web.y)
    await h.eventually(ctx, async () => h.assert((await strip())?.includes(p.url + '/osc'), `hover shows the full URL in the link strip (got ${await strip()})`))
    await ctx.shot('hover')
    await ctx.page.mouse.move(file.x, file.y)
    await h.eventually(ctx, async () => h.assert(/^Blocked link: file:\/\/\/etc\/hosts/.test((await strip()) ?? ''), `blocked scheme shown as blocked (got ${await strip()})`))

    await ctx.page.keyboard.down('Meta')
    await ctx.page.mouse.click(file.x, file.y)
    await ctx.page.mouse.click(web.x, web.y)
    await ctx.page.keyboard.up('Meta')
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.external-open'), 'cmd-click on http: confirm dialog')
    h.assert((await ctx.page.textContent('.dialog.external-open .url')) === p.url + '/osc' && !opened().length, 'full URL shown, nothing opened yet')
    await ctx.page.click('.dialog .confirm')
    await h.waitFor(ctx, async () => opened().length === 1, 'Open: external open')
    await p.assertUntouched('cmd-click (handed to the OS, never loaded in-app)', 500)
    h.assert(opened()[0].includes(p.url + '/osc') && !(await ctx.page.isVisible('.dialog-backdrop')), `only the http link went out: ${opened()}`)
  } finally {
    await p.close()
  }
}
