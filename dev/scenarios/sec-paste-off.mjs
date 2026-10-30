// Security: with both paste guards turned off in settings, pastes go through raw, no dialog.
export const settings = { warnPasteControl: false, warnPasteRun: false }
export default async (ctx, h) => {
  const c = (await ctx.tie('add', 'terminal', '--cmd', 'cat')).id
  await ctx.sleep(800)
  await h.paste(ctx, c, 'OFF1\x07-bell\nOFF2\n')
  h.assert(!(await h.pasteWarning(ctx)), 'no dialog')
  // cat echoes once the login shell has started it (the paste waits in the tty buffer meanwhile).
  await h.waitFor(ctx, async () => (await h.screen(ctx, c)).split('OFF1').length > 2, 'cat echoed the paste', 8000).catch(() => null)
  const s = await h.screen(ctx, c)
  h.assert(s.split('OFF1').length > 2 && s.includes('OFF2'), `raw paste sent: ${s.replace(/\s+/g, ' ').slice(0, 120)}`)
}
