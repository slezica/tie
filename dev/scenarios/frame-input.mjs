// Content frames and the pointer: a click inside activates the tile; drags across a frame (tiles,
// tabs) keep working. Hidden window: offscreen rendering never routes input into frames.
export const hiddenWindow = true

export default async (ctx, h) => {
  const page = ctx.page
  const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
  const p = (await ctx.tie('add', 'probe', '--at', a, '--side', 'r')).id
  const pf = await h.probeFrame(ctx, p)
  h.assert(pf && (await pf.evaluate(() => window.probe.inits)) === 1, 'probe frame up, one handshake')

  // Click inside the frame: the UI sees no pointerdown, yet the tile activates.
  await ctx.tie('focus', '--tile', a)
  await h.waitActive(ctx, a)
  const pr = await h.rectOf(ctx, p)
  await page.mouse.click(pr.x + pr.w / 2, pr.y + pr.h / 2)
  await h.eventually(ctx, async () => h.assert((await h.list(ctx)).active === p, `click in frame activates its tile (active ${(await h.list(ctx)).active})`))

  // Tile drag whose path crosses the frame: lands where released.
  const c = (await ctx.tie('add', 'terminal', '--at', a, '--side', 'b')).id
  await h.waitTile(ctx, c, (t) => t.rect)
  await h.drag(ctx, await h.titlePoint(ctx, c), await h.sidePoint(ctx, p, 'r'), { steps: 20 })
  const tree = (await ctx.tie('state')).tree
  h.assert(JSON.stringify(tree.children.map((n) => n.id)) === JSON.stringify([a, p, c]), `drag across frame lands right of it: ${JSON.stringify(tree)}`)

  // Tab drag that wanders over the frame and ends there: still reorders, still ends.
  await page.click('#tab-add')
  const before = (await h.waitFor(ctx, async () => { const l = await h.list(ctx); return l.tabs.length === 2 && l }, 'second tab')).tabs.map((t) => t.id)
  await page.click(`.tab[data-space="${before[0]}"]`)
  await h.waitFor(ctx, async () => (await h.list(ctx)).tab === before[0], 'back on tab 1')
  await h.settle(ctx)
  const t0 = await h.boxOf(ctx, `.tab[data-space="${before[0]}"]`)
  const inFrame = await h.sidePoint(ctx, p, 'c')
  const m = page.mouse
  await m.move(t0.x, t0.y)
  await m.down()
  await m.move(t0.x + 6, t0.y, { steps: 3 })
  await m.move(t0.x + 6, inFrame.y, { steps: 8 })
  await m.move(inFrame.x, inFrame.y, { steps: 12 }) // past tab 2's x, ending over the frame
  await m.up()
  await h.eventually(ctx, async () => {
    const after = (await h.list(ctx)).tabs.map((t) => t.id)
    h.assert(after[0] === before[1] && after[1] === before[0], `tab reordered across the frame: ${before} -> ${after}`)
    h.assert(!(await page.evaluate(() => document.body.classList.contains('dragging-tab'))), 'tab drag ended')
  })
}
