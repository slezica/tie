// Terminal children are responsible for themselves (TCC): a program in a Tie shell that asks
// for the microphone etc. prompts under its own name, not Tie's (TERMINALS.md "Spawn", SECURITY.md).
// The shell is spawned disclaimed (patches/node-pty: responsibility_spawnattrs_setdisclaim), so a
// child's responsible pid is the shell (its nearest responsible ancestor), not Tie. Red without the
// patch: responsible = Tie's pid.
export default async (ctx, h) => {
  const py = `import ctypes, os; f = ctypes.CDLL(None).responsibility_get_pid_responsible_for_pid; print("responsible=%d parent=%d" % (f(os.getpid()), os.getppid()))`
  const t = await ctx.tie('add', 'terminal', '--cmd', `python3 -c '${py}'; sleep 30`)
  const line = await h.waitFor(ctx, async () => {
    const text = await ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] .xterm-rows`)?.innerText ?? '', t.id)
    return text.split('\n').find((l) => l.startsWith('responsible='))
  }, 'child printed its responsible pid', 8000)
  const m = /responsible=(\d+) parent=(\d+)/.exec(line)
  h.assert(m, `unexpected output: ${line}`)
  ctx.log(line)
  h.assert(m[1] === m[2], `child's responsible pid ${m[1]} is not its shell ${m[2]} (Tie would be: not disclaimed)`)
  await ctx.tie('close', t.id)
}
