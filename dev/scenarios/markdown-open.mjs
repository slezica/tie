// Opening files: `tie open <path>` (viewer by extension; unsupported / missing / folder fail with
// exit 1), Finder drops on the board (markdown → tile there; unsupported → modal; on a terminal:
// still the path), shelf template + file picker (harness stub: dev socket `pick`).
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { join } from 'node:path'

export default async (ctx, h) => {
  const dir = join(process.cwd(), 'tmp', `mdopen-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const md = join(dir, 'notes.md')
  const md2 = join(dir, 'Other.MARKDOWN')
  const txt = join(dir, 'plain.txt')
  writeFileSync(md, '# Notes\n')
  writeFileSync(md2, '# Other\n')
  writeFileSync(txt, 'plain\n')
  // bin/tie as a user runs it: exit code + stderr.
  const cli = (...args) =>
    new Promise((r) => {
      const env = { ...process.env, TIE_INSTANCE: ctx.instance }
      delete env.TIE_SOCKET
      delete env.TIE_TILE
      execFile(join(process.cwd(), 'bin/tie'), args, { env, cwd: dir }, (err, stdout, stderr) => r({ code: err?.code ?? 0, out: stdout.trim(), err: stderr.trim() }))
    })
  const tiles = async () => (await h.list(ctx)).tiles
  const mdTiles = async () => (await tiles()).filter((t) => t.kind === 'markdown')
  const shows = (id, title) => h.waitFor(ctx, () => h.mdState(ctx, id).then((s) => s.text.startsWith(title)), `${id} shows ${title}`)
  try {
    // CLI: path relative to the caller's cwd; kind names keep working; failures exit 1.
    const ok = await cli('open', 'notes.md')
    h.assert(ok.code === 0 && /^t\d+$/.test(ok.out), `tie open notes.md: ${JSON.stringify(ok)}`)
    await shows(ok.out, 'Notes')
    for (const [args, msg] of [
      [['open', 'plain.txt'], 'No viewer for .txt'],
      [['open', 'missing.md'], `No such file: ${join(dir, 'missing.md')}`],
      [['open', '.'], `Not a file: ${dir}`],
      [['open', 'markdown'], 'markdown shows a file'],
    ]) {
      const r = await cli(...args)
      h.assert(r.code === 1 && r.err.includes(msg), `tie ${args.join(' ')}: ${JSON.stringify(r)}`)
    }
    h.assert((await cli('open', 'terminal')).code === 0, 'tie open terminal still opens a terminal')
    h.assert((await tiles()).length === 3, 'failures opened nothing')
    for (const t of await tiles()) await ctx.tie('close', t.id)
    await ctx.sleep(200)

    // Finder drop on the empty board: root tile.
    await h.osDrop(ctx, await h.boardCenter(ctx), { files: [md] })
    let m = await h.waitFor(ctx, async () => (await mdTiles())[0], 'dropped on empty board')
    h.assert(m.state === 'slotted', 'root slot')
    await shows(m.id, 'Notes')

    // Onto a markdown tile (title bar, then content): beside it, on the nearest edge.
    await h.osDrop(ctx, await h.sidePoint(ctx, m.id, 'b'), { files: [md2] })
    const m2 = await h.waitFor(ctx, async () => (await mdTiles()).find((t) => t.id !== m.id), 'dropped on markdown content')
    await shows(m2.id, 'Other')
    const r1 = await h.rectOf(ctx, m.id)
    const r2 = await h.rectOf(ctx, m2.id)
    h.assert(r2.y > r1.y && Math.abs(r2.x - r1.x) < 2, `bottom edge → below: ${JSON.stringify([r1, r2])}`)

    // Unsupported (alone, and next to a markdown file): modal, only the markdown one opens.
    await h.osDrop(ctx, await h.sidePoint(ctx, m.id, 'r'), { files: [txt] })
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog-backdrop'), 'modal for unsupported')
    h.assert((await ctx.page.textContent('.dialog p')) === 'No viewer for .txt' && (await tiles()).length === 2, 'says why, opens nothing')
    await ctx.shot('no-viewer')
    await ctx.page.click('.dialog .ok')
    await h.osDrop(ctx, await h.sidePoint(ctx, m.id, 'r'), { files: [txt, md] })
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog-backdrop'), 'modal for mixed drop')
    h.assert((await mdTiles()).length === 3, 'markdown part opened')
    await ctx.page.click('.dialog .ok')

    // Onto the shelf: shelved tile.
    const shelf = await h.boxOf(ctx, '#shelf')
    await h.osDrop(ctx, { x: shelf.x, y: shelf.box.y + shelf.box.height - 20 }, { files: [md] })
    await h.waitFor(ctx, async () => (await mdTiles()).some((t) => t.state === 'shelved'), 'shelved tile')

    // Onto a terminal: still pastes the path, no tile.
    const z = (await ctx.tie('open', 'terminal', '--cmd', 'zsh -f', '--at', m.id)).id
    await ctx.sleep(800)
    const before = (await tiles()).length
    await h.osDrop(ctx, await h.sidePoint(ctx, z, 'c'), { files: [md] })
    h.assert((await h.screen(ctx, z)).includes(`'${md}'`) && (await tiles()).length === before, 'terminal drop pastes the path')
    await ctx.tie('close', z)

    // Template + picker: answered → tile there; cancelled → nothing.
    const n = (await tiles()).length
    await h.pickNext(ctx, md2)
    await h.drag(ctx, await h.template(ctx, 'markdown'), await h.sidePoint(ctx, m.id, 'l'))
    const picked = await h.waitFor(ctx, async () => (await tiles()).length === n + 1 && (await mdTiles()).find((t) => t.active), 'picked file opens')
    await shows(picked.id, 'Other')
    await h.pickNext(ctx, null)
    await h.drag(ctx, await h.template(ctx, 'markdown'), await h.sidePoint(ctx, m.id, 'l'))
    await ctx.sleep(500)
    h.assert((await tiles()).length === n + 1 && ctx.appLog().includes('picker (harness) cancel'), 'cancel: no tile')
    await ctx.shot('opened')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
