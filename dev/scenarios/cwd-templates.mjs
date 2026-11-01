// Templates and OS drops inherit their context tile's cwd (DIRECTORIES.md): template → shelf (the
// active tile), → a file tile's edge (that tile), → empty board area (the active floating tile);
// the file template (picker start and the opened tile); an OS file drop beside a tile.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROOT } from '../lib.mjs'

export default async (ctx, h) => {
  const R = realpathSync(mkdtempSync(join(tmpdir(), 'tie-cwdt-')))
  for (const d of ['one', 'two', 'three', 'docs']) mkdirSync(join(R, d))
  const md = join(R, 'docs', 'a.md')
  writeFileSync(md, '# A\n')
  const tieIn = (dir, ...args) => {
    const env = { ...process.env, TIE_INSTANCE: ctx.instance }
    delete env.TIE_SOCKET
    delete env.TIE_TILE
    return JSON.parse(execFileSync(join(ROOT, 'bin/tie'), [...args, '--json'], { cwd: dir, env }).toString())
  }
  const ids = async () => new Set((await h.list(ctx)).tiles.map((t) => t.id))
  // The one tile not in `before`, once it exists.
  const added = (before, what) => h.waitFor(ctx, async () => (await h.list(ctx)).tiles.find((t) => !before.has(t.id)), what)
  try {
    // Template → shelf: the visible tab's active tile (a terminal in one/: its shell, fresh).
    const a = tieIn(join(R, 'one'), 'add', 'terminal', '--focus')
    await h.waitShell(ctx, a.id)
    let before = await ids()
    const shelf = await ctx.page.locator('#shelf').boundingBox()
    await h.drag(ctx, await h.template(ctx), { x: shelf.x + shelf.width - 4, y: shelf.y + shelf.height / 2 })
    const s = await added(before, 'template → shelf')
    h.assert(s.state === 'shelved' && s.kind === 'terminal' && s.cwd === join(R, 'one'), `template → shelf: cwd of the active tile (${s.state} ${s.cwd})`)

    // Template → a file tile's edge: that tile's cwd (inherited from its caller), not its folder.
    const m = tieIn(join(R, 'two'), 'add', md, '--focus')
    await h.waitFor(ctx, () => h.mdState(ctx, m.id).then((x) => x.text.startsWith('A')), 'a.md shown')
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
    const b = tieIn(join(R, 'three'), 'add', 'terminal', '--tab', 'new', '--focus')
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
