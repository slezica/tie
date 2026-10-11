// Terminals divided from a terminal (cmd+D, template drop next to it) start in its current directory.
export default async (ctx, h) => {
  const pwdOf = async (id) => {
    await ctx.sleep(600)
    await ctx.page.keyboard.type('clear; pwd\n')
    await ctx.sleep(500)
    return ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] .xterm-rows`).innerText.trim().split('\n')[0], id)
  }
  const a = (await h.list(ctx)).tiles[0].id
  await ctx.page.keyboard.type('cd /tmp\n')
  await ctx.sleep(100) // well under the 2s cwd poll: the split must read it fresh
  await ctx.page.keyboard.press('Meta+d')
  await ctx.sleep(300)
  const b = (await h.list(ctx)).active
  h.assert(b !== a, 'split opened')
  const pb = await pwdOf(b)
  h.assert(pb.endsWith('/tmp'), `cmd+D starts in /tmp (got ${pb})`)

  await ctx.page.keyboard.type('cd /usr\n')
  await ctx.sleep(100)
  await h.spawnFromTemplate(ctx, b, 'b')
  await ctx.sleep(300)
  const c = (await h.list(ctx)).active
  const pc = await pwdOf(c)
  h.assert(pc === '/usr', `template dropped next to b starts in /usr (got ${pc})`)
}
