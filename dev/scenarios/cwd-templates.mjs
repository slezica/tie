// Templates and OS drops inherit their context tile's cwd (DIRECTORIES.md): template → shelf (the
// active tile), → a file tile's edge (that tile), → empty board area (the active floating tile);
// the file template (picker start and the opened tile); an OS file drop beside a tile; template → a
// terminal's edge: its shell's cwd, read fresh (not the 2 s poll).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export default async (ctx, h) => {
  const R = realpathSync(mkdtempSync(join(tmpdir(), 'tie-cwdt-')))
  for (const d of ['one', 'two', 'three', 'docs']) mkdirSync(join(R, d))
  const md = join(R, 'docs', 'a.md')
  writeFileSync(md, '# A\n')
  const ids = async () => new Set((await h.list(ctx)).tiles.map((t) => t.id))
  // The one tile not in `before`, once it exists.
  const added = (before, what) => h.waitFor(ctx, async () => (await h.list(ctx)).tiles.find((t) => !before.has(t.id)), what)
  try {
    // Template → a terminal's edge right after a `cd`: the shell's cwd, read fresh (h.openFresh). Points
    // taken first; a bare drag (h.drag settles animations mid-drag: seconds under load, past the next poll).
    const t0 = (await h.list(ctx)).tiles[0].id
    await h.waitShell(ctx, t0)
    await h.waitActive(ctx, t0)
    const from = await h.template(ctx)
    const to = await h.sidePoint(ctx, t0, 'b')
    const drop = async () => {
      await ctx.page.mouse.move(from.x, from.y)
      await ctx.page.mouse.down()
      await ctx.page.mouse.move(to.x, to.y, { steps: 6 })
      await ctx.page.mouse.up()
    }
    const f0 = await h.openFresh(ctx, R, t0, drop, 'template next to a terminal')
    h.assert(f0.t.kind === 'terminal' && f0.t.cwd === f0.dir, `template: tile cwd ${f0.t.cwd} (want ${f0.dir})`)
    await h.waitActive(ctx, f0.t.id)
    await h.waitShell(ctx, f0.t.id)
    await ctx.page.keyboard.type('clear; pwd\n')
    await h.waitFor(ctx, async () => (await h.screen(ctx, f0.t.id)).startsWith(f0.dir + 'bash'), `${f0.t.id}: pwd = ${f0.dir}`)

    // Template → shelf: the visible tab's active tile (a terminal in one/: its shell, fresh).
    const a = await ctx.tieAt(join(R, 'one'), 'add', 'terminal', '--focus')
    await h.waitShell(ctx, a.id)
    let before = await ids()
    const shelf = await ctx.page.locator('#shelf').boundingBox()
    await h.drag(ctx, await h.template(ctx), { x: shelf.x + shelf.width - 4, y: shelf.y + shelf.height / 2 })
    const s = await added(before, 'template → shelf')
    h.assert(s.state === 'shelved' && s.kind === 'terminal' && s.cwd === join(R, 'one'), `template → shelf: cwd of the active tile (${s.state} ${s.cwd})`)

    // Template → a file tile's edge: that tile's cwd (inherited from its caller), not its folder.
    const m = await ctx.tieAt(join(R, 'two'), 'add', md, '--focus')
    await h.waitMd(ctx, m.id, 'A', 'a.md shown')
    before = await ids()
    await h.drag(ctx, await h.template(ctx), await h.sidePoint(ctx, m.id, 'b'))
    const t = await added(before, 'template → file tile edge')
    h.assert(t.kind === 'terminal' && t.cwd === join(R, 'two'), `template next to a file tile: its cwd (${t.cwd})`)

    // OS file drop beside the file tile: its cwd too (root: the file's folder, as always).
    before = await ids()
    await h.osDrop(ctx, await h.sidePoint(ctx, m.id, 'r'), { files: [md] })
    const d = await added(before, 'OS drop')
    h.assert(d.kind === 'markdown' && d.cwd === join(R, 'two') && d.doc.path === md, `OS drop beside: cwd ${d.cwd}`)

    // Template → empty board area: the tab's active tile (floating, in three/).
    const b = await ctx.tieAt(join(R, 'three'), 'add', 'terminal', '--tab', 'new', '--focus')
    await h.waitShell(ctx, b.id)
    await ctx.tie('move', '--tile', b.id, '--float')
    await h.waitFor(ctx, async () => !(await ctx.tie('state')).tree && (await h.list(ctx)).active === b.id, 'b floats, board empty')
    const board = (await h.list(ctx)).board
    before = await ids()
    await h.drag(ctx, await h.template(ctx), { x: board.x + 30, y: board.y + board.h - 30 })
    const c = await added(before, 'template → empty board')
    h.assert(c.kind === 'terminal' && c.state === 'slotted' && c.cwd === join(R, 'three'), `template → empty board: the active tile's cwd (${c.state} ${c.cwd})`)
    await h.waitShell(ctx, c.id)

    // File template next to a tile: picker from its cwd; the opened file tile takes it too.
    await h.drag(ctx, await h.template(ctx, 'file'), await h.sidePoint(ctx, c.id, 'r'))
    await ctx.page.waitForSelector('#picker')
    const line = await ctx.page.$eval('#picker-input', (e) => e.value)
    h.assert(line === h.tilde(join(R, 'three')) + '/', `file template: picker in the tile's cwd (${line})`)
    before = await ids()
    await h.pick(ctx, md)
    const f = await added(before, 'picked file opens')
    h.assert(f.kind === 'markdown' && f.cwd === join(R, 'three'), `picked file tile: the tile's cwd (${f.cwd})`)
  } finally {
    rmSync(R, { recursive: true, force: true })
  }
}
