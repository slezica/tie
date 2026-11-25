// Junction dividers: a side bar ending against a shown top / bottom bar gets a 1 px divider across it (inset by --pad: 4 px in a narrow bar, the border colour: tiles, the templates divider), on the board edge's pixel row (a tile's border there); the end component clear of it by --slot-gap (2 px, bar background between); only where both bars show; at resized bars; dark and light (visible against the bar).
const E = () => ({ start: [], end: [] })
const layout = (patch) => ({ top: E(), bottom: E(), left: E(), right: E(), ...patch })
const PAD = 6
const NARROW_PAD = 4 // a narrow side bar's --pad
const GAP = 2 // --slot-gap: a side bar's item gap, also between a junction divider and the end component

export default async (ctx, h) => {
  const page = ctx.page
  const near = (a, b, what, d = 0.5) => h.assert(Math.abs(a - b) <= d, `${what}: ${a} vs ${b}`)
  // A side bar's two dividers as drawn (pseudo-elements: computed geometry), with the bar's box.
  const dividers = (bar) =>
    page.evaluate((bar) => {
      const el = document.getElementById(`bar-${bar}`)
      const one = (p) => {
        const cs = getComputedStyle(el, p)
        return { shown: !el.hidden && cs.display !== 'none', top: parseFloat(cs.top), bottom: parseFloat(cs.bottom), left: parseFloat(cs.left), right: parseFloat(cs.right), h: parseFloat(cs.height), color: cs.backgroundColor }
      }
      return { box: el.getBoundingClientRect().toJSON(), top: one('::before'), bottom: one('::after') }
    }, bar)
  // Pixel rows: the divider's row vs the bar's background `off` px off it (same x), and a tile's border on
  // that row (board side). Device pixels (TIE_SCALE); rows in CSS px.
  const contrast = async (x, y, off, what) => {
    const shot = h.pixels(await page.screenshot())
    const k = shot.w / (await page.evaluate(() => innerWidth))
    const at = (x, y) => shot.at(Math.round(x * k), Math.round(y * k))
    const d = (p, q) => Math.max(...p.map((v, i) => Math.abs(v - q[i])))
    const line = at(x, y + 0.25)
    const bg = at(x, y + off)
    h.assert(d(line, bg) >= 6, `${what}: divider visible against the bar (${line} vs ${bg})`)
  }

  // Top, bottom and left shown (right absent): the left bar has both dividers.
  await h.setBars(ctx, layout({ top: { start: ['tabs'], end: [] }, bottom: { start: [], end: ['templates'] }, left: { start: [], end: ['shelf'] } }))
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await h.setBars(ctx, layout({ top: { start: ['tabs'], end: [] }, bottom: { start: [], end: ['templates'] }, left: { start: [], end: ['shelf'] } }), { theme: 'solarized-light' })
    for (const [top, side] of [[40, 160], [60, 40], [50, 240]]) {
      await h.setBarSize(ctx, 'top', top)
      await h.setBarSize(ctx, 'bottom', top)
      await h.setBarSize(ctx, 'left', side)
      const what = `${theme} top/bottom ${top}, left ${side}`
      const { board } = await h.list(ctx)
      const d = await dividers('left')
      h.assert(d.top.shown && d.bottom.shown, `${what}: both dividers`)
      near(d.box.y + d.top.top, board.y, `${what}: top divider on the board's top edge row`)
      near(d.box.y + d.box.height - d.bottom.bottom - d.bottom.h, board.y + board.h - 1, `${what}: bottom divider on the board's bottom border row`)
      near(d.top.h, 1, `${what}: 1 px`)
      const pad = side < 100 ? NARROW_PAD : PAD
      near(d.top.left, pad, `${what}: inset at the window side`)
      near(d.top.right, pad, `${what}: inset at the board side`)
      const border = await page.$eval('.tile', (e) => getComputedStyle(e).borderTopColor) // --border (= --fg-c, the templates divider's)
      h.assert(d.top.color === border && d.bottom.color === border, `${what}: the border colour (${d.top.color}, ${border})`)
      // Against the bar's background in the gap beside the divider (the end component is GAP away).
      await contrast(d.box.x + d.box.width / 2, board.y, 1.5, `${what}: top`)
      await contrast(d.box.x + d.box.width / 2, board.y + board.h - 1, -1.5, `${what}: bottom`)
      // The shelf (the bar's end group) ends GAP above the bottom divider's row.
      const shelf = await page.$eval('#shelf', (e) => e.getBoundingClientRect().toJSON())
      near(board.y + board.h - 1 - shelf.bottom, GAP, `${what}: shelf clears the bottom divider by ${GAP} px`)
      await ctx.shot(`${theme}-${top}-${side}`)
    }
  }
  for (const b of ['top', 'bottom', 'left']) await h.setBarSize(ctx, b, null)

  // The shelf at the left bar's start: it clears the top divider by GAP; narrow and list.
  await h.setBars(ctx, layout({ top: { start: ['tabs'], end: [] }, bottom: { start: [], end: ['templates'] }, left: { start: ['shelf'], end: [] } }))
  for (const side of [40, 160]) {
    await h.setBarSize(ctx, 'left', side)
    const { board } = await h.list(ctx)
    const d = await dividers('left')
    const shelf = await page.$eval('#shelf', (e) => e.getBoundingClientRect().toJSON())
    near(d.box.y + d.top.top, board.y, `left ${side}, shelf first: top divider on the board's top edge row`)
    near(shelf.top - (board.y + 1), GAP, `left ${side}, shelf first: clears the top divider by ${GAP} px`)
  }
  await h.setBarSize(ctx, 'left', null)

  // Right bar with only a bottom bar: its bottom divider only; the left bar gone: nothing drawn.
  await h.setBars(ctx, layout({ bottom: { start: ['tabs'], end: [] }, right: { start: ['shelf', 'templates'], end: [] } }))
  let d = await dividers('right')
  h.assert(!d.top.shown && d.bottom.shown, `right + bottom: bottom divider only (${JSON.stringify(d)})`)
  d = await dividers('left')
  h.assert(!d.top.shown && !d.bottom.shown, 'left hidden: no divider')
  // Side bars alone: no junction, no divider.
  await h.setBars(ctx, layout({ left: { start: ['tabs'], end: [] }, right: { start: ['shelf', 'templates'], end: [] } }))
  for (const b of ['left', 'right']) {
    d = await dividers(b)
    h.assert(!d.top.shown && !d.bottom.shown, `${b} alone: no divider`)
  }
  await ctx.shot('sides-alone')
}
