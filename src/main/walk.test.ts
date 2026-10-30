import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, mkdirSync, realpathSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { walkDir, excludesFileOf, type WalkChunk, type WalkOpts } from './walk'

// readdir of a directory named `hang` never answers in time (a TCC prompt), then fails late.
vi.mock('node:fs/promises', async (orig) => {
  const fs = await orig<typeof import('node:fs/promises')>()
  const readdir = ((p: string, o: unknown) =>
    String(p).endsWith('/hang') ? new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('late'), { code: 'EPERM' })), 700)) : fs.readdir(p, o as any)) as typeof fs.readdir
  return { ...fs, readdir }
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let dir: string
let home: string
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'tie-walk-')))
  home = join(dir, 'home') // fake home: no real git config, no real protected roots
  mkdirSync(home)
})
afterEach(() => {
  chmodSync(dir, 0o700)
  rmSync(dir, { recursive: true, force: true })
})

function tree(root: string, files: Record<string, string>) {
  for (const [p, text] of Object.entries(files)) {
    const f = join(root, p)
    if (p.endsWith('/')) mkdirSync(f, { recursive: true })
    else {
      mkdirSync(dirname(f), { recursive: true })
      writeFileSync(f, text)
    }
  }
}

function walk(root: string, opts: Partial<WalkOpts> = {}): Promise<{ paths: string[]; last: WalkChunk; chunks: WalkChunk[] }> {
  return new Promise((resolve) => {
    const chunks: WalkChunk[] = []
    walkDir(root, { gitignore: true, home, ...opts }, (c) => {
      chunks.push(c)
      if (c.done) resolve({ paths: chunks.flatMap((x) => x.paths).sort(), last: c, chunks })
    })
  })
}

// The research fixture (docs/2026-10-30-file-picker.md "Research"): git ls-files --cached --others
// --exclude-standard lists exactly these files.
const FIXTURE = {
  '.git/info/exclude': 'excluded.txt\n',
  '.git/HEAD': 'ref: refs/heads/master\n',
  '.gitignore': 'build/\n*.log\n!keep.log\nsecret*\n/rootonly.txt\n',
  'a.log': '',
  'keep.log': '',
  'build.txt': '',
  'a/b/c.ts': '',
  'excluded.txt': '',
  'secret.txt': '',
  'keepdir/': '',
  'logs/b.log': '',
  'rootonly.txt': '',
  'build/x.js': '',
  'local.txt': '',
  'sub/.gitignore': '!secret-ok.txt\nlocal.txt\n',
  'sub/excluded.txt': '',
  'sub/deep/z.md': '',
  'sub/rootonly.txt': '',
  'sub/build/y.js': '',
  'sub/secret-ok.txt': '',
  'sub/secret-no.txt': '',
  'sub/local.txt': '',
}
const GIT_FILES = ['a/b/c.ts', 'build.txt', 'keep.log', 'local.txt', 'sub/deep/z.md', 'sub/rootonly.txt', 'sub/secret-ok.txt']
const files = (paths: string[]) => paths.filter((p) => !p.endsWith('/'))

describe('walkDir', () => {
  it('lists files and dirs (trailing /), relative, POSIX; .git never, hidden only on request', async () => {
    tree(dir, { 'a.txt': '', 'd/b.txt': '', 'd/e/': '', '.hidden': '', '.dot/c.txt': '', '.git/HEAD': '' })
    expect((await walk(dir)).paths).toEqual(['a.txt', 'd/', 'd/b.txt', 'd/e/', 'home/'])
    expect((await walk(dir, { hidden: true })).paths).toEqual(['.dot/', '.dot/c.txt', '.hidden', 'a.txt', 'd/', 'd/b.txt', 'd/e/', 'home/'])
    const { last } = await walk(dir + '/')
    expect(last.done).toBe(true)
    expect(last.partial).toBeUndefined()
  })

  it('gitignore: stacked per directory, negation, dir-only, anchored, info/exclude (= git ls-files)', async () => {
    tree(dir, FIXTURE)
    const { paths } = await walk(dir)
    expect(files(paths)).toEqual(GIT_FILES)
    expect(paths).toContain('logs/') // the dir isn't ignored, its *.log is
    expect(paths).toContain('keepdir/')
    expect(paths).not.toContain('build/') // dir-only pattern
    expect(paths).not.toContain('sub/build/')
    expect(paths).toContain('build.txt') // `build/` matches dirs only
  })

  it('gitignore off: everything', async () => {
    tree(dir, FIXTURE)
    const { paths } = await walk(dir, { gitignore: false })
    expect(paths).toContain('build/x.js')
    expect(paths).toContain('sub/secret-no.txt')
    expect(paths).toContain('a.log')
  })

  it('rooted inside a repo: ancestor rules apply, anchored ones relative to their file', async () => {
    tree(dir, FIXTURE)
    const { paths } = await walk(join(dir, 'sub'))
    expect(files(paths)).toEqual(['deep/z.md', 'rootonly.txt', 'secret-ok.txt'])
  })

  it('rooted in an ignored directory (typed into): walked whole', async () => {
    tree(dir, FIXTURE)
    expect((await walk(join(dir, 'build'))).paths).toEqual(['x.js'])
  })

  it('nested repo resets the chain; no gitignore outside a repo', async () => {
    tree(dir, { 'r/.git/HEAD': '', 'r/.gitignore': '*.md\n', 'r/x.md': '', 'r/inner/.git/HEAD': '', 'r/inner/readme.md': '', 'r/inner/.gitignore': '*.txt\n', 'r/inner/a.txt': '', 'plain/.gitignore': '*\n', 'plain/f': '' })
    expect(files((await walk(join(dir, 'r'))).paths)).toEqual(['inner/readme.md'])
    expect((await walk(join(dir, 'plain'))).paths).toEqual(['f'])
  })

  it('global excludes: core.excludesFile from ~/.gitconfig, else ~/.config/git/ignore', async () => {
    tree(dir, { 'r/.git/HEAD': '', 'r/a.tmp': '', 'r/b.bak': '', 'r/c.txt': '' })
    tree(home, { '.config/git/ignore': '*.bak\n' })
    expect((await walk(join(dir, 'r'))).paths).toEqual(['a.tmp', 'c.txt'])
    tree(home, { '.gitconfig': '[user]\n  name = x\n[core]\n\texcludesFile = "~/my ignore" ; comment\n', 'my ignore': '*.tmp\n' })
    expect((await walk(join(dir, 'r'))).paths).toEqual(['b.bak', 'c.txt'])
    // info/exclude and .gitignore negations win over global excludes.
    tree(dir, { 'r/.gitignore': '!a.tmp\n' })
    expect((await walk(join(dir, 'r'))).paths).toEqual(['a.tmp', 'b.bak', 'c.txt'])
  })

  it('excludesFileOf parses [core] excludesFile', () => {
    expect(excludesFileOf('[core]\n  excludesfile = ~/.gi\n')).toBe('~/.gi')
    expect(excludesFileOf('[Core]\nExcludesFile="/a b/c" # x\n')).toBe('/a b/c')
    expect(excludesFileOf('[user]\nexcludesFile = no\n[core]\nautocrlf = false\n')).toBeNull()
    expect(excludesFileOf('[core] excludesFile = /x\n[core]\nexcludesFile = /y\n')).toBe('/y')
  })

  it('symlinks: dirs listed, never walked; files listed as files; broken skipped', async () => {
    tree(dir, { 'real/f.txt': '' })
    symlinkSync(join(dir, 'real'), join(dir, 'link'))
    symlinkSync('real/f.txt', join(dir, 'flink'))
    symlinkSync(join(dir, 'nope'), join(dir, 'broken'))
    const { paths } = await walk(dir, { gitignore: false })
    expect(paths).toEqual(['flink', 'home/', 'link/', 'real/', 'real/f.txt'])
  })

  it('entries cap → partial, exactly cap entries', async () => {
    tree(dir, Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`d/f${i}`, ''])))
    const { paths, last } = await walk(dir, { cap: 10 })
    expect(paths.length).toBe(10)
    expect(last.partial).toBe('entries')
  })

  it('chunks: at most chunkPaths each, last one done', async () => {
    tree(dir, Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`d${i % 3}/f${i}`, ''])))
    const { paths, chunks } = await walk(dir, { chunkPaths: 64 })
    expect(paths.length).toBe(304) // 300 files + d0/ d1/ d2/ + home/
    expect(chunks.every((c) => c.paths.length <= 64)).toBe(true)
    expect(chunks.filter((c) => c.done).length).toBe(1)
    expect(chunks.at(-1)!.done).toBe(true)
  })

  it('stop(): nothing emitted after', async () => {
    tree(dir, Object.fromEntries(Array.from({ length: 3000 }, (_, i) => [`d${i % 30}/e${i % 7}/f${i}`, ''])))
    const chunks: WalkChunk[] = []
    await new Promise<void>((resolve) => {
      const w = walkDir(dir, { gitignore: false, home, chunkPaths: 100 }, (c) => {
        chunks.push(c)
        w.stop()
        resolve()
      })
    })
    await sleep(200) // nothing happens: the walk would have emitted its other chunks by now
    expect(chunks.length).toBe(1)
    expect(chunks[0].done).toBe(false)
  })

  it('unreadable dirs: skipped, counted', async () => {
    tree(dir, { 'ok/a': '', 'locked/b': '' })
    chmodSync(join(dir, 'locked'), 0)
    const { paths, last } = await walk(dir, { gitignore: false })
    chmodSync(join(dir, 'locked'), 0o700)
    expect(paths).toEqual(['home/', 'locked/', 'ok/', 'ok/a'])
    expect(last.errors).toBe(1)
  })

  it('home: protected dirs and CloudStorage links listed, not walked; walked when rooted in them', async () => {
    tree(home, { 'Desktop/a': '', 'Documents/b': '', 'Library/CloudStorage/Drive/c': '', 'Google Drive/d': '', 'proj/e': '', 'Music/': '' })
    symlinkSync(join(home, 'Library/CloudStorage/Drive'), join(home, 'Drive'))
    symlinkSync(join(home, 'Documents/b'), join(home, 'blink')) // into a protected root: not even stat'ed
    expect((await walk(home)).paths).toEqual(['Desktop/', 'Documents/', 'Drive/', 'Google Drive/', 'Library/', 'Music/', 'proj/', 'proj/e'])
    expect((await walk(join(home, 'Documents'))).paths).toEqual(['b'])
    expect((await walk(join(home, 'Library'))).paths).toEqual(['CloudStorage/', 'CloudStorage/Drive/', 'CloudStorage/Drive/c'])
    // From above home: still fenced.
    expect((await walk(dir)).paths).toEqual(['home/', 'home/Desktop/', 'home/Documents/', 'home/Drive/', 'home/Google Drive/', 'home/Library/', 'home/Music/', 'home/proj/', 'home/proj/e'])
  })

  it('read timeout: dir dropped, reported waiting, walk goes on; late failure swallowed', async () => {
    tree(dir, { 'a/hang/x': '', 'b/y': '' })
    const t0 = Date.now()
    const { paths, last } = await walk(dir, { gitignore: false, readTimeoutMs: 100 })
    expect(Date.now() - t0).toBeLessThan(600)
    expect(paths).toEqual(['a/', 'a/hang/', 'b/', 'b/y', 'home/'])
    expect(last.waiting).toEqual(['a/hang'])
    await sleep(800) // the hung read fails now: must not surface as an unhandled rejection
  })

  it('protected root: a stuck read drops the other protected dirs to waiting', async () => {
    tree(home, { 'Documents/hang/x': '', 'Documents/p/q/r': '', 'Documents/s/t': '' })
    const { last } = await walk(join(home, 'Documents'), { readTimeoutMs: 100 })
    expect(last.waiting).toContain('hang')
    expect(last.done).toBe(true)
    await sleep(800) // let the hung read settle (frees the process-wide protected slot)
  })
})
