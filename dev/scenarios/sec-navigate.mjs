// Security: the UI window never navigates or opens windows (the preload would follow: RCE).
export default async (ctx, h) => {
  const p = await h.probe(ctx)
  try {
    const home = await h.uiUrl(ctx)
    const tryIt = async (what, fn) => {
      await ctx.page.evaluate(fn, p.url).catch(() => {}) // a successful navigation kills the context
      await p.assertUntouched(what)
      h.assert((await h.uiUrl(ctx)) === home, `${what}: shell left ${home}`)
    }
    await tryIt('location', (u) => (location.href = u + '/location'))
    await tryIt('link click', (u) => {
      const a = Object.assign(document.createElement('a'), { href: u + '/link' })
      document.body.append(a)
      a.click()
    })
    await tryIt('meta refresh', (u) => document.head.insertAdjacentHTML('beforeend', `<meta http-equiv="refresh" content="0;url=${u}/meta">`))
    await tryIt('window.open', (u) => window.open(u + '/open'))
    await tryIt('target=_blank', (u) => {
      const a = Object.assign(document.createElement('a'), { href: u + '/blank', target: '_blank' })
      document.body.append(a)
      a.click()
    })
    // Still alive and driving.
    const l = await h.list(ctx)
    h.assert(l.tiles.length === 1, `app still works: ${JSON.stringify(l.tiles.map((t) => t.id))}`)
    // Reloading the UI itself stays allowed (dev HMR), and drops the old ptys.
    await ctx.page.evaluate(() => location.reload())
    await ctx.page.waitForSelector('.tile')
    await h.eventually(ctx, async () => {
      h.assert((await h.uiUrl(ctx)) === home, 'reload keeps the UI')
      h.assert(/page reload, killing 1/.test(ctx.appLog()), 'reload drops old ptys')
    })
  } finally {
    await p.close()
  }
}
