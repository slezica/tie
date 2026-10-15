// Security: with both paste guards turned off in settings, pastes go through raw, no dialog.
export const settings = { warnPasteControl: false, warnPasteRun: false }
export default async (ctx, h) => {
  const c = (await ctx.tie('open', 'terminal', '--cmd', 'cat')).id
  await ctx.sleep(800)
  await h.paste(ctx, c, 'OFF1\x07-bell\nOFF2\n')
  h.assert(!(await h.pasteWarning(ctx)), 'no dialog')
  const s = await h.screen(ctx, c)
  h.assert(s.split('OFF1').length > 2 && s.includes('OFF2'), `raw paste sent: ${s.replace(/\s+/g, ' ').slice(0, 120)}`)
}
