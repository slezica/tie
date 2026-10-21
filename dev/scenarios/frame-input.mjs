// Content frames and the pointer: a click inside activates the tile; drags across a frame (tiles,
// tabs) keep working. Hidden window: offscreen rendering never routes input into frames.
export const hiddenWindow = true

export default async (ctx, h) => {
  const page = ctx.page
  const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
  const p = (await ctx.tie('open', 'probe', '--at', a, '--side', 'r')).id
  await ctx.sleep(1000)
  const pf = page.frames().find((f) => f.url().startsWith('tie-content://'))
  h.assert(pf && (await pf.evaluate(() => window.probe.inits)) === 1, 'probe frame up, one handshake')

  // Click inside the frame: the UI sees no pointerdown, yet the tile activates.
  await ctx.tie('focus', a)
  await ctx.sleep(200)
  const pr = await h.rectOf(ctx, p)
  await page.mouse.click(pr.x + pr.w / 2, pr.y + pr.h / 2)
  await ctx.sleep(300)
  h.assert((await h.list(ctx)).active === p, `click in frame activates its tile (active ${(await h.list(ctx)).active})`)

  // Tile drag whose path crosses the frame: lands where released.
  const c = (await ctx.tie('open', 'terminal', '--at', a, '--side', 'b')).id
  await ctx.sleep(400)
  await h.drag(ctx, await h.titlePoint(ctx, c), await h.sidePoint(ctx, p, 'r'), { steps: 20 })
  const tree = (await ctx.tie('state')).tree
  h.assert(JSON.stringify(tree.children.map((n) => n.id)) === JSON.stringify([a, p, c]), `drag across frame lands right of it: ${JSON.stringify(tree)}`)

  // Tab drag that wanders over the frame and ends there: still reorders, still ends.
  await page.click('#tab-add')
  await ctx.sleep(200)
  const before = (await h.list(ctx)).tabs.map((t) => t.id)
  await page.click(`.tab[data-space="${before[0]}"]`)
  await ctx.sleep(300)
  const t0 = await h.boxOf(ctx, `.tab[data-space="${before[0]}"]`)
  const inFrame = await h.sidePoint(ctx, p, 'c')
  const m = page.mouse
  await m.move(t0.x, t0.y)
  await m.down()
  await m.move(t0.x + 6, t0.y, { steps: 3 })
  await m.move(t0.x + 6, inFrame.y, { steps: 8 })
  await m.move(inFrame.x, inFrame.y, { steps: 12 }) // past tab 2's x, ending over the frame
  await m.up()
  await ctx.sleep(300)
  const after = (await h.list(ctx)).tabs.map((t) => t.id)
  h.assert(after[0] === before[1] && after[1] === before[0], `tab reordered across the frame: ${before} -> ${after}`)
  h.assert(!(await page.evaluate(() => document.body.classList.contains('dragging-tab'))), 'tab drag ended')
}
