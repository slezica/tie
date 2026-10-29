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
import { callerTile, replaceBlock, type Caller, type Peer } from '../core/callers'

type Call = (method: string, params: unknown) => Promise<unknown>
interface Callers {
  tiles: () => Map<number, string> // pty pid → tile id
  allowExternal: () => boolean // setting allowExternalControl, read per request
  busyIgnoring: (ptyPid: number, ignore: number) => { busy: boolean; others: number[] } // pty.ts
}

// Native lookup (native/peer). Missing (not built): every caller is external (logged).
type PeerLib = { peerOf(fd: number): Peer | null; parentOf(pid: number): number | null; nameOf?(pid: number): string | null }
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

// `tie open --replace` (CLI.md): the tile to replace, after the checks (core/callers replaceBlock).
// SECURITY: always the caller's lineage tile (its own terminal), never anything from the request.
function replaceTarget(caller: Caller, pid: number | null, callers: Callers): string {
  if (caller.kind !== 'tile' || pid === null || !peerLib) throw new Error('no terminal to replace')
  const tile = caller.tile
  const pty = [...callers.tiles()].find(([, t]) => t === tile)?.[0]
  if (pty === undefined) throw new Error('no terminal to replace') // its shell exited meanwhile
  const block = replaceBlock(pid, pty, peerLib.parentOf, (ignore) => callers.busyIgnoring(pty, ignore))
  const name = block?.pid ? (peerLib.nameOf?.(block.pid) ?? null) : null
  if (block?.why === 'under') throw new Error(`tie runs under ${name ?? 'another process'}`)
  if (block) throw new Error(name ? `A process is running: ${name}` : 'A process is running')
  return tile
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

    // --replace: the new tile waits on the shelf until tie exits (the connection closes), so the
    // shell isn't killed under it. Reply delivered, then closed: the renderer swaps it in.
    // Closed before the reply went out (tie killed): no replace, the tile stays shelved.
    let replacing: { old: string; focus: boolean } | null = null
    let armed: { old: string; id: string; focus: boolean } | null = null
    let closed = false
    const fireReplace = (r: { old: string; id: string; focus: boolean }) => {
      log('rpc', 'replace', r.old, '->', r.id)
      call('replace', r).catch((e) => log('rpc', 'replace failed', String(e)))
    }
    conn.on('close', () => {
      closed = true
      if (armed) fireReplace(armed)
    })

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
        // SECURITY: internal (connection close above): a client could otherwise close any tile.
        if (msg.method === 'replace') throw new Error('unknown method: replace')
        const replace = msg.method === 'open' && !!params.replace
        if (replace) {
          if (replacing) throw new Error('one --replace per connection')
          replacing = { old: replaceTarget(caller, pid, callers), focus: !!params.focus }
        }
        log('rpc', '<-', untrusted(msg.method), untrusted(params))
        let result: unknown
        try {
          result = await call(msg.method, params)
        } catch (e) {
          if (replace) replacing = null
          throw e
        }
        const r = replace && replacing ? { ...replacing, id: String((result as { id: string }).id) } : null
        const sent = reply({ jsonrpc: '2.0', id, result: result ?? null }, (err) => {
          if (!r) return
          if (err) return log('rpc', 'replace dropped: reply not delivered', r.old, r.id)
          if (closed) fireReplace(r)
          else armed = r
        })
        if (r && !sent) log('rpc', 'replace dropped: connection closed before the reply', r.old, r.id)
      } catch (e) {
        reply({ jsonrpc: '2.0', id, error: { code: -32000, message: e instanceof Error ? e.message : String(e) } })
      }
    }
    function reply(msg: object, done?: (err?: Error | null) => void): boolean {
      if (conn.destroyed || conn.writableEnded) return false
      conn.write(JSON.stringify(msg) + '\n', done)
      return true
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
