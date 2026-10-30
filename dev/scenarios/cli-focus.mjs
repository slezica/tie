// CLI add/move never take the user's input unless --focus (an agent showing something must not
// redirect typing). Empty board: the new tile activates (nothing to take input from).
export default async (ctx, h) => {
  const active = async () => (await h.list(ctx)).active
  const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
  h.assert((await active()) === a, 'start: first tile active')

  const b = (await ctx.tie('add', 'terminal')).id
  await h.waitShell(ctx, b) // its start can't take the input either
  h.assert((await active()) === a, `add: input stays on ${a} (active ${await active()})`)
  await ctx.tie('move', b, '--float')
  await h.settle(ctx)
  h.assert((await active()) === a, 'move: input stays')

  const c = (await ctx.tie('add', 'terminal', '--focus')).id
  await h.waitShell(ctx, c)
  await h.eventually(ctx, async () => h.assert((await active()) === c, 'add --focus: new tile takes input'))
  await ctx.tie('move', b, '--at', a, '--side', 'r', '--focus')
  await h.eventually(ctx, async () => h.assert((await active()) === b, 'move --focus: moved tile takes input'))

  // Empty board (new tab): the opened tile activates.
  for (const id of [a, b, c]) await ctx.tie('close', id)
  await h.waitFor(ctx, async () => !(await h.list(ctx)).tiles.length, 'board empty')
  const d = (await ctx.tie('add', 'terminal')).id
  await h.eventually(ctx, async () => h.assert((await active()) === d, 'empty board: new tile active'))
}
