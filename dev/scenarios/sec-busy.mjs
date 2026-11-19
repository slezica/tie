// Security: `pty:busy` (UI → main) answers only about Tie's own ptys, and at most 256 pids per
// call: it is not a probe for other processes (which pids exist, which have children).
import { readInfo } from '../lib.mjs'

export default async (ctx, h) => {
  const t0 = (await h.list(ctx)).tiles[0].id
  const cmd = (await ctx.tie('add', 'terminal', '--cmd', 'sleep 300', '--at', t0, '--side', 'r')).id
  const own = (await h.waitTile(ctx, cmd, (t) => t.term?.pid, 'cmd tile spawned')).term.pid
  const busy = (ids) => ctx.page.evaluate((ids) => window.tie.pty.busy(ids), ids)
  // Control: an own pty running a command is busy.
  await h.waitFor(ctx, async () => (await busy([own]))[own]?.busy === true, 'own pty: busy')
  // Other pids, all with children (Tie's main process, launchd): not busy, no name.
  const main = readInfo(ctx.instance).pid
  const r = await busy([main, 1])
  h.assert(r[main]?.busy === false && !r[main].proc && r[1]?.busy === false && !r[1].proc, `other pids: not busy, no name: ${JSON.stringify(r)}`)
  h.assert(Object.keys(r[main]).sort().join() === 'busy,proc', `only busy + proc returned: ${Object.keys(r[main])}`)
  // 256 per call; non-integers dropped.
  const many = await busy(Array.from({ length: 1000 }, (_, i) => 100000 + i))
  h.assert(Object.keys(many).length === 256, `256 pids per call (${Object.keys(many).length})`)
  const odd = await busy(['1', 1.5, null, { a: 1 }, own])
  h.assert(Object.keys(odd).join() === String(own), `non-integers dropped: ${JSON.stringify(odd)}`)
  h.assert(Object.keys(await busy('x')).length === 0, 'not a list: empty')
}
