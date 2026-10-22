// Drag shared border to resize neighbors; tree changes mid-drag are not overwritten.
export default async (ctx, h) => {
  const [a, b, c] = await h.threeWaySplit(ctx)
  const ra = await h.rectOf(ctx, a)
  const x = ra.x + ra.w + 3
  await h.drag(ctx, { x, y: ra.y + 300 }, { x: x - 200, y: ra.y + 300 })
  const ra2 = await h.rectOf(ctx, a)
  h.assert(Math.abs(ra2.w - (ra.w - 200)) < 3, `a shrank by 200 (${ra.w} -> ${ra2.w})`)
  await ctx.shot('resized')

  // Mid-drag change (CLI close/open, new tab): the drag must not write back its stale tree.
  const m = ctx.page.mouse
  const midDrag = async (change) => {
    const br = await ctx.page.locator('#borders .border.row').first().boundingBox()
    const y = br.y + br.height / 2
    await m.move(br.x + br.width / 2, y)
    await m.down()
    await m.move(br.x - 30, y, { steps: 4 })
    await change()
    await ctx.sleep(200)
    await m.move(br.x - 60, y, { steps: 4 })
    await m.up()
    await ctx.sleep(200)
  }
  const leaves = (n) => (!n ? [] : n.type === 'leaf' ? [n.id] : n.children.flatMap(leaves))

  await midDrag(() => ctx.tie('close', c))
  let s = await ctx.tie('state')
  h.assert(!leaves(s.tree).includes(c), `closed tile gone from tree: ${leaves(s.tree)}`)
  await ctx.tie('focus', a) // throws if render is wedged

  let d
  await midDrag(async () => (d = (await ctx.tie('open', 'terminal', '--at', b, '--side', 'b')).id))
  s = await ctx.tie('state')
  h.assert(leaves(s.tree).includes(d), `opened tile kept in tree: ${leaves(s.tree)}`)

  await midDrag(() => h.press(ctx, 'Meta+t'))
  const l = await h.list(ctx)
  const fresh = l.tiles.filter((t) => t.tab === l.tabs[1].id)
  h.assert(l.tabs.length === 2 && fresh.length === 1 && fresh[0].kind === 'terminal', 'tiles stay in tab 1; new tab has only its terminal')
  const tree = (await ctx.tie('state')).tree
  h.assert(tree?.type === 'leaf' && tree.id === fresh[0].id, `new tab board: just its terminal: ${JSON.stringify(tree)}`)
}
