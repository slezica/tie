// Terminal grid fully visible: last column and last row not cut, across tile sizes (TERMINALS.md "Size").
export default async (ctx, h) => {
  const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
  const p = await h.titlePoint(ctx, a)
  await ctx.page.mouse.click(p.x, p.y + 100)
  // Lines of exactly `cols` characters: at narrower sizes they reflow into full rows.
  await ctx.page.keyboard.type("clear; for i in 1 2 3; do printf '%*s' $(tput cols) '' | tr ' ' '#'; done; sleep 60\n")
  await h.waitFor(ctx, async () => (await h.termFit(ctx, a)).full.length >= 3, 'full-width rows printed (shell ready)', 8000)
  const wide = await h.waitTermFit(ctx, a, 'slotted')
  h.assert(wide.full.length >= 3, `full-width rows printed: ${JSON.stringify(wide)}`)
  // Glyphs on the cell grid: a full row's text spans exactly its row.
  for (const r of wide.full) h.assert(Math.abs(r.text - r.row) <= 0.25, `full row text ${r.text} px != row ${r.row} px`)
  await ctx.shot('slotted')
  // Float, then sweep sizes through every remainder of the cell height (17 px at defaults).
  await ctx.tie('move', a, '--float')
  await h.waitTermFit(ctx, a, 'float')
  for (let d = 0; d < 20; d++) {
    await ctx.page.evaluate(([id, d]) => {
      const el = document.querySelector(`.tile[data-id="${id}"]`)
      el.style.width = `${400 + d * 3}px`
      el.style.height = `${300 + d}px`
    }, [a, d])
    await h.waitTermFit(ctx, a, `float +${d}`)
  }
  await h.assertPtySizes(ctx)
  await ctx.shot('float')
}
