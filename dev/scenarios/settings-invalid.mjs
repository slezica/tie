// Out-of-range or wrongly typed values in the settings file are sanitized at load.
export const settings = { shell: 5, fontSize: 200, lineHeight: 9, cellWidth: 'wide', theme: 7 }

export default async (ctx, h) => {
  // Each field on its own: out of range → clamped, wrong type → default.
  const s = (await ctx.page.evaluate(() => window.tie.settings.get())).settings
  const want = { shell: '', fontSize: 32, lineHeight: 2, cellWidth: 100, theme: 'tie-dark' }
  for (const [k, v] of Object.entries(want)) h.assert(s[k] === v, `${k} sanitized to ${JSON.stringify(v)}: ${JSON.stringify(s[k])}`)
  // Applied as sanitized.
  h.assert((await h.cssVar(ctx, '--tile-font-size')) === '32px', `font size clamped: ${await h.cssVar(ctx, '--tile-font-size')}`)
  h.assert((await h.cssVar(ctx, '--tile-line-height')) === '2', `line height clamped: ${await h.cssVar(ctx, '--tile-line-height')}`)
  h.assert((await h.cssVar(ctx, '--bg')) === '#22252c', `theme: Tie Dark default: ${await h.cssVar(ctx, '--bg')}`)
  // The terminal starts (shell '' → the login shell) with a consistent grid.
  await h.eventually(ctx, async () => {
    const t = (await h.list(ctx)).tiles[0]
    h.assert(t.term.pty && !t.error, `terminal started: ${JSON.stringify(t)}`)
  })
  await h.assertPtySizes(ctx)
}
