// pty host: spawns shells, streams data to the renderer, reports foreground process.
import * as nodePty from 'node-pty'
import type { WebContents } from 'electron'
import { homedir } from 'node:os'
import { shellArgv } from './settings'
import { log } from './env'

export interface SpawnOptions {
  cmd?: string
  cwd?: string
  cols: number
  rows: number
  env: Record<string, string>
}

const ptys = new Map<number, nodePty.IPty>()
const procNames = new Map<number, string>()

export function initPty(wc: () => WebContents | null) {
  // Never throw here: an exception inside node-pty's native callbacks aborts the process.
  const send = (ch: string, ...args: unknown[]) => {
    try {
      const w = wc()
      if (w && !w.isDestroyed()) w.send(ch, ...args)
    } catch (e) {
      log('pty', 'send failed', ch, String(e))
    }
  }

  // Foreground process name, polled (node-pty exposes it, no event).
  setInterval(() => {
    for (const [id, p] of ptys) {
      let name = ''
      try {
        name = p.process
      } catch {}
      if (name && procNames.get(id) !== name) {
        procNames.set(id, name)
        send('pty:process', id, name)
      }
    }
  }, 500)

  return {
    spawn(o: SpawnOptions): number {
      const [shell, ...base] = shellArgv()
      const args = o.cmd ? [...base, '-i', '-c', o.cmd] : base
      const p = nodePty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: o.cols,
        rows: o.rows,
        cwd: o.cwd || homedir(),
        env: { ...process.env, ...o.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'tie' } as Record<string, string>,
      })
      ptys.set(p.pid, p)
      log('pty', 'spawn', p.pid, shell, args, o.cwd)
      p.onData((d) => send('pty:data', p.pid, d))
      p.onExit(({ exitCode }) => {
        log('pty', 'exit', p.pid, exitCode)
        ptys.delete(p.pid)
        procNames.delete(p.pid)
        send('pty:exit', p.pid, exitCode)
      })
      return p.pid
    },
    write(id: number, data: string) {
      ptys.get(id)?.write(data)
    },
    resize(id: number, cols: number, rows: number) {
      const p = ptys.get(id)
      if (!p || cols < 1 || rows < 1) return
      log('pty', 'resize', id, cols, rows)
      p.resize(cols, rows)
    },
    kill(id: number) {
      const p = ptys.get(id)
      if (!p) return
      log('pty', 'kill', id)
      p.kill()
    },
    // Resolves once every pty reported exit (or after timeout). Quitting with live ptys
    // lets node-pty call into a torn-down JS env, which aborts the process.
    async killAll(timeoutMs = 1500) {
      const targets = [...ptys.entries()] // snapshot: ptys spawned meanwhile are left alone
      for (const [, p] of targets) {
        try {
          p.kill()
        } catch {}
      }
      const alive = () => targets.filter(([id]) => ptys.has(id))
      const start = Date.now()
      while (alive().length && Date.now() - start < timeoutMs) await new Promise((r) => setTimeout(r, 20))
      if (alive().length) {
        for (const [, p] of alive()) {
          try {
            p.kill('SIGKILL')
          } catch {}
        }
        await new Promise((r) => setTimeout(r, 100))
      }
    },
    count: () => ptys.size,
  }
}
