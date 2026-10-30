// Directory walk for the file picker: streaming BFS, gitignore-aware, bounded. No Electron imports:
// unit-tested on real directories (walk.test.ts). Design + research: docs/2026-10-30-file-picker.md
// ("Components", "Research").
//
// - BFS on readdir({withFileTypes}), 16 reads in flight. Paths relative to the root, POSIX, dirs
//   with a trailing `/`. `.git` never listed; hidden entries only with `hidden`.
// - Symlinks never followed into: to a file → listed as a file; to a directory → listed (`name/`),
//   not walked (typing into it re-roots the walk there).
// - Gitignore (`ignore` npm, git's semantics: negation, dir-only, last match wins): only inside a
//   repo (a directory holding `.git`). Per-directory chain: a child `.gitignore` adds, deeper
//   files decide first; a nested repo resets the chain. Repo level: global excludes
//   (core.excludesFile, else ~/.config/git/ignore) under `.git/info/exclude`. A root inside a repo
//   gets its ancestors' rules; a root that is itself ignored (typed into) is walked whole.
// - TCC: protected roots (home's Desktop, Documents, Downloads, Pictures, Music, Movies, Library,
//   Google Drive, also as seen under /System/Volumes/Data; /Volumes) are listed but never walked unless the walk is rooted at or in them
//   (the user typed into one: a prompt is expected). Symlinks into them aren't stat'ed (home's
//   symlinks into Library/CloudStorage: listed as `name/`). At most one read in flight under a
//   protected root (process-wide): a read blocked on a prompt holds a libuv thread, four of them
//   stall all fs work in main.
// - Per-read timeout (400 ms): the directory is dropped and reported in `waiting`; the read's late
//   result is swallowed. A stuck protected read keeps its slot until it settles; protected dirs
//   queued meanwhile are dropped to `waiting` too.
// - Budget: 50k entries or 2 s → final chunk `partial`. Unreadable dirs (EPERM, EACCES, ENOENT,
//   ENAMETOOLONG, ...): skipped, counted in `errors`.
// - Chunks: at 1024 paths or 16 ms after the first buffered one; the last has `done`. stop():
//   nothing more is emitted.
import { readdir, readFile, readlink, stat, lstat } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import ignore, { type Ignore } from 'ignore'

export interface WalkOpts {
  gitignore: boolean
  hidden?: boolean // list dot entries (`.git` never)
  home?: string // protected roots + git config location (tests: a fake home); default os.homedir()
  cap?: number // entries (default 50_000)
  timeMs?: number // whole walk (default 2000)
  readTimeoutMs?: number // per directory read (default 400)
  concurrency?: number // reads in flight (default 16)
  chunkPaths?: number // default 1024
  chunkMs?: number // default 16
  delayMs?: number // harness only (dev TIE_WALK_DELAY): each directory read starts this late
}

export interface WalkChunk {
  paths: string[]
  done: boolean
  partial?: 'entries' | 'time' // final chunk: a budget ran out
  waiting?: string[] // dirs whose read timed out (likely a permission prompt), relative ('.' = root)
  errors?: number // final chunk: unreadable dirs skipped
}

export interface Walk {
  stop(): void
}

export const WALK_CAP = 50_000
export const PROTECTED_HOME = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Movies', 'Library', 'Google Drive']

const DATA_VOLUME = '/System/Volumes/Data'

const under = (p: string, root: string) => p === root || p.startsWith(root === '/' ? '/' : root + '/')
const child = (dir: string, name: string) => (dir === '/' ? '/' + name : dir + '/' + name)
const relTo = (base: string, abs: string) => (base === '/' ? abs.slice(1) : abs.slice(base.length + 1))

// The one read in flight under a protected root, process-wide (walks share libuv's threads).
// `stuck`: it timed out and is likely blocked on a prompt.
let protectedRead: { stuck: boolean } | null = null
const wakers = new Set<() => void>()
const wakeAll = () => [...wakers].forEach((w) => w())

type Outcome<T> = { ok: T } | { err: NodeJS.ErrnoException } | { timeout: true }
// Race against a timer. Both outcomes of `p` are handled here, so a late rejection never throws.
function timed<T>(p: Promise<T>, ms: number): Promise<Outcome<T>> {
  return new Promise((done) => {
    const t = setTimeout(() => done({ timeout: true }), ms)
    p.then(
      (ok) => (clearTimeout(t), done({ ok })),
      (err) => (clearTimeout(t), done({ err })),
    )
  })
}

// `[core] excludesFile` of a git config text (last one wins), or null.
export function excludesFileOf(config: string): string | null {
  let section = ''
  let found: string | null = null
  for (let line of config.split(/\r?\n/)) {
    const h = /^\s*\[\s*([A-Za-z0-9.-]+)(?:\s+"[^"]*")?\s*\](.*)$/.exec(line)
    if (h) {
      section = h[1].toLowerCase()
      line = h[2]
    }
    if (section !== 'core') continue
    const m = /^\s*excludesfile\s*=\s*(.*)$/i.exec(line)
    if (!m) continue
    let v = m[1].trim()
    if (v.startsWith('"')) v = v.slice(1, v.indexOf('"', 1) > 0 ? v.indexOf('"', 1) : undefined)
    else v = v.replace(/\s*[#;].*$/, '')
    if (v) found = v
  }
  return found
}

interface Level {
  base: string // absolute dir the patterns are relative to
  ig: Ignore
}
interface Scope {
  repo: boolean // inside a git repo (gitignore applies)
  levels: Level[] // shallowest first
}

// Deepest level decides first; a negation there re-includes what a parent ignored.
function ignored(levels: Level[], abs: string, isDir: boolean): boolean {
  for (let i = levels.length - 1; i >= 0; i--) {
    const { base, ig } = levels[i]
    const p = relTo(base, abs)
    if (!p) continue
    let t
    try {
      t = ig.test(isDir ? p + '/' : p)
    } catch {
      continue
    }
    if (t.ignored) return true
    if (t.unignored) return false
  }
  return false
}

export function walkDir(dir: string, opts: WalkOpts, emit: (chunk: WalkChunk) => void): Walk {
  const root = dir.length > 1 ? dir.replace(/\/+$/, '') : dir
  const home = opts.home ?? homedir()
  const cap = opts.cap ?? WALK_CAP
  const readMs = opts.readTimeoutMs ?? 400
  const conc = opts.concurrency ?? 16
  const chunkPaths = opts.chunkPaths ?? 1024
  const chunkMs = opts.chunkMs ?? 16
  // Also their mirrors under the data volume's firmlink (/System/Volumes/Data/Users/...).
  const homeRoots = PROTECTED_HOME.map((n) => join(home, n))
  const roots = [...homeRoots, ...homeRoots.map((r) => join(DATA_VOLUME, r)), '/Volumes']
  // Protected roots the walk may enter: those it is rooted at or in.
  const fenced = roots.filter((r) => !under(root, r))
  const isFenced = (abs: string) => fenced.some((r) => abs === r)
  const isProtected = (abs: string) => roots.some((r) => under(abs, r))
  const cloud = join(home, 'Library/CloudStorage')

  let over = false
  let count = 0
  let errors = 0
  const waiting: string[] = []
  let buf: string[] = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let waitingChanged = false

  type Item = { abs: string; rel: string; scope: Scope }
  const q: Item[] = []
  const pq: Item[] = [] // under a protected root: one at a time
  let active = 0
  let globalText: string | null = null

  const read = <T>(p: Promise<T>) => timed(p, readMs)
  const readText = async (path: string) => {
    const o = await read(readFile(path, 'utf8'))
    return 'ok' in o ? o.ok : null
  }

  const flush = () => {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = null
    if (over || (!buf.length && !waitingChanged)) return
    const chunk: WalkChunk = { paths: buf, done: false }
    if (waiting.length) chunk.waiting = [...waiting]
    buf = []
    waitingChanged = false
    emit(chunk)
  }
  const schedule = () => {
    if (!flushTimer && !over) flushTimer = setTimeout(flush, chunkMs)
  }
  const wait = (rel: string) => {
    waiting.push(rel || '.')
    waitingChanged = true
    schedule()
  }
  // false: the cap is reached (walk finished).
  const add = (path: string) => {
    if (over) return false
    buf.push(path)
    count++
    if (count >= cap) {
      finish('entries')
      return false
    }
    if (buf.length >= chunkPaths) flush()
    else schedule()
    return true
  }

  const budget = setTimeout(() => finish('time'), opts.timeMs ?? 2000)
  function finish(partial?: 'entries' | 'time') {
    if (over) return
    over = true
    clearTimeout(budget)
    if (flushTimer) clearTimeout(flushTimer)
    wakers.delete(pump)
    const chunk: WalkChunk = { paths: buf, done: true, errors }
    if (partial) chunk.partial = partial
    if (waiting.length) chunk.waiting = [...waiting]
    buf = []
    emit(chunk)
  }

  // A repo's own level: global excludes, then .git/info/exclude (which wins).
  async function repoLevel(abs: string, gitDir: boolean): Promise<Level> {
    const ig = ignore()
    if (globalText) ig.add(globalText)
    const ex = gitDir ? await readText(join(abs, '.git/info/exclude')) : null
    if (ex) ig.add(ex)
    return { base: abs, ig }
  }
  async function withGitignore(scope: Scope, abs: string): Promise<Scope> {
    const t = await readText(join(abs, '.gitignore'))
    return t ? { ...scope, levels: [...scope.levels, { base: abs, ig: ignore().add(t) }] } : scope
  }

  async function globalExcludes(): Promise<string | null> {
    const xdg = opts.home ? join(home, '.config') : process.env.XDG_CONFIG_HOME || join(home, '.config')
    let file: string | null = null
    for (const cfg of [join(xdg, 'git/config'), join(home, '.gitconfig')]) {
      const t = await readText(cfg)
      const v = t && excludesFileOf(t)
      if (v) file = v
    }
    if (!file) return readText(join(xdg, 'git/ignore'))
    if (file.startsWith('~/')) file = join(home, file.slice(2))
    return readText(resolve(home, file))
  }

  // Rules that apply at the root: from the enclosing repo (if any) down to the root's parent.
  async function rootScope(): Promise<Scope> {
    const none: Scope = { repo: false, levels: [] }
    if (!opts.gitignore) return none
    globalText = await globalExcludes()
    const exists = async (p: string) => {
      const o = await read(lstat(p))
      return 'ok' in o ? o.ok : null
    }
    if (await exists(join(root, '.git'))) return none // the root's own visit sets it up
    const chain: string[] = []
    let repo: string | null = null
    let gitDir = false
    for (let d = dirname(root); ; d = dirname(d)) {
      chain.unshift(d)
      const st = await exists(join(d, '.git'))
      if (st) {
        repo = d
        gitDir = st.isDirectory()
        break
      }
      if (d === '/' || chain.length > 64) break
    }
    if (!repo) return none
    let scope: Scope = { repo: true, levels: [await repoLevel(repo, gitDir)] }
    for (const d of chain) scope = await withGitignore(scope, d)
    // Typed into an ignored directory: walk it whole (its own .gitignore files still count).
    if (ignored(scope.levels, root, true)) scope = { repo: true, levels: [] }
    return scope
  }

  type Kind = 'file' | 'dir' | 'listed' | null // listed: shown as `name/`, never walked
  async function kindOf(e: Dirent, abs: string): Promise<Kind> {
    if (e.isDirectory()) return isFenced(abs) ? 'listed' : 'dir'
    if (e.isFile()) return 'file'
    if (!e.isSymbolicLink()) return null // sockets, fifos, devices
    const l = await read(readlink(abs))
    if (!('ok' in l)) return null
    const target = resolve(dirname(abs), l.ok)
    if (dirname(abs) === home && under(target, cloud)) return 'listed' // home's cloud drive links
    if (fenced.some((r) => under(target, r))) return null // never touch a protected root to classify
    const s = await read(stat(target))
    if (!('ok' in s)) return null
    return s.ok.isFile() ? 'file' : s.ok.isDirectory() ? 'listed' : null
  }

  async function visit(it: Item, ents: Dirent[]) {
    let scope = it.scope
    if (opts.gitignore) {
      const git = ents.find((e) => e.name === '.git')
      if (git) scope = { repo: true, levels: [await repoLevel(it.abs, git.isDirectory())] }
      if (scope.repo && ents.some((e) => e.name === '.gitignore' && e.isFile())) scope = await withGitignore(scope, it.abs)
    }
    if (over) return
    const shown = ents.filter((e) => e.name !== '.git' && (opts.hidden || e.name[0] !== '.'))
    const kinds = await Promise.all(shown.map((e) => kindOf(e, child(it.abs, e.name))))
    for (let i = 0; i < shown.length && !over; i++) {
      const kind = kinds[i]
      if (!kind) continue
      const abs = child(it.abs, shown[i].name)
      const rel = it.rel ? it.rel + '/' + shown[i].name : shown[i].name
      if (scope.levels.length && ignored(scope.levels, abs, shown[i].isDirectory())) continue // symlinks match as files (git)
      if (!add(kind === 'file' ? rel : rel + '/')) return
      if (kind === 'dir') (isProtected(abs) ? pq : q).push({ abs, rel, scope })
    }
  }

  function start(it: Item, prot: boolean) {
    active++
    const ls = () => readdir(it.abs, { withFileTypes: true })
    const p = opts.delayMs ? new Promise<void>((r) => setTimeout(r, opts.delayMs)).then(ls) : ls()
    if (prot) {
      const slot = { stuck: false }
      protectedRead = slot
      const release = () => {
        if (protectedRead === slot) protectedRead = null
        wakeAll()
      }
      p.then(release, release)
      read(p).then((o) => done(it, o, slot))
    } else read(p).then((o) => done(it, o, null))
  }
  async function done(it: Item, o: Outcome<Dirent[]>, slot: { stuck: boolean } | null) {
    try {
      if (over) return
      if ('timeout' in o) {
        wait(it.rel)
        if (slot) {
          slot.stuck = true
          wakeAll()
        }
      } else if ('err' in o) errors++
      else await visit(it, o.ok)
    } catch {
      errors++
    } finally {
      active--
      pump()
    }
  }

  let started = false // root queued (pump runs on wakes before that)
  function pump() {
    if (over || !started) return
    while (active < conc) {
      if (pq.length && !protectedRead) start(pq.shift()!, true)
      else if (q.length) start(q.shift()!, false)
      else break
    }
    if (protectedRead?.stuck)
      while (pq.length) wait(pq.shift()!.rel) // a prompt is pending: don't queue behind it
    if (!active && !q.length && !pq.length) finish()
  }

  wakers.add(pump)
  rootScope()
    .catch((): Scope => ({ repo: false, levels: [] }))
    .then((scope) => {
      if (over) return
      const it = { abs: root, rel: '', scope }
      ;(isProtected(root) ? pq : q).push(it)
      started = true
      pump()
    })

  return {
    stop() {
      if (over) return
      over = true
      clearTimeout(budget)
      if (flushTimer) clearTimeout(flushTimer)
      wakers.delete(pump)
    },
  }
}
