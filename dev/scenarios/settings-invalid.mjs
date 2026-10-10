// Out-of-range or wrongly typed values in the settings file are sanitized at load.
export const settings = { shell: 5, fontSize: 200, lineHeight: 9, cellWidth: 'wide', theme: 7 }

export default async (ctx, h) => {
  await ctx.sleep(500)
  const t = (await h.list(ctx)).tiles[0]
  h.assert(t.term.pty && !t.error, `terminal started: ${JSON.stringify(t)}`)
  h.assert(t.term.rows > 10, `usable grid: ${t.term.cols}x${t.term.rows}`)
  const size = await ctx.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tile-font-size').trim())
  h.assert(size === '32px', `font size clamped: ${size}`)
}
