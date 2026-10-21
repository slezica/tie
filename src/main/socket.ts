// Driver socket: newline-delimited JSON-RPC over a unix socket, forwarded to the renderer.
// SECURITY: whoever connects can run commands as the user (tie open terminal --cmd). The socket is
// 0600 inside the 0700 state dir (env.ts): the user's own processes only. Each connection's caller
// is identified by the kernel (peer pid + uid, then process lineage: core/callers.ts): processes
// in a Tie terminal act as that terminal's tile; others only with the allowExternalControl
// setting (docs/SECURITY.md).
import { createServer, type Server, type Socket } from 'node:net'
import { existsSync, unlinkSync, chmodSync } from 'node:fs'
import { createRequire } from 'node:module'
import { log, PRIVATE } from './env'
import { untrusted } from '../core/log'
import { callerTile, type Caller, type Peer } from '../core/callers'

type Call = (method: string, params: unknown) => Promise<unknown>
interface Callers {
  tiles: () => Map<number, string> // pty pid → tile id
  allowExternal: () => boolean // setting allowExternalControl, read per request
}

// Native lookup (native/peer). Missing (not built): every caller is external (logged).
type PeerLib = { peerOf(fd: number): Peer | null; parentOf(pid: number): number | null }
let peerLib: PeerLib | null = null
try {
  peerLib = createRequire(import.meta.url)('tie-peer') as PeerLib
} catch (e) {
  log('security', 'peer lookup unavailable', String(e))
}

const EXTERNAL_OFF = 'External control is off (Settings → Security)'

// SECURITY: kernel facts only. No lookup or no fd (shouldn't happen for unix sockets on macOS) →
// external: the setting still gates it.
function resolveCaller(conn: Socket, tiles: Map<number, string>): { caller: Caller; pid: number | null } {
  const fd = (conn as unknown as { _handle?: { fd?: number } })._handle?.fd
  if (!peerLib || typeof fd !== 'number' || fd < 0) {
    log('security', peerLib ? 'socket fd unavailable' : 'peer lookup unavailable', 'caller treated as external')
    return { caller: { kind: 'external' }, pid: null }
  }
  const peer = peerLib.peerOf(fd)
  return { caller: callerTile(peer, process.getuid!(), peerLib.parentOf, tiles), pid: peer?.pid ?? null }
}

const MAX_LINE = 1024 * 1024 // a request line beyond this: the connection is dropped (no unbounded buffer)

export function startSocket(path: string, call: Call, callers: Callers): Server {
  if (existsSync(path)) unlinkSync(path)
  const server = createServer((conn) => {
    const { caller, pid } = resolveCaller(conn, callers.tiles())
    log('rpc', 'connection', pid, caller)
    let buf = ''
    conn.setEncoding('utf8')
    conn.on('data', (chunk: string) => {
      buf += chunk
      if (buf.length > MAX_LINE) {
        log('rpc', 'line too long, dropping connection')
        return conn.destroy()
      }
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (line) handle(line)
      }
    })
    conn.on('error', () => {})

    async function handle(line: string) {
      let id: unknown = null
      try {
        const msg = JSON.parse(line)
        id = msg.id ?? null
        const params = typeof msg.params === 'object' && msg.params ? msg.params : {}
        // SECURITY: the caller gate, for every method (dev ones included).
        if (caller.kind === 'refused') {
          log('security', 'refused caller', pid, untrusted(caller.why))
          reply({ jsonrpc: '2.0', id, error: { code: -32000, message: `Caller refused: ${caller.why}` } })
          return conn.end(() => conn.destroy())
        }
        if (caller.kind === 'external' && !callers.allowExternal()) {
          log('security', 'refused external caller', pid)
          throw new Error(EXTERNAL_OFF)
        }
        if (caller.kind === 'tile') {
          // The tile is the lineage's, never what the request claims (TIE_TILE is just env).
          if (params.caller !== undefined && params.caller !== caller.tile) log('security', 'caller spoof', untrusted({ claimed: params.caller }), { lineage: caller.tile, pid })
          params.caller = caller.tile
        }
        log('rpc', '<-', untrusted(msg.method), untrusted(params))
        const result = await call(msg.method, params)
        reply({ jsonrpc: '2.0', id, result: result ?? null })
      } catch (e) {
        reply({ jsonrpc: '2.0', id, error: { code: -32000, message: e instanceof Error ? e.message : String(e) } })
      }
    }
    function reply(msg: object) {
      if (!conn.destroyed && !conn.writableEnded) conn.write(JSON.stringify(msg) + '\n')
    }
  })
  server.listen(path, () => {
    try {
      chmodSync(path, PRIVATE)
    } catch (e) {
      log('rpc', 'chmod failed', String(e))
    }
  })
  return server
}
