// Junction dividers: a side bar ending against a shown top / bottom bar gets a 1 px divider across it (inset by --pad, the border colour: tiles, the templates divider), on the board edge's pixel row (a tile's border there); only where both bars show; at resized bars; dark and light (visible against the bar).
const E = () => ({ start: [], end: [] })
const layout = (patch) => ({ top: E(), bottom: E(), left: E(), right: E(), ...patch })
const PAD = 6

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
  // Pixel rows: the divider's row vs the bar's background 3 px off it (same x), and a tile's border on
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
    for (const [top, side] of [[40, 160], [60, 48], [32, 240]]) {
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
      near(d.top.left, PAD, `${what}: inset at the window side`)
      near(d.top.right, PAD, `${what}: inset at the board side`)
      const border = await page.$eval('.tile', (e) => getComputedStyle(e).borderTopColor) // --border (= --fg-c, the templates divider's)
      h.assert(d.top.color === border && d.bottom.color === border, `${what}: the border colour (${d.top.color}, ${border})`)
      await contrast(d.box.x + d.box.width / 2, board.y, 3, `${what}: top`)
      await contrast(d.box.x + d.box.width / 2, board.y + board.h - 1, -3, `${what}: bottom`)
      await ctx.shot(`${theme}-${top}-${side}`)
    }
  }
  for (const b of ['top', 'bottom', 'left']) await h.setBarSize(ctx, b, null)

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
