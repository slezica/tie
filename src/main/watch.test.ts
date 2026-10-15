import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, renameSync, rmSync, symlinkSync, mkdirSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { watchFile, revision, readStable, type WatchEvent, type Watch } from './watch'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(cond: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !cond(); t += 20) await sleep(20)
  return cond()
}

let dir: string
let w: Watch | null
let events: WatchEvent[]
const texts = () => events.map((e) => (e.type === 'change' ? e.buf.toString() : '<missing>'))
const start = (path: string, text: string, opts = {}) => {
  events = []
  w = watchFile(path, revision(text), (e) => events.push(e), { poll: 60_000, ...opts }) // poll off: events must come from fs.watch
  return sleep(150) // watchers armed
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'tie-watch-')))
  w = null
})
afterEach(() => {
  w?.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('revision', () => {
  it('short stable hash of the bytes', () => {
    expect(revision('a')).toMatch(/^[0-9a-f]{16}$/)
    expect(revision('a')).toBe(revision(Buffer.from('a')))
    expect(revision('a')).not.toBe(revision('b'))
  })
})

describe('readStable', () => {
  it('reads files, reports what else it found', async () => {
    const f = join(dir, 'a.md')
    writeFileSync(f, 'hi')
    const r = await readStable(f)
    expect('buf' in r && r.buf.toString()).toBe('hi')
    expect(await readStable(join(dir, 'nope.md'))).toEqual({ error: 'missing' })
    expect(await readStable(dir)).toEqual({ error: 'not a file' })
  })
})

describe('watchFile', () => {
  it('in-place writes', async () => {
    const f = join(dir, 'a.md')
    writeFileSync(f, 'one')
    await start(f, 'one')
    writeFileSync(f, 'two')
    expect(await until(() => texts().includes('two'))).toBe(true)
    writeFileSync(f, 'two') // same content: no event
    await sleep(400)
    expect(texts()).toEqual(['two'])
  })

  it('temp + rename (atomic writers)', async () => {
    const f = join(dir, 'a.md')
    writeFileSync(f, 'one')
    await start(f, 'one')
    writeFileSync(join(dir, '.a.md.tmp'), 'two')
    renameSync(join(dir, '.a.md.tmp'), f)
    expect(await until(() => texts().includes('two'))).toBe(true)
    writeFileSync(join(dir, '.a.md.tmp'), 'three')
    renameSync(join(dir, '.a.md.tmp'), f)
    expect(await until(() => texts().includes('three'))).toBe(true)
  })

  it('backup rename + new file (vim): never reported missing', async () => {
    const f = join(dir, 'a.md')
    writeFileSync(f, 'one')
    await start(f, 'one')
    renameSync(f, f + '~')
    await sleep(6)
    writeFileSync(f, 'two')
    rmSync(f + '~')
    expect(await until(() => texts().includes('two'))).toBe(true)
    await sleep(400)
    expect(texts()).toEqual(['two'])
  })

  it('deleted: missing once, then back when recreated', async () => {
    const f = join(dir, 'a.md')
    writeFileSync(f, 'one')
    await start(f, 'one')
    rmSync(f)
    expect(await until(() => texts().includes('<missing>'))).toBe(true)
    await sleep(300)
    expect(texts()).toEqual(['<missing>'])
    writeFileSync(f, 'one') // same content as before: still reported (it came back)
    expect(await until(() => texts().length === 2)).toBe(true)
    expect(texts()).toEqual(['<missing>', 'one'])
  })

  it('symlinked path: writes to the real file in another directory', async () => {
    mkdirSync(join(dir, 'real'))
    const real = join(dir, 'real', 'doc.md')
    writeFileSync(real, 'one')
    const link = join(dir, 'link.md')
    symlinkSync(real, link)
    await start(link, 'one')
    writeFileSync(join(dir, 'real', '.tmp'), 'two')
    renameSync(join(dir, 'real', '.tmp'), real)
    expect(await until(() => texts().includes('two'))).toBe(true)
  })

  it('debounces bursts', async () => {
    const f = join(dir, 'a.md')
    writeFileSync(f, '0')
    await start(f, '0')
    for (let i = 1; i <= 20; i++) {
      writeFileSync(f, String(i))
      await sleep(5)
    }
    expect(await until(() => texts().at(-1) === '20')).toBe(true)
    expect(events.length).toBeLessThanOrEqual(3)
  })

  it('directory removed and recreated: re-armed (poll)', async () => {
    const sub = join(dir, 'sub')
    mkdirSync(sub)
    const f = join(sub, 'a.md')
    writeFileSync(f, 'one')
    await start(f, 'one', { poll: 200 })
    rmSync(sub, { recursive: true })
    expect(await until(() => texts().includes('<missing>'))).toBe(true)
    mkdirSync(sub)
    writeFileSync(f, 'two')
    expect(await until(() => texts().includes('two'))).toBe(true)
    await sleep(400) // re-armed: the next write comes through
    writeFileSync(f, 'three')
    expect(await until(() => texts().includes('three'))).toBe(true)
  })

  it('closed: silent', async () => {
    const f = join(dir, 'a.md')
    writeFileSync(f, 'one')
    await start(f, 'one')
    w!.close()
    writeFileSync(f, 'two')
    await sleep(400)
    expect(events).toEqual([])
  })
})
