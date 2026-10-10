// pty host: spawns shells, streams data to the renderer, reports foreground process.
import * as nodePty from 'node-pty'
import { execFile } from 'node:child_process'
import type { WebContents } from 'electron'
import { homedir } from 'node:os'
import { statSync } from 'node:fs'
import { shellArgv, resolveExecutable } from './settings'
import { log } from './env'

export interface SpawnOptions {
  cmd?: string
  cwd?: string
  cols: number
  rows: number
  env: Record<string, string>
}

const ptys = new Map<number, nodePty.IPty>()

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}
const procNames = new Map<number, string>()
const cwds = new Map<number, string>()

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

  // Shell working directories (no shell integration needed): one batched lsof call per tick.
  let polling = false
  setInterval(() => {
    if (polling || !ptys.size) return
    polling = true
    execFile('lsof', ['-a', '-d', 'cwd', '-Fn', '-p', [...ptys.keys()].join(',')], (_err, out) => {
      polling = false
      let pid = 0
      for (const line of (out ?? '').split('\n')) {
        if (line[0] === 'p') pid = Number(line.slice(1))
        else if (line[0] === 'n' && ptys.has(pid) && cwds.get(pid) !== line.slice(1)) {
          cwds.set(pid, line.slice(1))
          send('pty:cwd', pid, line.slice(1))
        }
      }
    })
  }, 2000)

  return {
    // Returns pty id, or an error message for the tile to show (never throws).
    spawn(o: SpawnOptions): number | { error: string } {
      const [shell, ...base] = shellArgv()
      const resolved = resolveExecutable(shell)
      if (!resolved) return { error: `Shell not found or not executable: ${shell}\nFix it in Settings → Terminal.` }
      const args = o.cmd ? [...base, '-i', '-c', o.cmd] : base
      const cwd = o.cwd || homedir()
      if (!isDir(cwd)) return { error: `Directory not found: ${cwd}` }
      let p: nodePty.IPty
      try {
        // Spawn by the configured name (natural $0); resolved path only needed for ~ expansion.
        p = nodePty.spawn(shell.startsWith('~') ? resolved : shell, args, {
          name: 'xterm-256color',
          cols: o.cols,
          rows: o.rows,
          cwd,
          env: { ...process.env, ...o.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'tie' } as Record<string, string>,
        })
      } catch (e) {
        return { error: `Could not start ${shell}: ${e instanceof Error ? e.message : e}` }
      }
      ptys.set(p.pid, p)
      log('pty', 'spawn', p.pid, shell, args, o.cwd)
      p.onData((d) => send('pty:data', p.pid, d))
      p.onExit(({ exitCode }) => {
        log('pty', 'exit', p.pid, exitCode)
        ptys.delete(p.pid)
        procNames.delete(p.pid)
        cwds.delete(p.pid)
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
