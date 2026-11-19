// Shell exit closes tile; --cmd tile stays with exit status and marks; focus doesn't shift content; env given to terminals.
import { join } from 'node:path'
import { ROOT } from '../lib.mjs'

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

  // Environment (TERMINALS.md "Spawn"): terminal type, tile id, socket, instance, bin/ first on PATH.
  const e = await ctx.tie('add', 'terminal', '--cmd', 'echo "env:$TERM|$COLORTERM|$TERM_PROGRAM|$TIE_TILE|$TIE_INSTANCE|$TIE_SOCKET|${PATH%%:*}|$(command -v tie):end"; sleep 30')
  const line = (await h.waitText(ctx, e.id, /env:.*:end/)).match(/env:(.*):end/)[1].split('|')
  const want = ['xterm-256color', 'truecolor', 'tie', e.id, ctx.instance]
  h.assert(want.every((w, i) => line[i] === w), `env: ${line} (want ${want})`)
  h.assert(line[5].endsWith(`/${ctx.instance}.sock`), `TIE_SOCKET: ${line[5]}`)
  h.assert(line[6] === join(ROOT, 'bin') && line[7] === join(ROOT, 'bin/tie'), `bin/ first on PATH: ${line[6]}, tie = ${line[7]}`)
  await ctx.tie('close', '--tile', e.id)

  // Typing exit closes a shell tile.
  await ctx.page.mouse.click(p.x, p.y + 100)
  await ctx.page.keyboard.type('exit\n')
  await h.eventually(ctx, async () => h.assert(!(await h.list(ctx)).tiles.some((t) => t.id === a), 'shell tile closed on exit'))
  // --cmd tile stays: exit code, `[process exited …]` line, title mark (✗ N / ✓).
  const c = await ctx.tie('add', 'terminal', '--cmd', 'exit 3')
  const t = await h.waitFor(ctx, async () => (await h.list(ctx)).tiles.find((t) => t.id === c.id && t.exit !== null), 'cmd tile exited')
  h.assert(t && t.exit === 3, 'cmd tile stays with exit code')
  await h.waitText(ctx, c.id, '[process exited with code 3]')
  const mark = (id) => ctx.page.$eval(`.tile[data-id="${id}"] .titlebar .status`, (e) => e.textContent)
  h.assert((await mark(c.id)) === '✗ 3', `failure mark: ${await mark(c.id)}`)
  const ok = (await ctx.tie('add', 'terminal', '--cmd', 'true')).id
  await h.waitTile(ctx, ok, (t) => t.exit === 0, 'true exited 0')
  await h.waitText(ctx, ok, '[process exited with code 0]')
  h.assert((await mark(ok)) === '✓', `success mark: ${await mark(ok)}`)
  // Shelved: the shelf item carries the mark.
  await ctx.tie('move', '--tile', c.id, '--shelve')
  const shelfMark = () => ctx.page.$eval(`.item[data-id="${c.id}"] .exit`, (e) => ({ text: e.textContent, fail: e.classList.contains('fail') }))
  await h.eventually(ctx, async () => h.assert(JSON.stringify(await shelfMark()) === '{"text":"✗","fail":true}', `shelf mark: ${JSON.stringify(await shelfMark())}`))
  await ctx.tie('close', '--tile', ok)
  // Sizes stay in sync through template spawn, moves, float, shelve.
  await h.spawnFromTemplate(ctx, b, 'b')
  await h.eventually(ctx, () => h.assertPtySizes(ctx))
  const [x] = (await h.list(ctx)).tiles.map((t) => t.id)
  await ctx.tie('move', '--tile', x, '--float')
  await ctx.tie('move', '--tile', b, '--shelve')
  await h.eventually(ctx, () => h.assertPtySizes(ctx))

  await ctx.shot('after')
}
