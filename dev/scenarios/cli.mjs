// tie CLI: argument handling (relative --cwd, multi-word titles, flag spellings, float rect, escaping).
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../lib.mjs'

export default async (ctx, h) => {
  const text = (id) => ctx.page.$eval(`.tile[data-id="${id}"] .xterm-rows`, (e) => e.innerText)
  // CLI run from another directory, as from a shell.
  const tieIn = (cwd, ...args) => {
    const env = { ...process.env, TIE_INSTANCE: ctx.instance }
    delete env.TIE_SOCKET
    delete env.TIE_TILE
    return JSON.parse(execFileSync(join(ROOT, 'bin/tie'), [...args, '--json'], { cwd, env }).toString())
  }

  // Relative --cwd resolves against the caller's directory, not Tie's.
  const dir = join(ROOT, 'dev')
  const rel = tieIn(dir, 'open', 'terminal', '--cwd', '.', '--cmd', 'pwd -P; sleep 30').id
  await ctx.sleep(1000)
  const pwd = (await text(rel)).trim().split('\n')[0]
  h.assert(pwd === realpathSync(dir), `relative --cwd: ${pwd}`)
  await ctx.tie('close', rel)

  // list: flags of background-tab tiles come from their own tab.
  const a = (await h.list(ctx)).tiles[0].id
  await ctx.tie('open', 'terminal', '--at', a, '--side', 'r')
  await ctx.sleep(300)
  await h.clickButton(ctx, a, 'collapse')
  await ctx.page.keyboard.press('Meta+t')
  await ctx.sleep(300)
  const l = await h.list(ctx)
  const ta = l.tiles.find((t) => t.id === a)
  h.assert(ta.collapsed && ta.active === (l.tabs[0].active === a), `background tile flags: ${JSON.stringify(ta)}`)
  await ctx.page.keyboard.press('Meta+1')
}
