// Ping: marks a tile (title-bar icon glow, shelf badge, tab dot) without focus or layout change; clears on activation.
export default async (ctx, h) => {
  const L = () => h.list(ctx)
  const info = async (id) => (await L()).tiles.find((t) => t.id === id)
  const [a, b, c] = await h.threeWaySplit(ctx) // c active
  const s = (await ctx.tie('add', 'terminal', '--shelved')).id

  await ctx.tie('ping', '--tile', c)
  h.assert(!(await info(c)).pinged, 'ping ignored on the tile in front of the user')
  await ctx.tie('ping', '--tile', b)
  await ctx.tie('ping', '--tile', s)
  let l = await L()
  h.assert(l.active === c, 'ping does not move focus')
  h.assert((await info(b)).pinged && (await info(s)).pinged, 'pinged')
  // Title bar: glow on the icon (yellow ping, accent active), no extra element: title text never moves.
  const icon = (id) =>
    ctx.page.evaluate((id) => {
      const t = document.querySelector(`.tile[data-id="${id}"]`)
      return { color: getComputedStyle(t.querySelector('.glyph')).color, filter: getComputedStyle(t.querySelector('.titlebar .icon')).filter, x: t.querySelector('.title').getBoundingClientRect().left - t.getBoundingClientRect().left }
    }, id)
  const [ia, ib, ic] = [await icon(a), await icon(b), await icon(c)]
  h.assert(ib.filter !== 'none' && ic.filter !== 'none', `pinged and active icons glow: ${ib.filter} / ${ic.filter}`)
  h.assert(ib.color !== ic.color, 'ping glow (yellow) differs from active glow (accent)')
  h.assert(ia.filter === 'none' && ia.color !== ib.color, 'plain tile icon has no glow')
  h.assert(ia.x === ib.x && ib.x === ic.x, `title text aligned: ${ia.x} ${ib.x} ${ic.x}`)
  h.assert(await ctx.page.isVisible(`.item[data-id="${s}"] .ping`), 'shelf badge')
  await ctx.shot('pinged')

  await h.press(ctx, 'Meta+t')
  await h.eventually(ctx, async () => h.assert(await ctx.page.isVisible('.tab.pinged .tab-ping'), 'background tab shows ping'))
  await ctx.shot('tab-dot')
  await h.press(ctx, 'Meta+1')
  await h.eventually(ctx, async () => h.assert((await L()).tab === l.tab && !(await ctx.page.isVisible('.tab.pinged')), 'current tab has no tab dot'))
  h.assert((await info(b)).pinged, 'switching tabs does not clear non-active tiles')

  await h.press(ctx, 'Meta+ArrowUp') // c -> b
  await h.eventually(ctx, async () => h.assert((await L()).active === b && !(await info(b)).pinged, 'activation clears'))
  await h.pin(ctx, s)
  h.assert(!(await info(s)).pinged, 'pinning a shelved tile clears')

  await ctx.tie('ping', '--tile', a)
  await ctx.tie('ping', '--tile', a, '--clear')
  h.assert(!(await info(a)).pinged, '--clear')
}
