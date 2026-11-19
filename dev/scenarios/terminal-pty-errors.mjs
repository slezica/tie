// pty calls node-pty would throw on (sizes that aren't positive integers, non-text writes) never
// surface as an uncaught exception in main (a dialog for the user; logged `[error]`). The runner
// fails any scenario whose instance logs one (drive.mjs); asserted here too, as this case's point.
// Not reproduced here: `ioctl(2) failed, EBADF` on a resize after the pty's terminal side closed
// (seen in harness runs 2026-11-19; same try / catch in main/pty.ts).
export default async (ctx, h) => {
  const t0 = (await h.list(ctx)).tiles[0].id
  const pid = (await h.waitTile(ctx, t0, (t) => t.term?.pid, 'spawned')).term.pid
  const size = async () => (await h.tileOf(ctx, t0)).term
  const before = await size()
  await ctx.page.evaluate((pid) => {
    for (const [c, r] of [[NaN, 24], ['a', {}], [80.5, 24], [Infinity, 24], [0, 0], [-1, 5]]) window.tie.pty.resize(pid, c, r)
    window.tie.pty.write(pid, { not: 'text' })
    window.tie.pty.write(pid, 'echo still-$((40+2))\r') // control: main still serves this pty
  }, pid)
  await h.waitFor(ctx, () => ctx.page.evaluate(() => document.querySelector('.xterm-rows').textContent.includes('still-42')), 'pty still works after the bad calls')
  h.assert(!/ \[error\] /.test(ctx.rawLog()), `no uncaught exception in main: ${ctx.rawLog().match(/.*\[error\].*/)?.[0] ?? ''}`)
  h.assert(JSON.stringify(await size()) === JSON.stringify(before), 'size unchanged by bad resizes')
}
