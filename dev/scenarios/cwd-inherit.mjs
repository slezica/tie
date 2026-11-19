// Terminals divided from a terminal (cmd+D, template drop next to it) start in its current directory, read fresh (not the 2 s poll).
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export default async (ctx, h) => {
  const R = realpathSync(mkdtempSync(join(tmpdir(), 'tie-cwdi-')))
  let n = 0
  // A new directory under R: its name (typed relative, so the timed `cd` types fast) and path.
  const fresh = () => {
    const name = `d${n++}`
    mkdirSync(join(R, name))
    return { name, path: join(R, name) }
  }
  const stored = async (id) => (await h.tileOf(ctx, id)).cwd
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // The shell's own pwd (screen rows joined: a long path may wrap).
  const pwdIs = async (id, dir) => {
    await h.waitShell(ctx, id)
    await ctx.page.keyboard.type('clear; pwd\n')
    await h.waitFor(ctx, async () => (await h.screen(ctx, id)).startsWith(dir + 'bash'), `${id}: pwd = ${dir}`)
  }
  // The cd has run: the prompt is back after it.
  const cdDone = (id, typed) => h.waitText(ctx, id, new RegExp(`cd ${esc(typed)}[\\s\\S]*\\$\\s*$`))
  // The stored cwd (main's 2 s lsof poll) becomes `dir`. Returns the start of the last read that
  // still saw the old value: the poll's tick came no earlier than ~that (minus lsof's run time),
  // so the next one comes no earlier than 2 s later. null: already there at the first read.
  const polledAfter = async (id, dir) => {
    const end = Date.now() + 6000
    let prev = null
    while (Date.now() < end) {
      const t0 = Date.now()
      if ((await stored(id)) === dir) return prev
      prev = t0
      await ctx.sleep(10) // poll interval of this wait
    }
    throw new Error(`timed out: ${id} stored cwd ${dir}`)
  }
  // From terminal `from` (keys go to the active tile: `from` must be it), `open()` a terminal right
  // after a `cd`, and prove it took the shell's cwd fresh: the poll phase is pinned first (a `cd`
  // landing with a poll), the second `cd` follows at once, the stored cwd is still the first right
  // before `open()`, and the new tile exists before the next poll could have run (1.7 s: 300 ms
  // margin for lsof). Too slow (loaded machine): close it, again with fresh directories.
  const openFresh = async (from, open, what) => {
    for (let i = 0; i < 4; i++) {
      const old = fresh()
      const dir = fresh()
      await ctx.page.keyboard.type(`cd ${old.path}\n`)
      const since = await polledAfter(from, old.path)
      if (since === null) continue
      await ctx.page.keyboard.type(`cd ../${dir.name}\n`)
      await cdDone(from, `../${dir.name}`)
      if ((await stored(from)) !== old.path) continue // the next poll came already: no proof
      const before = new Set((await h.list(ctx)).tiles.map((t) => t.id))
      // Watched while `open()` runs (a drag settles its animations after the drop).
      const opening = open()
      const t = await h.waitFor(ctx, async () => (await h.list(ctx)).tiles.find((x) => !before.has(x.id)), what)
      const ms = Date.now() - since
      await opening
      ctx.log(`${what}: opened ${ms} ms after the poll${ms < 1700 ? '' : ': again'}`)
      if (ms < 1700) return { t, dir: dir.path }
      await ctx.tie('close', '--tile', t.id)
      await ctx.tie('focus', '--tile', from)
      await h.waitActive(ctx, from)
    }
    throw new Error(`${what}: no try fit between two polls`)
  }

  try {
    const a = (await h.list(ctx)).tiles[0].id
    await h.waitShell(ctx, a)
    await h.waitActive(ctx, a)
    const s1 = await openFresh(a, () => h.press(ctx, 'Meta+d'), 'cmd+D split')
    const b = s1.t.id
    h.assert(s1.t.kind === 'terminal' && s1.t.cwd === s1.dir, `cmd+D: tile cwd ${s1.t.cwd} (want ${s1.dir})`)
    await h.waitActive(ctx, b)
    await pwdIs(b, s1.dir)

    const s2 = await openFresh(b, () => h.spawnFromTemplate(ctx, b, 'b'), 'template next to b')
    const c = s2.t.id
    h.assert(s2.t.kind === 'terminal' && s2.t.cwd === s2.dir, `template: tile cwd ${s2.t.cwd} (want ${s2.dir})`)
    await h.waitActive(ctx, c)
    await pwdIs(c, s2.dir)
  } finally {
    rmSync(R, { recursive: true, force: true })
  }
}
