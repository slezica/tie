// Security: with both paste guards turned off in settings, pastes go through raw, no dialog.
export const settings = { warnPasteControl: false, warnPasteRun: false }
export default async (ctx, h) => {
  const c = (await ctx.tie('add', 'terminal', '--cmd', 'cat')).id
  // cat running: bash -c execs it in place (the tile's own pid), so not a child.
  const { execFileSync } = await import('node:child_process')
  const cmdOf = (pid) => execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim()
  await h.waitFor(ctx, async () => /^cat\b/.test(cmdOf((await h.tileOf(ctx, c)).term.pid)), 'cat started')
  await h.paste(ctx, c, 'OFF1\x07-bell\nOFF2\n')
  // cat echoes the paste (tty echo + cat's output: twice).
  await h.waitFor(ctx, async () => (await h.screen(ctx, c)).split('OFF1').length > 2, 'cat echoed the paste', 8000).catch(() => null)
  h.assert(!(await h.pasteWarning(ctx)), 'no dialog')
  const s = await h.screen(ctx, c)
  h.assert(s.split('OFF1').length > 2 && s.includes('OFF2'), `raw paste sent: ${s.replace(/\s+/g, ' ').slice(0, 120)}`)
}
