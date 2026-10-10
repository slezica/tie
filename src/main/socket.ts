// Driver socket: newline-delimited JSON-RPC over a unix socket, forwarded to the renderer.
import { createServer, type Server } from 'node:net'
import { existsSync, unlinkSync } from 'node:fs'
import { log } from './env'

type Call = (method: string, params: unknown) => Promise<unknown>

export function startSocket(path: string, call: Call): Server {
  if (existsSync(path)) unlinkSync(path)
  const server = createServer((conn) => {
    let buf = ''
    conn.setEncoding('utf8')
    conn.on('data', (chunk: string) => {
      buf += chunk
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
        log('rpc', '<-', msg.method, msg.params)
        const result = await call(msg.method, msg.params ?? {})
        reply({ jsonrpc: '2.0', id, result: result ?? null })
      } catch (e) {
        reply({ jsonrpc: '2.0', id, error: { code: -32000, message: e instanceof Error ? e.message : String(e) } })
      }
    }
    function reply(msg: object) {
      if (!conn.destroyed) conn.write(JSON.stringify(msg) + '\n')
    }
  })
  server.listen(path)
  return server
}
