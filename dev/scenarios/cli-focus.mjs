// CLI open/move never take the user's input unless --focus (an agent showing something must not
// redirect typing). Empty board: the new tile activates (nothing to take input from).
export default async (ctx, h) => {
  const active = async () => (await h.list(ctx)).active
  const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
  h.assert((await active()) === a, 'start: first tile active')

  const b = (await ctx.tie('open', 'terminal')).id
  await ctx.sleep(300)
  h.assert((await active()) === a, `open: input stays on ${a} (active ${await active()})`)
  await ctx.tie('move', b, '--float')
  await ctx.sleep(200)
  h.assert((await active()) === a, 'move: input stays')

  const c = (await ctx.tie('open', 'terminal', '--focus')).id
  await ctx.sleep(300)
  h.assert((await active()) === c, 'open --focus: new tile takes input')
  await ctx.tie('move', b, '--at', a, '--side', 'r', '--focus')
  await ctx.sleep(200)
  h.assert((await active()) === b, 'move --focus: moved tile takes input')

  // Empty board (new tab): the opened tile activates.
  for (const id of [a, b, c]) await ctx.tie('close', id)
  await ctx.sleep(300)
  const d = (await ctx.tie('open', 'terminal')).id
  await ctx.sleep(300)
  h.assert((await active()) === d, 'empty board: new tile active')
}
