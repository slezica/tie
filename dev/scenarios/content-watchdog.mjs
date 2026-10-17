// Content watchdog: a hung content frame (busy loop) → its tile shows "Viewer stopped responding" and
// its process goes away; a crashed frame → "Viewer crashed". The shell, terminals and other content
// tiles stay responsive throughout. No automatic reload.
export default async (ctx, h) => {
  const [t] = (await h.list(ctx)).tiles.map((t) => t.id)
  const a = (await ctx.tie('open', 'probe', '--at', t, '--side', 'r')).id
  const b = (await ctx.tie('open', 'probe', '--at', a, '--side', 'b')).id
  const fa = await h.probeFrame(ctx, a)
  const fb = await h.probeFrame(ctx, b)
  const pidOf = async (f) => (await h.frames(ctx)).find((x) => x.url === f.url())?.pid
  const pa = await pidOf(fa)
  const pb = await pidOf(fb)
  const shell = (await h.frames(ctx)).find((x) => x.depth === 0)?.pid
  h.assert(pa && pb && pa !== pb && pa !== shell && pb !== shell, `separate processes: a ${pa}, b ${pb}, shell ${shell}`)
  const alive = (pid) => {
    try {
      return process.kill(pid, 0)
    } catch {
      return false
    }
  }
  // Shell answers fast; a terminal still runs commands.
  const shellLatency = async () => {
    const t0 = Date.now()
    await ctx.page.evaluate(() => document.querySelectorAll('.tile').length)
    return Date.now() - t0
  }
  let n = 0
  const terminalWorks = async () => {
    const tag = `${++n * 7}`
    await ctx.tie('focus', t)
    await ctx.page.keyboard.type(`echo $((${n}*7))ok\n`)
    await h.waitFor(ctx, async () => (await h.screen(ctx, t)).includes(`${tag}ok`), `terminal answers (${tag}ok)`)
  }
  await terminalWorks()

  // Hang: a's viewer spins forever. Before the deadline the shell, b and the terminal are fine.
  await fa.evaluate(() => setTimeout(() => { for (;;); }, 0))
  const lat = []
  for (let i = 0; i < 6; i++) {
    lat.push(await shellLatency())
    await ctx.sleep(300)
  }
  h.assert(Math.max(...lat) < 250, `shell responsive while a frame spins: ${lat} ms`)
  h.assert((await fb.evaluate(() => 6 * 7)) === 42, 'other content frame answers')
  await terminalWorks()

  const err = await h.waitFor(ctx, async () => (await h.tileOf(ctx, a)).error, 'hung frame → tile error', 12000)
  h.assert(err === 'Viewer stopped responding', `hang message: ${err}`)
  h.assert(await ctx.page.isVisible(`.tile[data-id="${a}"] .tile-error`), 'error visible')
  h.assert(!(await ctx.page.$(`.tile[data-id="${a}"] iframe`)), 'hung frame removed')
  await h.waitFor(ctx, async () => !alive(pa), `hung frame process ${pa} gone`, 8000)
  await ctx.shot('hung')

  // b, the shell and the terminal unaffected; no reload attempt on a.
  h.assert(!(await h.tileOf(ctx, b)).error && (await fb.evaluate(() => window.probe.inits)) === 1, 'other content tile untouched')
  h.assert((await shellLatency()) < 250, 'shell responsive after')
  await terminalWorks()
  await ctx.sleep(1500)
  h.assert(!(await ctx.page.$(`.tile[data-id="${a}"] iframe`)) && (await h.tileOf(ctx, a)).error === err, 'no automatic reload')

  // Crash: b's renderer process dies (CDP Page.crash on that frame's own target).
  const cdp = await ctx.page.context().newCDPSession(fb)
  await cdp.send('Page.crash').catch(() => {})
  const err2 = await h.waitFor(ctx, async () => (await h.tileOf(ctx, b)).error, 'crashed frame → tile error', 12000)
  h.assert(err2 === 'Viewer crashed', `crash message: ${err2}`)
  h.assert(!alive(pb), 'crashed process gone')
  h.assert((await shellLatency()) < 250, 'shell responsive after crash')
  await terminalWorks()
  h.assert((await h.list(ctx)).tiles.length === 3, 'all tiles still there')
  await ctx.shot('crashed')
  const log = ctx.appLog()
  h.assert(/\[content\] hung t\d+/.test(log) && /\[content\] crashed t\d+/.test(log), 'logged')
}
