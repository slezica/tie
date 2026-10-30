// Terminals divided from a terminal (cmd+D, template drop next to it) start in its current directory.
export default async (ctx, h) => {
  const firstLine = (id) => ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] .xterm-rows`).innerText.trim().split('\n')[0], id)
  const pwdOf = async (id) => {
    await h.waitShell(ctx, id)
    await ctx.page.keyboard.type('clear; pwd\n')
    await h.waitFor(ctx, async () => (await firstLine(id)).startsWith('/'), `${id}: pwd shown`)
    return firstLine(id)
  }
  // The cd has run: the prompt is back after it. Well under the 2s cwd poll: the split must read it fresh.
  const cdDone = (id, dir) => h.waitText(ctx, id, new RegExp(`cd ${dir}[\\s\\S]*\\$\\s*$`))
  const a = (await h.list(ctx)).tiles[0].id
  await ctx.page.keyboard.type('cd /tmp\n')
  await cdDone(a, '/tmp')
  await h.press(ctx, 'Meta+d')
  const b = await h.waitFor(ctx, async () => { const x = (await h.list(ctx)).active; return x !== a && x }, 'split opened').catch(() => a)
  h.assert(b !== a, 'split opened')
  const pb = await pwdOf(b)
  h.assert(pb.endsWith('/tmp'), `cmd+D starts in /tmp (got ${pb})`)

  await ctx.page.keyboard.type('cd /usr\n')
  await cdDone(b, '/usr')
  await h.spawnFromTemplate(ctx, b, 'b')
  const c = await h.waitFor(ctx, async () => { const x = (await h.list(ctx)).active; return x !== b && x }, 'template terminal active')

  const pc = await pwdOf(c)
  h.assert(pc === '/usr', `template dropped next to b starts in /usr (got ${pc})`)
}
