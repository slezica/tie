// pty host: spawns shells, streams data to the renderer, reports foreground process.
import * as nodePty from 'node-pty'
import { execFile } from 'node:child_process'
import type { WebContents } from 'electron'
import { homedir } from 'node:os'
import { statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { shellArgv, resolveExecutable } from './settings'
import { log } from './env'
import { untrusted } from '../core/log'

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
// SECURITY: pty pid → tile id (TIE_TILE from the UI at spawn). The socket's caller identity
// (core/callers.ts) walks a caller's ancestors up to one of these pids.
const tileOf = new Map<number, string>()
const cwds = new Map<number, string>()
const cmds = new Set<number>() // ptys running `--cmd` (not an interactive shell)
const shellNames = new Map<number, string>() // foreground name at spawn (the shell)

// Child pids (native/peer). Missing (not built): a shell counts as busy when its foreground
// process isn't the shell (misses background jobs; logged).
let childrenOf: ((pid: number) => number[] | null) | null = null
try {
  childrenOf = (createRequire(import.meta.url)('tie-peer') as { childrenOf(pid: number): number[] | null }).childrenOf
} catch (e) {
  log('pty', 'child lookup unavailable', String(e))
}

export interface Busy {
  busy: boolean
  proc: string // foreground process name, read now ('' if unknown)
}

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
      if (o.env.TIE_TILE) tileOf.set(p.pid, o.env.TIE_TILE)
      if (o.cmd) cmds.add(p.pid)
      try {
        shellNames.set(p.pid, p.process)
      } catch {}
      log('pty', 'spawn', p.pid, untrusted(shell), untrusted(args), untrusted(o.cwd))
      p.onData((d) => send('pty:data', p.pid, d))
      p.onExit(({ exitCode }) => {
        log('pty', 'exit', p.pid, exitCode)
        ptys.delete(p.pid)
        tileOf.delete(p.pid)
        procNames.delete(p.pid)
        cwds.delete(p.pid)
        cmds.delete(p.pid)
        shellNames.delete(p.pid)
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
    // Busy terminals (TERMINALS.md "Busy"), read now (not the polls): a `--cmd` pty while alive;
    // a shell while it has child processes (foreground command, pipeline, background or
    // suspended job). Exited / unknown pids: not busy.
    busy(id: number): Busy {
      const p = ptys.get(id)
      if (!p) return { busy: false, proc: '' }
      let proc = ''
      try {
        proc = p.process
      } catch {}
      if (cmds.has(id)) return { busy: true, proc }
      const kids = childrenOf?.(id)
      if (kids) return { busy: kids.length > 0, proc }
      return { busy: !!proc && proc !== shellNames.get(id), proc }
    },
    count: () => ptys.size,
    // Live pty pids → their tiles (socket caller identity).
    tiles: (): Map<number, string> => new Map(tileOf),
    // Current directory of a shell, read now (the poll above may be up to 2s stale).
    cwd(id: number): Promise<string | null> {
      if (!ptys.has(id)) return Promise.resolve(null)
      return new Promise((resolve) => {
        execFile('lsof', ['-a', '-d', 'cwd', '-Fn', '-p', String(id)], (_err, out) => {
          const line = (out ?? '').split('\n').find((l) => l[0] === 'n')
          resolve(line ? line.slice(1) : null)
        })
      })
    },
  }
}
