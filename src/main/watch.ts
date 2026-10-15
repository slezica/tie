// Live file watching for viewer tiles (markdown). No Electron imports: unit-tested on real files.
// Algorithm (research: docs/2026-10-15-tile-host-plan.md, "Watcher"); docs/MARKDOWN.md.
//
// - Editors save three ways: in place (same inode), temp + rename (new inode), backup rename + new
//   file (missing for a few ms). fs.watch(file) dies after a rename (kqueue on the inode), so watch
//   the directory (FSEvents on macOS), plus the real file's directory when the path is a symlink.
// - Events are hints (FSEvents: eventType unreliable, overflows dropped): debounce 100 ms (max
//   500 ms), then stat-read-stat (a read racing an in-place write is retried), report only when the
//   content hash changes. ENOENT: retry at +100 and +300 ms, then freeze (report missing once) and
//   keep watching. A backstop poll (2.5 s) catches dropped events and re-arms vanished directories.
import { watch, type FSWatcher, type Stats } from 'node:fs'
import { readFile, stat, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, dirname } from 'node:path'

export const MAX_BYTES = 8 * 1024 * 1024

export function revision(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 16)
}

export type Read = { buf: Buffer; st: Stats } | { error: 'missing' | 'too large' | 'not a file' | 'unstable' | 'unreadable' }

const same = (a: Stats, b: Stats) => a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs

// One consistent read: the file's stat is the same before and after (else 'unstable': retry).
export async function readStable(path: string): Promise<Read> {
  try {
    const st = await stat(path)
    if (!st.isFile()) return { error: 'not a file' }
    if (st.size > MAX_BYTES) return { error: 'too large' }
    const buf = await readFile(path)
    const st2 = await stat(path)
    return same(st, st2) && buf.length === st2.size ? { buf, st: st2 } : { error: 'unstable' }
  } catch (e) {
    return { error: (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unreadable' }
  }
}

export type WatchEvent = { type: 'change'; buf: Buffer; rev: string } | { type: 'missing' }

export interface WatchOpts {
  debounce?: number
  maxWait?: number
  poll?: number
  retries?: number[] // ENOENT re-checks (ms after the first miss)
}

export interface Watch {
  ready: Promise<void> // directory watchers armed (tests; until then only the poll sees changes)
  check(): Promise<void> // re-read now (after our own write, or to resync)
  close(): void
}

// Watch `path`, whose current content has revision `rev`. Events only on real changes.
export function watchFile(path: string, rev: string, onEvent: (e: WatchEvent) => void, opts: WatchOpts = {}): Watch {
  const { debounce = 100, maxWait = 500, poll = 2500, retries = [100, 300] } = opts
  let closed = false
  let current = rev
  let missing = false
  let lastStat: Stats | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let firstAt = 0
  let running = false
  let again = false
  let unstable = 0
  const watchers = new Map<string, { w: FSWatcher; ino: number }>() // dir → watcher

  const names = new Set([basename(path)])
  const schedule = (delay = debounce) => {
    if (closed) return
    const now = Date.now()
    if (!timer) firstAt = now
    else clearTimeout(timer)
    timer = setTimeout(run, Math.max(0, Math.min(delay, maxWait - (now - firstAt))))
  }
  const run = () => {
    timer = null
    void check()
  }

  async function check(): Promise<void> {
    if (closed) return
    if (running) return void (again = true)
    running = true
    try {
      await checkOnce()
    } finally {
      running = false
      if (again && !closed) (again = false), schedule(0)
    }
  }

  async function checkOnce(attempt = 0): Promise<void> {
    const r = await readStable(path)
    if (closed) return
    if ('error' in r) {
      if (r.error === 'missing' && attempt < retries.length) {
        await sleep(retries[attempt] - (attempt ? retries[attempt - 1] : 0))
        return closed ? undefined : checkOnce(attempt + 1)
      }
      if (r.error === 'unstable' && unstable++ < 5) return schedule()
      if (r.error === 'missing' && !missing) {
        missing = true
        lastStat = null
        onEvent({ type: 'missing' })
      }
      return
    }
    unstable = 0
    lastStat = r.st
    await arm() // the real path may have moved (symlink retargeted)
    const rv = revision(r.buf)
    if (rv === current && !missing) return
    current = rv
    missing = false
    onEvent({ type: 'change', buf: r.buf, rev: rv })
  }

  // Directory watchers: the path's directory and the real file's. Re-armed when a directory was
  // replaced or removed (its inode changed), or the watcher errored.
  async function arm() {
    const dirs = new Set([dirname(path)])
    const real = await realpath(path).catch(() => null)
    if (real) {
      dirs.add(dirname(real))
      names.add(basename(real))
    }
    for (const dir of dirs) {
      const ino = await stat(dir).then((s) => s.ino).catch(() => -1)
      if (closed) return
      const have = watchers.get(dir)
      if (have && have.ino === ino && ino !== -1) continue
      have?.w.close()
      watchers.delete(dir)
      if (ino === -1) continue // gone: the poll retries
      try {
        const w = watch(dir, { persistent: false }, (_type, name) => {
          if (!name || names.has(basename(name.toString()))) schedule()
        })
        w.on('error', () => {
          w.close()
          if (watchers.get(dir)?.w === w) watchers.delete(dir)
        })
        watchers.set(dir, { w, ino })
      } catch {}
    }
    for (const [dir, { w }] of watchers) if (!dirs.has(dir)) (w.close(), watchers.delete(dir))
  }

  // Backstop: cheap stat; a full check only if something moved (or the file came back).
  const pollTimer = setInterval(async () => {
    if (closed || running || timer) return
    const st = await stat(path).catch(() => null)
    if (closed) return
    await arm()
    if (!st ? !missing : !lastStat || missing || !same(st, lastStat)) void check()
  }, poll)
  pollTimer.unref?.()

  void stat(path)
    .then((st) => (lastStat = st))
    .catch(() => {})
  const ready = arm()

  return {
    ready,
    check,
    close: () => {
      closed = true
      if (timer) clearTimeout(timer)
      clearInterval(pollTimer)
      for (const { w } of watchers.values()) w.close()
      watchers.clear()
    },
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
