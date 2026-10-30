// Security: pastes with control characters, or that would run commands, ask first (Cancel / Paste anyway).
export default async (ctx, h) => {
  const answer = async (button) => {
    await ctx.page.click(`.dialog.paste-warning button.${button}`)
    await h.waitNoDialog(ctx)
  }
  const warning = () => h.waitFor(ctx, () => h.pasteWarning(ctx), 'paste warning')
  // zsh -f: bracketed paste on.
  const z = (await ctx.tie('add', 'terminal', '--cmd', 'zsh -f')).id
  await h.waitShell(ctx, z) // zsh prompt drawn: its line editor (bracketed paste) is on

  // Bracketed-paste escape: control warning; Cancel = nothing typed, nothing run.
  await h.paste(ctx, z, 'echo looks-harmless\x1b[201~echo PWNED-$((6*7))\r')
  let w = await warning().catch(() => null)
  h.assert(w?.warnings.includes('control'), `control warning (got ${JSON.stringify(w)})`)
  h.assert(w.preview.includes('^[[201~'), 'control chars visible in preview (caret notation)')
  await ctx.shot('control-warning')
  await answer('cancel')
  h.assert(!(await h.pasteWarning(ctx)), 'dialog closed')
  await ctx.sleep(300) // absence: nothing pasted
  let s = await h.screen(ctx, z)
  h.assert(!s.includes('looks-harmless') && !s.includes('PWNED-42'), 'cancel: nothing pasted')

  // Plain line: no dialog.
  await h.paste(ctx, z, 'echo single-line')
  await h.waitText(ctx, z, 'echo single-line').catch(() => {}) // written: a dialog would have come first
  h.assert(!(await h.pasteWarning(ctx)), 'single line: no dialog')
  h.assert((await h.screen(ctx, z)).includes('echo single-line'), 'single line pasted')
  await ctx.page.keyboard.press('Control+u')

  // Multi-line with bracketed paste on: no dialog, not run.
  await h.paste(ctx, z, 'echo M1-$((1+1))\necho M2')
  await h.waitText(ctx, z, 'echo M2').catch(() => {}) // in the line editor: a dialog would have come first
  h.assert(!(await h.pasteWarning(ctx)), 'bracketed multi-line: no dialog')
  h.assert(!(await h.screen(ctx, z)).includes('M1-2'), 'bracketed multi-line not run')
  await ctx.page.keyboard.press('Control+c')

  // cat: bracketed paste off, newlines would be sent as Enter.
  const c = (await ctx.tie('add', 'terminal', '--cmd', 'cat')).id
  // cat running (the shell's child, or the shell exec'd into it): before that the tty may still echo.
  const { execFileSync } = await import('node:child_process')
  const cmdOf = (pid) => { try { return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }) } catch { return '' } }
  await h.waitFor(ctx, async () => { const pid = (await h.tileOf(ctx, c))?.term?.pid; return pid && (/^cat\b/.test(cmdOf(pid)) || (await h.children(ctx, c)).some((x) => /^cat\b/.test(x.command))) }, 'cat running')
  await h.paste(ctx, c, 'R1-line\nR2-line')
  w = await warning().catch(() => null)
  h.assert(w?.warnings.join() === 'run', `run warning only (got ${JSON.stringify(w)})`)
  await ctx.shot('run-warning')
  await answer('cancel')
  await ctx.sleep(300) // absence: nothing sent
  h.assert(!(await h.screen(ctx, c)).includes('R1-line'), 'cancel: nothing sent')
  await h.paste(ctx, c, 'R1-line\nR2-line\n')
  await warning()
  await answer('confirm')
  await h.eventually(ctx, async () => h.assert((await h.screen(ctx, c)).split('R1-line').length > 2, 'paste anyway: sent (cat echoes the line back)'))

  // Both at once: one dialog, both warnings; Paste anyway sends the raw text.
  await h.paste(ctx, c, 'B1\x07-bell\nB2\n')
  w = await warning().catch(() => null)
  h.assert(w?.warnings.sort().join() === 'control,run', `both warnings (got ${JSON.stringify(w)})`)
  await answer('confirm')
  await h.eventually(ctx, async () => h.assert((await h.screen(ctx, c)).includes('B1'), 'paste anyway: raw text sent'))
}
