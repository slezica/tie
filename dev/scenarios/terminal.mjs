// Shell exit closes tile; --cmd tile stays with exit status; focus doesn't shift content; login shell used.
export const settings = { shell: '' } // the default (login shell), not the harness's bare bash
export default async (ctx, h) => {
  const [a, b] = await h.threeWaySplit(ctx)
  const bodyRect = (id) => ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] .body`).getBoundingClientRect().toJSON(), id)
  const before = await bodyRect(a)
  const p = await h.titlePoint(ctx, a)
  await ctx.page.mouse.click(p.x, p.y)
  await h.settle(ctx) // the focus change rendered
  const after = await bodyRect(a)
  h.assert(JSON.stringify(before) === JSON.stringify(after), `content fixed on focus ${JSON.stringify(before)} vs ${JSON.stringify(after)}`)
  await ctx.shot('active-line')
  // Login shell: ignore $SHELL of the launcher.
  const s = await ctx.tie('add', 'terminal', '--cmd', 'echo "shell=$0"; sleep 30')
  await h.waitText(ctx, s.id, 'shell=', 8000) // login shell: profile first
  const text = await ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] .xterm-rows`).innerText, s.id)
  ctx.log(text.trim().split('\n')[0])
  await ctx.tie('close', '--tile', s.id)
  // Typing exit closes a shell tile.
  await ctx.page.mouse.click(p.x, p.y + 100)
  await ctx.page.keyboard.type('exit\n')
  await h.eventually(ctx, async () => h.assert(!(await h.list(ctx)).tiles.some((t) => t.id === a), 'shell tile closed on exit'))
  // --cmd tile stays.
  const c = await ctx.tie('add', 'terminal', '--cmd', 'exit 3')
  const t = await h.waitFor(ctx, async () => (await h.list(ctx)).tiles.find((t) => t.id === c.id && t.exit !== null), 'cmd tile exited (login shell start)', 8000)
  h.assert(t && t.exit === 3, 'cmd tile stays with exit code')
  // Sizes stay in sync through template spawn, moves, float, shelve, settings change.
  await h.spawnFromTemplate(ctx, b, 'b')
  await h.eventually(ctx, () => h.assertPtySizes(ctx), 8000) // new login shell's pty
  const [x] = (await h.list(ctx)).tiles.map((t) => t.id)
  await ctx.tie('move', '--tile', x, '--float')
  await ctx.tie('move', '--tile', b, '--shelve')
  await h.eventually(ctx, () => h.assertPtySizes(ctx))

  await ctx.shot('after')
}
