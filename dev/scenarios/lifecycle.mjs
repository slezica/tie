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

  // Close before the pty spawn resolves: one socket write carrying open + close.
  const before = shells().length
  const next = `t${Math.max(...(await h.list(ctx)).tiles.map((t) => Number(t.id.slice(1)))) + 1}`
  await new Promise((res) => {
    const c = connect(info.socket)
    let buf = ''
    c.on('data', (d) => {
      buf += d
      if (buf.split('\n').filter(Boolean).length >= 2) c.end(), res()
    })
    const rpc = (id, method, params) => JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
    c.on('connect', () => c.write(rpc(1, 'open', { kind: 'terminal' }) + rpc(2, 'close', { id: next })))
  })
  await ctx.sleep(1500)
  h.assert(shells().length === before, `no leaked shell (${before} -> ${shells().length})`)
}
