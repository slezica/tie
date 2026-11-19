// Tiles closed mid-operation (pty spawn, drag source or target, context menu) leave nothing behind.
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
  // Ids are random: `as` (dev `--id`) names the tile so the close can follow in the same write.
  const next = 'tlifecycle'
  await new Promise((res) => {
    const c = connect(info.socket)
    let buf = ''
    c.on('data', (d) => {
      buf += d
      if (buf.split('\n').filter(Boolean).length >= 2) c.end(), res()
    })
    const rpc = (id, method, params) => JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
    c.on('connect', () => c.write(rpc(1, 'add', { kind: 'terminal', as: next }) + rpc(2, 'close', { id: next })))
  })
  // Its pty spawn resolves after the close: the shell is killed (app log: spawn, then exit).
  const pid = await h.waitFor(ctx, async () => spawned()[n0], 'pty spawn of the closed tile')
  await h.waitFor(ctx, async () => ctx.appLog().includes(`[pty] exit ${pid}`), `its shell ${pid} exited`)
  h.assert(shells().length === before, `no leaked shell (${before} -> ${shells().length})`)

  const errors = []
  ctx.page.on('pageerror', (e) => errors.push(e.message))
  // Drag leftovers: drop previews, the pointer ghost, the body's drag classes.
  const dragUi = () => ctx.page.evaluate(() => {
    const shown = [...document.querySelectorAll('#preview, #preview2, .drop-preview, #ghost')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id || e.className)
    return [...shown, ...['dragging', 'tile-drag'].filter((c) => document.body.classList.contains(c))]
  })

  // Closed during its own title drag: the drop is dropped, no exception.
  const a = (await h.list(ctx)).tiles[0].id
  const b = (await ctx.tie('add', 'terminal', '--at', a, '--side', 'r')).id
  await h.drag(ctx, await h.titlePoint(ctx, b), await h.sidePoint(ctx, a, 'l'), { during: () => ctx.tie('close', '--tile', b) })
  h.assert(!errors.length, `no page errors after drop: ${errors}`)
  let s = await h.state(ctx)
  h.assert(h.leafIds(s.tree).join() === a && !s.floats.length && !s.shelf.length, `just a left (${JSON.stringify(s.tree)})`)
  h.assert(!(await dragUi()).length, `no drag leftovers: ${await dragUi()}`)

  // Context menu goes away with its tile.
  const c = (await ctx.tie('add', 'terminal', '--at', a, '--side', 'r')).id
  const p = await h.titlePoint(ctx, c)
  await ctx.page.mouse.click(p.x, p.y, { button: 'right' })
  await ctx.page.waitForSelector('.menu')
  await ctx.tie('close', '--tile', c)
  await h.eventually(ctx, async () => h.assert(!(await ctx.page.$('.menu')), 'menu closed with its tile'))
  h.assert(!errors.length, `no page errors: ${errors}`)

  // Drop target closed mid-drag: the drop is dropped, the source stays where it was.
  const d = (await ctx.tie('add', 'terminal', '--at', a, '--side', 'r')).id
  const e = (await ctx.tie('add', 'terminal', '--at', d, '--side', 'r')).id
  await h.waitShell(ctx, e)
  // A target under the pointer (its preview shown), then closed.
  const closing = (id) => async () => {
    h.assert((await dragUi()).includes('preview'), `drop target ${id} previewed: ${await dragUi()}`)
    await ctx.tie('close', '--tile', id)
  }
  // Swap target (a's center).
  await h.drag(ctx, await h.titlePoint(ctx, e), await h.sidePoint(ctx, a, 'c'), { during: closing(a) })
  s = await h.state(ctx)
  h.assert(h.leafIds(s.tree).join() === [d, e].join() && !s.floats.length && !s.shelf.length, `swap target gone: d | e stay (${h.leafIds(s.tree)})`)
  h.assert(!(await dragUi()).length, `no drag leftovers: ${await dragUi()}`)
  // Edge target (d's left).
  await h.drag(ctx, await h.titlePoint(ctx, e), await h.sidePoint(ctx, d, 'l'), { during: closing(d) })
  s = await h.state(ctx)
  h.assert(h.leafIds(s.tree).join() === e && !s.floats.length && !s.shelf.length, `edge target gone: e stays (${h.leafIds(s.tree)})`)
  h.assert(!(await dragUi()).length, `no drag leftovers: ${await dragUi()}`)
  h.assert(!errors.length, `no page errors after target closes: ${errors}`)
}
