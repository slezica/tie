// Ping: marks a tile (title dot, shelf badge, tab dot) without focus or layout change; clears on activation.
export default async (ctx, h) => {
  const L = () => h.list(ctx)
  const info = async (id) => (await L()).tiles.find((t) => t.id === id)
  const [a, b, c] = await h.threeWaySplit(ctx) // c active
  const s = (await ctx.tie('open', 'terminal', '--shelved')).id

  await ctx.tie('ping', c)
  h.assert(!(await info(c)).pinged, 'ping ignored on the tile in front of the user')
  await ctx.tie('ping', b)
  await ctx.tie('ping', s)
  let l = await L()
  h.assert(l.active === c, 'ping does not move focus')
  h.assert((await info(b)).pinged && (await info(s)).pinged, 'pinged')
  h.assert(await ctx.page.isVisible(`.tile[data-id="${b}"] .tile-dot`), 'title bar dot')
  const dotColor = (id) => ctx.page.evaluate((id) => getComputedStyle(document.querySelector(`.tile[data-id="${id}"] .tile-dot`)).backgroundColor, id)
  h.assert((await dotColor(b)) !== (await dotColor(c)), 'ping dot (yellow) differs from active dot (accent)')
  h.assert(!(await ctx.page.isVisible(`.tile[data-id="${a}"] .tile-dot`)), 'plain tile has no dot')
  h.assert(await ctx.page.isVisible(`.item[data-id="${s}"] .ping`), 'shelf badge')
  await ctx.shot('pinged')

  await h.press(ctx, 'Meta+t')
  await ctx.sleep(200)
  h.assert(await ctx.page.isVisible('.tab.pinged .tab-ping'), 'background tab shows ping')
  await ctx.shot('tab-dot')
  await h.press(ctx, 'Meta+1')
  await ctx.sleep(200)
  h.assert(!(await ctx.page.isVisible('.tab.pinged')), 'current tab has no tab dot')
  h.assert((await info(b)).pinged, 'switching tabs does not clear non-active tiles')

  await h.press(ctx, 'Meta+ArrowUp') // c -> b
  await ctx.sleep(200)
  h.assert((await L()).active === b && !(await info(b)).pinged, 'activation clears')
  await h.pin(ctx, s)
  h.assert(!(await info(s)).pinged, 'pinning a shelved tile clears')

  await ctx.tie('ping', a)
  await ctx.tie('ping', a, '--clear')
  h.assert(!(await info(a)).pinged, '--clear')
}
