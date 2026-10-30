// Security: doc:walk (picker directory walk) takes only absolute, normalized, existing directories
// and a numeric gen; streams chunks tagged by gen, gitignore on/off; stopWalk and a newer walk stop
// the previous one (nothing more arrives).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Each directory read starts 100 ms late (dev builds): stop / a newer walk land mid-walk, not after.
export const env = { TIE_WALK_DELAY: '100' }

export default async (ctx, h) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tie-sec-walk-')))
  try {
    // Small repo: .gitignore hides secret.log.
    const small = join(root, 'small')
    mkdirSync(join(small, '.git'), { recursive: true })
    writeFileSync(join(small, '.gitignore'), '*.log\n')
    for (const f of ['a.txt', 'b.md', 'secret.log']) writeFileSync(join(small, f), f)
    // Big tree: many chunks.
    const big = join(root, 'big')
    for (let d = 0; d < 30; d++) {
      mkdirSync(join(big, `d${d}`), { recursive: true })
      for (let i = 0; i < 100; i++) writeFileSync(join(big, `d${d}`, `f${i}.txt`), '')
    }

    await ctx.page.evaluate(() => {
      window.__walk = {}
      window.tie.doc.onWalkChunk((gen, chunk) => (window.__walk[gen] ??= []).push(chunk))
    })
    const walk = (dir, opts) => ctx.page.evaluate(([dir, opts]) => window.tie.doc.walk(dir, opts), [dir, opts])
    const chunks = (gen) => ctx.page.evaluate((gen) => window.__walk[gen] ?? [], gen)
    const done = (gen) => h.waitFor(ctx, async () => (await chunks(gen)).find((c) => c.done) && (await chunks(gen)), `walk ${gen} done`)
    const paths = (cs) => cs.flatMap((c) => c.paths)

    // Refused: relative, non-string, not normalized, a file, missing, bad gen.
    for (const [dir, what] of [
      ['tmp', 'relative'],
      [42, 'non-string'],
      [null, 'null'],
      [`${small}/../small`, 'not normalized'],
      [join(small, 'a.txt'), 'a file'],
      [join(root, 'nope'), 'missing'],
    ]) {
      const r = await walk(dir, { gen: 1, gitignore: true })
      h.assert(r && typeof r.error === 'string' && !r.ok, `${what} refused: ${JSON.stringify(r)}`)
    }
    for (const gen of ['1', 1.5, null, Infinity]) {
      const r = await walk(small, { gen, gitignore: true })
      h.assert(r && typeof r.error === 'string', `gen ${gen} refused`)
    }
    h.assert(typeof (await walk(small, null)).error === 'string', 'no options refused')

    // Gitignore on: ignored file absent; off: present.
    h.assert((await walk(small, { gen: 10, gitignore: true })).ok === true, 'walk accepted')
    const on = paths(await done(10)).sort()
    h.assert(JSON.stringify(on) === JSON.stringify(['a.txt', 'b.md']), `gitignore on: ${on}`)
    h.assert((await walk(small + '/', { gen: 11, gitignore: false })).ok, 'trailing slash accepted')
    const off = paths(await done(11)).sort()
    h.assert(JSON.stringify(off) === JSON.stringify(['a.txt', 'b.md', 'secret.log']), `gitignore off: ${off}`)

    // stopWalk on the first chunk (the root's 30 dirs; their reads are 100 ms away): nothing more.
    await ctx.page.evaluate((big) => {
      window.tie.doc.onWalkChunk((gen) => gen === 20 && window.tie.doc.stopWalk(20))
      return window.tie.doc.walk(big, { gen: 20, gitignore: false })
    }, big)
    await h.waitFor(ctx, async () => (await chunks(20)).length > 0, 'first chunk of walk 20')
    await ctx.sleep(600) // nothing happens: unstopped, the 30 dirs' files would arrive within ~250 ms
    const stopped = await chunks(20)
    h.assert(stopped.length === 1 && !stopped[0].done, `stopped walk: ${stopped.length} chunks, no done`)
    h.assert(paths(stopped).length === 30, `only the root's entries (${paths(stopped).length})`)

    // A newer walk stops the running one: gen 30 (started) never sends anything, gen 31 finishes.
    h.assert((await walk(big, { gen: 30, gitignore: false })).ok, 'walk 30 started')
    h.assert((await walk(small, { gen: 31, gitignore: true })).ok, 'walk 31 started')
    await done(31)
    await ctx.sleep(600) // nothing happens: gen 30 would have finished by now (~300 ms of delayed reads)
    h.assert((await chunks(30)).length === 0, 'superseded walk sent nothing')
    // Two asks racing (no await between): the later wins (the earlier is refused, or stopped).
    const race = await ctx.page.evaluate(([big, small]) => Promise.all([window.tie.doc.walk(big, { gen: 40, gitignore: false }), window.tie.doc.walk(small, { gen: 41, gitignore: true })]), [big, small])
    h.assert(race[1].ok, `racing walks: ${JSON.stringify(race)}`)
    await done(41)
    await ctx.sleep(600) // nothing happens: gen 40 would have finished by now
    h.assert((await chunks(40)).length === 0, `earlier racing walk sent nothing (${JSON.stringify(race[0])})`)

    // Logged with the dir marked untrusted.
    h.assert(/\[walk\] start 10 <untrusted>/.test(ctx.rawLog()), 'walk logged, dir untrusted')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
