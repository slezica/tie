// Security: pastes with control characters, or that would run commands, ask first (Cancel / Paste anyway).
export default async (ctx, h) => {
  const answer = async (button) => {
    await ctx.page.click(`.dialog.paste-warning button.${button}`)
    await ctx.sleep(400)
  }
  // zsh -f: bracketed paste on.
  const z = (await ctx.tie('add', 'terminal', '--cmd', 'zsh -f')).id
  await ctx.sleep(800)

  // Bracketed-paste escape: control warning; Cancel = nothing typed, nothing run.
  await h.paste(ctx, z, 'echo looks-harmless\x1b[201~echo PWNED-$((6*7))\r')
  let w = await h.pasteWarning(ctx)
  h.assert(w?.warnings.includes('control'), `control warning (got ${JSON.stringify(w)})`)
  h.assert(w.preview.includes('^[[201~'), 'control chars visible in preview (caret notation)')
  await ctx.shot('control-warning')
  await answer('cancel')
  h.assert(!(await h.pasteWarning(ctx)), 'dialog closed')
  let s = await h.screen(ctx, z)
  h.assert(!s.includes('looks-harmless') && !s.includes('PWNED-42'), 'cancel: nothing pasted')

  // Plain line: no dialog.
  await h.paste(ctx, z, 'echo single-line')
  h.assert(!(await h.pasteWarning(ctx)), 'single line: no dialog')
  h.assert((await h.screen(ctx, z)).includes('echo single-line'), 'single line pasted')
  await ctx.page.keyboard.press('Control+u')

  // Multi-line with bracketed paste on: no dialog, not run.
  await h.paste(ctx, z, 'echo M1-$((1+1))\necho M2')
  h.assert(!(await h.pasteWarning(ctx)), 'bracketed multi-line: no dialog')
  h.assert(!(await h.screen(ctx, z)).includes('M1-2'), 'bracketed multi-line not run')
  await ctx.page.keyboard.press('Control+c')

  // cat: bracketed paste off, newlines would be sent as Enter.
  const c = (await ctx.tie('add', 'terminal', '--cmd', 'cat')).id
  await ctx.sleep(800)
  await h.paste(ctx, c, 'R1-line\nR2-line')
  w = await h.pasteWarning(ctx)
  h.assert(w?.warnings.join() === 'run', `run warning only (got ${JSON.stringify(w)})`)
  await ctx.shot('run-warning')
  await answer('cancel')
  h.assert(!(await h.screen(ctx, c)).includes('R1-line'), 'cancel: nothing sent')
  await h.paste(ctx, c, 'R1-line\nR2-line\n')
  await answer('confirm')
  s = await h.screen(ctx, c)
  h.assert(s.split('R1-line').length > 2, 'paste anyway: sent (cat echoes the line back)')

  // Both at once: one dialog, both warnings; Paste anyway sends the raw text.
  await h.paste(ctx, c, 'B1\x07-bell\nB2\n')
  w = await h.pasteWarning(ctx)
  h.assert(w?.warnings.sort().join() === 'control,run', `both warnings (got ${JSON.stringify(w)})`)
  await answer('confirm')
  h.assert((await h.screen(ctx, c)).includes('B1'), 'paste anyway: raw text sent')
}
