// Security: socket callers in a Tie terminal are identified by kernel lineage (peer pid → ancestors
// → the tile's pty), never by TIE_TILE / params.caller. A spoofed TIE_TILE acts as the real tile and
// is logged. (Uid mismatch → refused: not testable here, the harness runs as the same user.)
export default async (ctx, h) => {
  const a = (await h.list(ctx)).tiles[0].id
  const b = (await ctx.tie('add', 'terminal')).id
  const c = (await ctx.tie('add', 'terminal')).id
  await h.waitShell(ctx, b)
  await h.waitShell(ctx, c)

  // Typed in a (active); runs after focus moved to c (pinging the tile in front does nothing).
  await ctx.page.keyboard.type(`sleep 1.5; TIE_TILE=${b} tie ping; echo pinged-$?\n`)
  await ctx.tie('focus', c)
  await h.waitFor(ctx, async () => (await h.screen(ctx, a)).includes('pinged-0'), 'tie ping ran in a', 6000)
  const tiles = (await h.list(ctx)).tiles
  const pinged = (id) => tiles.find((t) => t.id === id).pinged
  h.assert(pinged(a), 'ping landed on the real caller (a)')
  h.assert(!pinged(b), 'not on the spoofed tile (b)')
  h.assert(/\[security\] caller spoof/.test(ctx.appLog()), 'spoof logged')
  h.assert(new RegExp(`\\[rpc\\] connection \\d+ \\{"kind":"tile","tile":"${a}"\\}`).test(ctx.appLog()), 'connection resolved to a')

  // An explicit id still targets that tile (the caller only fills defaults). Typed in c (active now).
  await ctx.page.keyboard.type(`tie title ${b} named-from-c\n`)
  await h.waitFor(ctx, async () => (await h.tileOf(ctx, b)).title === 'named-from-c', 'explicit id', 4000)
}
