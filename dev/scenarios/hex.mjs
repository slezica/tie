// Hex tiles: binary files (by content) as offset | bytes | ASCII; virtualized rows (a 4 MB file keeps
// a few dozen rows in the DOM; scrolling to the end shows the last offset); live changes redrawn in
// place with changed rows highlighted; empty file; the hex template opens any file (a PNG too).
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export default async (ctx, h) => {
  const dir = join(process.cwd(), 'tmp', `hex-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const small = join(dir, 'small.bin')
  const bytes = Buffer.from([0x48, 0x69, 0x00, 0x3c, 0x62, 0x3e, 0x26, 0x7f, 0xff, ...Array(23).fill(0x41)]) // 32 bytes, NUL: binary
  writeFileSync(small, bytes)
  const big = join(dir, 'big.dat')
  const data = Buffer.alloc(4 * 1024 * 1024)
  for (let i = 0; i < data.length; i++) data[i] = i & 0xff
  data[0] = 0
  writeFileSync(big, data)
  try {
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const view = (id) => h.contentFrame(ctx, id).then((f) => f.evaluate(() => ({ size: window.hex.size, rev: window.hex.rev, first: window.hex.first, drawn: window.hex.drawn, changed: window.hex.changed, rows: [...document.querySelectorAll('.r')].map((r) => r.textContent), marked: document.querySelectorAll('.r.changed').length })))
    const open = async (path, at = t0) => {
      const id = (await ctx.tie('add', path, '--at', at, '--side', 'r')).id
      await h.waitFor(ctx, () => view(id).then((v) => v.rev), `${path} shown`)
      return id
    }

    // Small: exact dump; markup-looking bytes as text, non-printables as dots.
    const id = await open(small)
    h.assert((await h.tileOf(ctx, id)).kind === 'hex', 'binary → hex')
    let v = await view(id)
    h.assert(v.size === 32 && v.rows.length === 2, `two rows: ${JSON.stringify(v)}`)
    h.assert(v.rows[0] === '00000000  48 69 00 3c 62 3e 26 7f  ff 41 41 41 41 41 41 41  Hi.<b>&..AAAAAAA', `row 0: ${JSON.stringify(v.rows[0])}`)
    h.assert(v.rows[1].startsWith('00000010  41 41') && v.rows[1].endsWith('AAAAAAAAAAAAAAAA'), `row 1: ${v.rows[1]}`)
    const fr = await h.contentFrame(ctx, id)
    h.assert((await fr.evaluate(() => document.querySelectorAll('#rows b').length)) === 0, 'no markup from bytes')

    // Live: one byte changed → redrawn, that row highlighted (then fades).
    bytes[20] = 0x5a
    writeFileSync(small, bytes)
    await h.waitFor(ctx, () => view(id).then((x) => x.rev !== v.rev), 'live change')
    v = await view(id)
    h.assert(v.marked === 1 && v.rows[1].includes(' 5a ') && v.changed === 1, `changed row marked: ${JSON.stringify(v)}`)
    await h.waitFor(ctx, () => view(id).then((x) => x.marked === 0), 'highlight fades', 6000)

    // Big: few rows in the DOM; end of file reachable.
    const b = await open(big, id)
    v = await view(b)
    h.assert(v.size === data.length && v.drawn < 120, `virtualized: ${v.drawn} rows drawn`)
    const fb = await h.contentFrame(ctx, b)
    await fb.evaluate(() => scrollTo(0, document.scrollingElement.scrollHeight))
    await ctx.sleep(300)
    v = await view(b)
    const last = (data.length - 16).toString(16).padStart(8, '0')
    h.assert(v.rows.some((r) => r.startsWith(last)), `last row ${last} drawn: ${v.rows.at(-1)}`)
    await ctx.shot('hex')

    // Empty file (no extension → text); the file template on a binary file → hex.
    writeFileSync(join(dir, 'empty'), '')
    const e = (await ctx.tie('add', join(dir, 'empty'), '--at', b)).id
    h.assert((await h.tileOf(ctx, e)).kind === 'text', 'empty file: text')
    const n = (await h.list(ctx)).tiles.length
    writeFileSync(join(dir, 'png-bytes'), readFileSync(join(process.cwd(), 'build/icon.png')))
    await h.pickNext(ctx, join(dir, 'png-bytes'))
    await h.drag(ctx, await h.template(ctx, 'file'), await h.sidePoint(ctx, t0, 'b'))
    const p = await h.waitFor(ctx, async () => (await h.list(ctx)).tiles.find((x) => x.kind === 'hex' && x.title === 'png-bytes'), 'file template opens a binary as hex')
    h.assert((await view(p.id)).rows[0].startsWith('00000000  89 50 4e 47') && (await h.list(ctx)).tiles.length === n + 1, 'PNG bytes')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
