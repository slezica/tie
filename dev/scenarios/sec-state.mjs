// Security: the state dir (~/.config/tie) and what Tie writes there are private to the user
// (0700 / 0600: the socket runs commands as the user; logs hold commands, paths, URLs); an
// oversized socket request line drops that connection, the server lives on.
import { statSync } from 'node:fs'
import { connect } from 'node:net'
import { stateDir, readInfo } from '../lib.mjs'

export default async (ctx, h) => {
  const info = readInfo(ctx.instance)
  const mode = (p) => (statSync(p).mode & 0o777).toString(8)
  h.assert(mode(stateDir) === '700', `state dir 0700 (${mode(stateDir)})`)
  h.assert(mode(info.socket) === '600', `socket 0600 (${mode(info.socket)})`)
  h.assert(mode(`${stateDir}/${ctx.instance}.json`) === '600', `info file 0600`)

  // A line over the cap: connection dropped, nothing executed; the next client is fine.
  const dropped = await new Promise((resolve) => {
    const c = connect(info.socket)
    let closed = false
    c.on('error', () => {})
    c.on('close', () => resolve(true))
    c.on('connect', () => c.write('{"jsonrpc":"2.0","id":1,"method":"open","params":{"kind":"terminal","cmd":"' + 'A'.repeat(1100 * 1024) + '"}'))
    setTimeout(() => !closed && resolve(false), 3000)
  })
  h.assert(dropped, 'oversized request line: connection dropped')
  h.assert((await h.list(ctx)).tiles.length === 1, 'nothing opened by it')
  h.assert(/line too long/.test(ctx.appLog()), 'logged')
}
