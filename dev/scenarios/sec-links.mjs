// Security: terminal links (OSC 8) open only on cmd-click, only http(s), only via main's openExternal.
export default async (ctx, h) => {
  const p = await h.probe(ctx)
  try {
    // A confirm() would block the renderer (and this run): record instead.
    await ctx.page.evaluate(() => ((window.__confirms = []), (window.confirm = (m) => (window.__confirms.push(m), false))))
    const link = (url, text) => `printf '\\033]8;;${url}\\033\\\\${text}\\033]8;;\\033\\\\\\n'`
    await ctx.page.keyboard.type(`clear; ${link(p.url + '/osc', 'web-link')}; ${link('file:///etc/hosts', 'file-link')}`)
    await ctx.page.keyboard.press('Enter')
    await ctx.sleep(500)
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
    const web = await pointOf('web-link')
    const file = await pointOf('file-link')
    h.assert(web && file, 'links printed')
    const opened = () => ctx.appLog().match(/external open .*/g) || []

    await ctx.page.mouse.click(web.x, web.y)
    await p.assertUntouched('plain click', 500)
    h.assert(!opened().length, 'plain click opens nothing')
    h.assert(!(await ctx.page.evaluate(() => window.__confirms.length)), 'no confirm() dialog')

    await ctx.page.mouse.move(web.x, web.y)
    await ctx.sleep(300)
    const tip = await ctx.page.textContent('.link-tip').catch(() => null)
    h.assert(tip?.includes(p.url + '/osc'), `hover shows full URL (got ${tip})`)
    await ctx.shot('hover')

    await ctx.page.keyboard.down('Meta')
    await ctx.page.mouse.click(web.x, web.y)
    await ctx.page.mouse.click(file.x, file.y)
    await ctx.page.keyboard.up('Meta')
    await p.assertUntouched('cmd-click (handed to the OS, never loaded in-app)', 500)
    h.assert(opened().length === 1 && opened()[0].includes(p.url + '/osc'), `cmd-click opens http externally: ${opened()}`)
    h.assert(/refused external file:\/\/\/etc\/hosts/.test(ctx.appLog()), 'file: scheme refused')
  } finally {
    await p.close()
  }
}
