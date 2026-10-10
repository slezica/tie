// Shell exit closes tile; --cmd tile stays with exit status; focus doesn't shift content; login shell used.
export default async (ctx, h) => {
  const [a, b] = await h.threeWaySplit(ctx)
  const bodyRect = (id) => ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] .body`).getBoundingClientRect().toJSON(), id)
  const before = await bodyRect(a)
  const p = await h.titlePoint(ctx, a)
  await ctx.page.mouse.click(p.x, p.y)
  await ctx.sleep(100)
  const after = await bodyRect(a)
  h.assert(JSON.stringify(before) === JSON.stringify(after), `content fixed on focus ${JSON.stringify(before)} vs ${JSON.stringify(after)}`)
  await ctx.shot('active-line')
  // Login shell: ignore $SHELL of the launcher.
  const s = await ctx.tie('open', 'terminal', '--cmd', 'echo "shell=$0"; sleep 30')
  await ctx.sleep(800)
  const text = await ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] .xterm-rows`).innerText, s.id)
  ctx.log(text.trim().split('\n')[0])
  await ctx.tie('close', s.id)
  // Typing exit closes a shell tile.
  await ctx.page.mouse.click(p.x, p.y + 100)
  await ctx.page.keyboard.type('exit\n')
  await ctx.sleep(800)
  h.assert(!(await h.list(ctx)).tiles.some((t) => t.id === a), 'shell tile closed on exit')
  // --cmd tile stays.
  const c = await ctx.tie('open', 'terminal', '--cmd', 'exit 3')
  await ctx.sleep(800)
  const t = (await h.list(ctx)).tiles.find((t) => t.id === c.id)
  h.assert(t && t.exit === 3, 'cmd tile stays with exit code')
  await ctx.shot('after')
}
