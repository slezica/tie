// Tiles closed mid-operation (pty spawn, drag, context menu) leave nothing behind.
import { connect } from 'node:net'
import { execSync } from 'node:child_process'
import { readInfo } from '../lib.mjs'

export default async (ctx, h) => {
  const info = readInfo(ctx.instance)
  const shells = () => {
    const kids = execSync(`pgrep -P ${info.pid} || true`).toString().trim().split('\n').filter(Boolean)
    if (!kids.length) return []
    return execSync(`ps -o pid=,comm= -p ${kids.join(',')}`).toString().trim().split('\n').filter((l) => /sh$/.test(l.trim()))
  }

  // Close before the pty spawn resolves: one socket write carrying add + close.
  const before = shells().length
  const spawned = () => [...ctx.appLog().matchAll(/\[pty\] spawn (\d+)/g)].map((m) => m[1])
  const n0 = spawned().length
  // Ids are random: make the next one known (all-zero bytes → taaaaaa), once, to close it unseen.
  const next = 'taaaaaa'
  await ctx.page.evaluate(() => {
    const real = crypto.getRandomValues.bind(crypto)
    crypto.getRandomValues = (a) => {
      crypto.getRandomValues = real
      return a.fill(0)
    }
  })
  await new Promise((res) => {
    const c = connect(info.socket)
    let buf = ''
    c.on('data', (d) => {
      buf += d
      if (buf.split('\n').filter(Boolean).length >= 2) c.end(), res()
    })
    const rpc = (id, method, params) => JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
    c.on('connect', () => c.write(rpc(1, 'add', { kind: 'terminal' }) + rpc(2, 'close', { id: next })))
  })
  // Its pty spawn resolves after the close: the shell is killed (app log: spawn, then exit).
  const pid = await h.waitFor(ctx, async () => spawned()[n0], 'pty spawn of the closed tile')
  await h.waitFor(ctx, async () => ctx.appLog().includes(`[pty] exit ${pid}`), `its shell ${pid} exited`)
  h.assert(shells().length === before, `no leaked shell (${before} -> ${shells().length})`)

  const errors = []
  ctx.page.on('pageerror', (e) => errors.push(e.message))

  // Closed during its own title drag: the drop is dropped, no exception.
  const a = (await h.list(ctx)).tiles[0].id
  const b = (await ctx.tie('add', 'terminal', '--at', a, '--side', 'r')).id
  await h.drag(ctx, await h.titlePoint(ctx, b), await h.sidePoint(ctx, a, 'l'), { during: () => ctx.tie('close', '--tile', b) })
  h.assert(!errors.length, `no page errors after drop: ${errors}`)

  // Context menu goes away with its tile.
  const c = (await ctx.tie('add', 'terminal', '--at', a, '--side', 'r')).id
  const p = await h.titlePoint(ctx, c)
  await ctx.page.mouse.click(p.x, p.y, { button: 'right' })
  await ctx.page.waitForSelector('.menu')
  await ctx.tie('close', '--tile', c)
  await h.eventually(ctx, async () => h.assert(!(await ctx.page.$('.menu')), 'menu closed with its tile'))
  h.assert(!errors.length, `no page errors: ${errors}`)
}
