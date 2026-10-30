// Opening files: `tie add <path>` (kind by extension, else by content: text; missing / folder fail
// with exit 1), Finder drops on the board (markdown → tile there; a folder → modal; on a terminal:
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
    const ok = await cli('add', 'notes.md')
    h.assert(ok.code === 0 && /^t[a-z2-9]+$/.test(ok.out), `tie add notes.md: ${JSON.stringify(ok)}`)
    await shows(ok.out, 'Notes')
    const plain = await cli('add', 'plain.txt')
    h.assert(plain.code === 0 && (await h.tileOf(ctx, plain.out)).kind === 'text', `tie add plain.txt: text tile ${JSON.stringify(plain)}`)
    for (const [args, msg] of [
      [['add', 'missing.md'], `No such file: ${join(dir, 'missing.md')}`],
      [['add', '.'], `Not a file: ${dir}`],
      [['add', 'markdown'], 'markdown shows a file'],
    ]) {
      const r = await cli(...args)
      h.assert(r.code === 1 && r.err.includes(msg), `tie ${args.join(' ')}: ${JSON.stringify(r)}`)
    }
    h.assert((await cli('add', 'terminal')).code === 0, 'tie add terminal still opens a terminal')
    h.assert((await tiles()).length === 4, 'failures opened nothing')
    for (const t of await tiles()) await ctx.tie('close', '--tile', t.id)
    await h.waitFor(ctx, async () => !(await tiles()).length, 'board empty')

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

    // A folder (alone, and next to a markdown file): modal, only the file opens. Any other file: its
    // kind (text here).
    await h.osDrop(ctx, await h.sidePoint(ctx, m.id, 'r'), { files: [dir] })
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog-backdrop'), 'modal for a folder')
    h.assert((await ctx.page.textContent('.dialog p')) === `Not a file: ${dir}` && (await tiles()).length === 2, 'says why, opens nothing')
    await ctx.shot('not-a-file')
    await ctx.page.click('.dialog .ok')
    await h.osDrop(ctx, await h.sidePoint(ctx, m.id, 'r'), { files: [dir, md] })
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog-backdrop'), 'modal for mixed drop')
    await h.eventually(ctx, async () => h.assert((await mdTiles()).length === 3, 'markdown part opened'))
    await ctx.page.click('.dialog .ok')
    await h.osDrop(ctx, await h.sidePoint(ctx, m.id, 'r'), { files: [txt] })
    await h.waitFor(ctx, async () => (await tiles()).some((t) => t.kind === 'text'), 'text file dropped: text tile')
    for (const t of (await tiles()).filter((t) => t.kind === 'text')) await ctx.tie('close', '--tile', t.id)

    // Onto the shelf: shelved tile.
    const shelf = await h.boxOf(ctx, '#shelf')
    await h.osDrop(ctx, { x: shelf.x, y: shelf.box.y + shelf.box.height - 20 }, { files: [md] })
    await h.waitFor(ctx, async () => (await mdTiles()).some((t) => t.state === 'shelved'), 'shelved tile')

    // Onto a terminal: still pastes the path, no tile.
    const z = (await ctx.tie('add', 'terminal', '--cmd', 'zsh -f', '--at', m.id)).id
    await h.waitShell(ctx, z)
    const before = (await tiles()).length
    await h.osDrop(ctx, await h.sidePoint(ctx, z, 'c'), { files: [md] })
    await h.eventually(ctx, async () => h.assert((await h.screen(ctx, z)).includes(`'${md}'`) && (await tiles()).length === before, 'terminal drop pastes the path'))
    await ctx.tie('close', '--tile', z)

    // File template + picker: answered → tile there (markdown by extension); cancelled → nothing.
    const n = (await tiles()).length
    await h.pickNext(ctx, md2)
    await h.drag(ctx, await h.template(ctx, 'file'), await h.sidePoint(ctx, m.id, 'l'))
    const picked = await h.waitFor(ctx, async () => (await tiles()).length === n + 1 && (await mdTiles()).find((t) => t.active), 'picked file opens')
    await shows(picked.id, 'Other')
    await h.pickNext(ctx, null)
    await h.drag(ctx, await h.template(ctx, 'file'), await h.sidePoint(ctx, m.id, 'l'))
    await h.waitFor(ctx, async () => ctx.appLog().includes('picker (harness) cancel'), 'picker cancelled')
    await h.settle(ctx)
    h.assert((await tiles()).length === n + 1 && ctx.appLog().includes('picker (harness) cancel'), 'cancel: no tile')
    await ctx.shot('opened')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
