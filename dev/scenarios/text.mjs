// Text tiles: any UTF-8 file (by content: unknown extensions, no extension) with line numbers,
// highlighting by extension (small files), live updates that keep the view still with marked lines
// and `n`, cmd+R reload, CRLF, empty files, large files plain. Hidden window: real keys in the frame.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const hiddenWindow = true

export default async (ctx, h) => {
  const dir = join(process.cwd(), 'tmp', `text-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const code = join(dir, 'app.ts')
  let lines = Array.from({ length: 400 }, (_, i) => `const v${i} = ${i} // line ${i}`)
  const write = () => writeFileSync(code, lines.join('\n') + '\n')
  write()
  writeFileSync(join(dir, 'Makefile'), 'all:\n\techo hi\n')
  writeFileSync(join(dir, 'notes.weird'), 'line one\r\nline two\r\n')
  writeFileSync(join(dir, 'empty.txt'), '')
  writeFileSync(join(dir, 'big.js'), 'const a = 1\n'.repeat(60_000)) // 720 KB: over the highlight limit
  try {
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const view = (id) => h.contentFrame(ctx, id).then((f) => f.evaluate(() => ({ ...window.text, port: undefined, scrolls: undefined, marks: window.text.marks(), y: Math.round(scrollY), gutter: document.getElementById('gutter').textContent.split('\n').length })))
    const open = async (path, at = t0) => {
      const id = (await ctx.tie('open', path, '--at', at, '--side', 'r')).id
      await h.waitFor(ctx, () => view(id).then((v) => v.rev), `${path} shown`)
      return id
    }

    // Kind by content: .ts, Makefile, unknown extension, empty → text.
    const id = await open(code)
    const t = await h.tileOf(ctx, id)
    h.assert(t.kind === 'text' && t.title === 'app.ts' && !t.error, `text tile: ${JSON.stringify(t)}`)
    let v = await view(id)
    h.assert(v.lines === 400 && v.gutter === 400 && v.highlighted && v.lang === 'ts', `numbered, highlighted: ${JSON.stringify({ ...v, text: '' })}`)
    const fr = await h.contentFrame(ctx, id)
    h.assert((await fr.locator('#lines .hljs-keyword').count()) > 100, 'keywords colored')
    const mk = await open(join(dir, 'Makefile'), id)
    h.assert((await h.tileOf(ctx, mk)).kind === 'text' && (await view(mk)).lang === 'makefile', 'Makefile: text, makefile highlighting')
    const crlf = await open(join(dir, 'notes.weird'), mk)
    const cv = await h.contentFrame(ctx, crlf).then((f) => f.evaluate(() => document.getElementById('lines').innerText))
    h.assert((await view(crlf)).lines === 2 && !cv.includes('␍'), `CRLF: two lines, no visible CR: ${JSON.stringify(cv)}`)
    const empty = await open(join(dir, 'empty.txt'), crlf)
    h.assert((await view(empty)).lines === 0 && (await h.contentFrame(ctx, empty).then((f) => f.textContent('#empty'))) === '(empty file)', 'empty file says so')
    const big = await open(join(dir, 'big.js'), empty)
    v = await view(big)
    h.assert(v.lines === 60_000 && !v.highlighted, `large file: plain, all lines: ${v.lines}`)
    for (const x of [mk, crlf, empty, big]) await ctx.tie('close', x)
    await ctx.shot('text')

    // Live: lines inserted above the view; the view stays, inserted lines are marked; `n` jumps.
    await fr.evaluate(() => [...document.querySelectorAll('#lines > div')][200].scrollIntoView({ block: 'center' }))
    await ctx.sleep(200)
    const topOf = (n) => fr.evaluate((n) => [...document.querySelectorAll('#lines > div')].find((d) => d.textContent === `const v${n} = ${n} // line ${n}`)?.getBoundingClientRect().top, n)
    const y0 = await topOf(200)
    const rev0 = v.rev
    lines.splice(10, 0, '// inserted A', '// inserted B')
    lines[300] = 'const changed = true'
    write()
    await h.waitFor(ctx, () => view(id).then((x) => x.rev !== (rev0 ?? '') && x.lines === 402), 'live update')
    await ctx.sleep(200)
    v = await view(id)
    const y1 = await topOf(200)
    h.assert(Math.abs(y1 - y0) <= 2, `insert above: view still (${y0} → ${y1})`)
    h.assert(v.gutter === 402 && v.marks.marked === 3, `numbers follow, 3 lines marked: ${JSON.stringify(v.marks)}`)
    const changed = await fr.evaluate(() => [...document.querySelectorAll('#lines > .changed')].map((d) => d.textContent))
    h.assert(JSON.stringify(changed) === JSON.stringify(['// inserted A', '// inserted B', 'const changed = true']), `marked lines: ${changed}`)
    await h.clickIn(ctx, fr, '#lines > div:nth-child(200)')
    // Newest update first, document order within it: A (page top: B seen with it), then the changed line.
    for (let i = 0; i < 2; i++) await ctx.page.keyboard.press('n'), await ctx.sleep(200)
    const at = await fr.evaluate(() => [...document.querySelectorAll('#lines > div')].find((d) => d.textContent === 'const changed = true').getBoundingClientRect().top)
    h.assert(Math.abs(at - (await fr.evaluate(() => innerHeight / 3))) <= 4, `n ×2: second change at a third (${at})`)

    // Shift+Down: a third of the view.
    const s0 = (await view(id)).y
    await ctx.page.keyboard.press('Shift+ArrowDown')
    await ctx.sleep(200)
    const s1 = (await view(id)).y
    h.assert(s1 - s0 > 100, `shift+down scrolls (${s0} → ${s1})`)

    // cmd+R: re-read, rendered as a page (marks cleared), scroll kept.
    const r0 = (await view(id)).renders
    await h.press(ctx, 'Meta+r')
    await h.waitFor(ctx, () => view(id).then((x) => x.renders > r0), 'reload')
    v = await view(id)
    h.assert(v.marks.marked === 0 && Math.abs(v.y - s1) <= 2, `reload: marks cleared, scroll kept: ${JSON.stringify({ y: v.y, s1, marks: v.marks })}`)
    h.assert(!(await h.tileOf(ctx, id)).error, 'tile fine')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
