// Security: OS drops (links, files, text) do nothing: no navigation attempt, no text into the shell.
// Offscreen + CDP can't reach the native navigate-on-drop path (macOS view), so this also asserts
// the mechanism that prevents it: the page claims every native drag (dragover/drop prevented).
export default async (ctx, h) => {
  const p = await h.probe(ctx)
  try {
    // Window capture, registered after the app's: sees its defaultPrevented, despite stopPropagation.
    await ctx.page.evaluate(() => {
      window.__ev = []
      for (const k of ['dragover', 'drop']) window.addEventListener(k, (e) => window.__ev.push(`${k}:${e.defaultPrevented}`), true)
    })
    const cdp = await ctx.page.context().newCDPSession(ctx.page)
    const [t] = (await h.list(ctx)).tiles
    const { x, y } = await h.sidePoint(ctx, t.id, 'c')
    const drop = async (items) => {
      const data = { items, dragOperationsMask: 1 }
      for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, x, y, data })
      await ctx.sleep(500)
    }
    await drop([{ mimeType: 'text/uri-list', data: p.url + '/dropped' }])
    await drop([{ mimeType: 'text/plain', data: 'echo DROPPED-TEXT' }])
    const ev = await ctx.page.evaluate(() => window.__ev)
    h.assert(ev.includes('drop:true') && !ev.some((e) => e.endsWith(':false')), `native drags claimed and dropped as no-ops: ${ev}`)
    await p.assertUntouched('drop')
    h.assert(!/blocked navigation/.test(ctx.appLog()), 'drop never even attempts navigation')
    const screen = await ctx.page.evaluate(() => document.querySelector('.xterm-rows').textContent)
    h.assert(!screen.includes('DROPPED-TEXT'), 'dropped text not typed into the shell')
  } finally {
    await p.close()
  }
}
