// Board edge on a bare board (no slotted tile): the bars' edges drawn as a tile's border draws them (#board-edge): only the sides with a shown bar, on the board's edge pixels, the same pixels as a tile's border there (dark and light); none while a tile is slotted (no double line), zoom included; kept under floats and a zoomed float; every bar combination; level with the junction dividers.
const E = () => ({ start: [], end: [] })
const layout = (patch) => ({ top: E(), bottom: E(), left: E(), right: E(), ...patch })

export default async (ctx, h) => {
  const page = ctx.page
  const L = () => h.list(ctx)
  const near = (a, b, what, d = 0.5) => h.assert(Math.abs(a - b) <= d, `${what}: ${a} vs ${b}`)
  const edge = () =>
    page.evaluate(() => {
      const el = document.getElementById('board-edge')
      const cs = getComputedStyle(el)
      const w = (p) => {
        const s = getComputedStyle(el, p)
        return { top: parseFloat(s.borderTopWidth), bottom: parseFloat(s.borderBottomWidth), left: parseFloat(s.borderLeftWidth), right: parseFloat(s.borderRightWidth) }
      }
      return { shown: cs.display !== 'none', r: el.getBoundingClientRect().toJSON(), under: w('::before'), over: w('::after'), bars: ['top', 'bottom', 'left', 'right'].filter((b) => document.documentElement.classList.contains(`has-${b}`)) }
    })
  const closeAll = async () => {
    for (const t of (await L()).tiles) await ctx.tie('close', '--tile', t.id)
    await h.waitFor(ctx, async () => !(await L()).tiles.length, 'no tiles')
    await h.settle(ctx)
  }
  const slotted = async () => {
    const id = (await ctx.tie('add', 'terminal')).id
    await h.waitTile(ctx, id)
    await h.settle(ctx)
    return id
  }
  // Pixels on the board's edges (device pixels, TIE_SCALE): for each side, the edge's pixel (board
  // side: a tile's border row / column) and one 3 px inside the board.
  const edgePixels = async () => {
    const { board: b } = await L()
    const shot = h.pixels(await page.screenshot())
    const k = shot.w / (await page.evaluate(() => innerWidth))
    const at = (x, y) => shot.at(Math.floor(x * k), Math.floor(y * k))
    const mx = b.x + b.w / 3
    const my = b.y + b.h / 3
    return {
      top: [at(mx, b.y + 0.25), at(mx, b.y + 3.25)],
      bottom: [at(mx, b.y + b.h - 0.75), at(mx, b.y + b.h - 3.75)],
      left: [at(b.x + 0.25, my), at(b.x + 3.25, my)],
      right: [at(b.x + b.w - 0.75, my), at(b.x + b.w - 3.75, my)],
    }
  }
  const diff = (p, q) => Math.max(...p.map((v, i) => Math.abs(v - q[i])))

  // Every combination of shown bars: the edge's box is the board, its lines only on the bars' sides.
  const combos = [
    layout({ bottom: { start: ['tabs'], end: ['shelf', 'templates'] } }),
    layout({ top: { start: ['tabs', 'shelf', 'templates'], end: [] } }),
    layout({ left: { start: ['tabs'], end: [] }, bottom: { start: [], end: ['shelf', 'templates'] } }),
    layout({ right: { start: ['tabs'], end: [] }, top: { start: ['shelf', 'templates'], end: [] } }),
    layout({ left: { start: ['tabs'], end: [] }, right: { start: ['shelf', 'templates'], end: [] } }),
    layout({ top: { start: ['tabs'], end: [] }, left: { start: [], end: ['shelf'] }, right: { start: ['templates'], end: [] } }),
    layout({ bottom: { start: ['tabs'], end: [] }, left: { start: [], end: ['shelf'] }, right: { start: ['templates'], end: [] } }),
    layout({ top: { start: ['tabs'], end: [] }, bottom: { start: [], end: ['templates'] }, left: { start: [], end: ['shelf'] } }),
  ]
  h.assert(!(await edge()).shown, 'a slotted tile: no board edge (its border draws it)')
  await closeAll()
  for (const bars of combos) {
    await h.setBars(ctx, bars)
    const e = await edge()
    const { board } = await L()
    const what = `bars ${e.bars.join('+')}`
    h.assert(e.shown, `${what}: board edge shown`)
    for (const k of ['x', 'y', 'width', 'height']) near(e.r[k], { x: board.x, y: board.y, width: board.w, height: board.h }[k], `${what}: edge box = board ${k}`)
    for (const side of ['top', 'bottom', 'left', 'right']) {
      const want = e.bars.includes(side) ? 1 : 0
      h.assert(e.under[side] === want && e.over[side] === want, `${what}: ${side} line ${want ? 'drawn' : 'none'} (${e.under[side]}, ${e.over[side]})`)
    }
    // Level with the junction dividers (a side bar's divider on the board's top / bottom row).
    for (const side of ['left', 'right'].filter((s) => e.bars.includes(s))) {
      const d = await page.evaluate((side) => {
        const el = document.getElementById(`bar-${side}`)
        const r = el.getBoundingClientRect()
        const b = getComputedStyle(el, '::before')
        const a = getComputedStyle(el, '::after')
        return { top: b.display !== 'none' ? r.top + parseFloat(b.top) : null, bottom: a.display !== 'none' ? r.bottom - parseFloat(a.bottom) - 1 : null }
      }, side)
      if (e.bars.includes('top')) near(d.top, board.y, `${what}: ${side} junction on the edge's top row`)
      if (e.bars.includes('bottom')) near(d.bottom, board.y + board.h - 1, `${what}: ${side} junction on the edge's bottom row`)
    }
  }
  await ctx.shot('bare-bottom-left-right')
  await h.setBars(ctx, combos[5])
  await ctx.shot('bare-top-left-right')

  // Pixels: the bare board's edge lines = a slotted tile's border there; sides without a bar: nothing
  // drawn (as the board inside). Dark and light.
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await h.setBars(ctx, combos[5], { theme: 'solarized-light' })
    const bare = await edgePixels()
    const t = await slotted()
    h.assert(!(await edge()).shown, `${theme}: tile slotted: no board edge`)
    const tiled = await edgePixels()
    for (const side of ['top', 'left', 'right']) {
      h.assert(diff(bare[side][0], tiled[side][0]) <= 2, `${theme}: ${side}: bare edge pixel = tile border pixel (${bare[side][0]} vs ${tiled[side][0]})`)
      h.assert(diff(bare[side][0], bare[side][1]) >= 6, `${theme}: ${side}: edge visible on the bare board (${bare[side][0]} vs ${bare[side][1]})`)
    }
    h.assert(diff(bare.bottom[0], bare.bottom[1]) <= 1, `${theme}: bottom (no bar): no line (${bare.bottom})`)
    await ctx.tie('close', '--tile', t)
    await h.waitGone(ctx, t)
    await h.settle(ctx)
  }

  // Floats only: the edge stays (under the float); a zoomed float covers it.
  const f = (await ctx.tie('add', 'terminal', '--float')).id
  await h.waitTile(ctx, f)
  await h.settle(ctx)
  let e = await edge()
  h.assert(e.shown, 'floats only: board edge shown')
  const fr = await h.rectOf(ctx, f)
  const top = (x, y) => page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.tile')?.dataset.id ?? document.elementFromPoint(x, y)?.id, [x, y])
  h.assert((await top(fr.x + fr.w / 2, fr.y + fr.h / 2)) === f, 'floats only: the float above the edge')
  await h.clickButton(ctx, f, 'zoom')
  await h.waitTile(ctx, f, (t) => t.zoomed, 'float zoomed')
  await h.settle(ctx)
  e = await edge()
  h.assert(e.shown && (await top(e.r.x + 3, e.r.y + 3)) === f, 'zoomed float: covers the edge (past the bar edge strips, 2 px over the board)')
  await ctx.shot('zoomed-float')
  await h.clickButton(ctx, f, 'zoom')
  await h.waitTile(ctx, f, (t) => !t.zoomed, 'float unzoomed')
  // A slotted tile, zoomed: no edge.
  const s = await slotted()
  h.assert(!(await edge()).shown, 'slotted + float: no board edge')
  await h.clickButton(ctx, s, 'zoom')
  await h.waitTile(ctx, s, (t) => t.zoomed, 'slotted zoomed')
  await h.settle(ctx)
  h.assert(!(await edge()).shown, 'slotted zoom: no board edge')
}
