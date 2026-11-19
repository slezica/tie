// Security: the UI window never navigates, opens windows or downloads (the preload would follow: RCE).
// Each attempt is refused by main's guard (security.ts guard(): its [security] log line names the
// URL); a blocked navigation never kills the ptys (they die only on a committed one, did-navigate).
export default async (ctx, h) => {
  const p = await h.probe(ctx)
  try {
    const home = await h.uiUrl(ctx)
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const pid = (await h.tileOf(ctx, t0)).term.pid
    // Pages Playwright sees over CDP (the UI; a window.open that slipped through would add one).
    const pages = () => ctx.page.context().browser().contexts().flatMap((c) => c.pages()).length
    const pages0 = pages()
    // `blocked`: the guard's own log line for this attempt (security.ts will-frame-navigate,
    // setWindowOpenHandler). The probe (loopback through the UI session's dead proxy) can't see a
    // hit either way: noNetwork only, not this guard.
    const tryIt = async (what, blocked, fn) => {
      const r = await ctx.page.evaluate(fn, p.url).catch(() => 'context gone') // a successful navigation kills the context
      await h.waitLog(ctx, blocked)
      await p.assertUntouched(what)
      h.assert((await h.uiUrl(ctx)) === home, `${what}: shell left ${home}`)
      return r
    }
    const url = (path) => new RegExp(`\\[security\\] blocked navigation main ${p.url.replace(/\./g, '\\.')}${path}$`, 'm')
    await tryIt('location', url('/location'), (u) => void (location.href = u + '/location'))
    await tryIt('link click', url('/link'), (u) => {
      const a = Object.assign(document.createElement('a'), { href: u + '/link' })
      document.body.append(a)
      a.click()
    })
    await tryIt('meta refresh', url('/meta'), (u) => document.head.insertAdjacentHTML('beforeend', `<meta http-equiv="refresh" content="0;url=${u}/meta">`))
    // window.open / target=_blank: denied by the window open handler (no new window, no new page).
    const opened = await tryIt('window.open', /\[security\] blocked window\.open http:\/\/127\.0\.0\.1:\d+\/open$/m, (u) => String(window.open(u + '/open')))
    h.assert(opened === 'null', `window.open returned ${opened}`)
    await tryIt('target=_blank', /\[security\] blocked window\.open http:\/\/127\.0\.0\.1:\d+\/blank$/m, (u) => {
      const a = Object.assign(document.createElement('a'), { href: u + '/blank', target: '_blank' })
      document.body.append(a)
      a.click()
    })
    h.assert(pages() === pages0, `no new window (pages ${pages0} → ${pages()})`)
    // Downloads: the UI session refuses them (guest.ts noDownloads, logged). Content frames can't
    // start one at all (no allow-downloads in their sandbox): that layer is the policy table's.
    const dl = `tie-sec-navigate-${process.pid}.txt`
    await ctx.page.evaluate((dl) => {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['x'])), download: dl })
      document.body.append(a)
      a.click()
    }, dl)
    await h.waitLog(ctx, /\[security\] blocked download blob:tie:\/\/app\//)
    // Blocked navigations never reach did-navigate: no pty killed.
    h.assert(!/page reload, killing/.test(ctx.appLog()), 'a blocked navigation killed the ptys')
    process.kill(pid, 0) // throws if the shell died
    h.assert((await h.tileOf(ctx, t0)).exit === null, 'terminal still running after the blocked navigations')
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
