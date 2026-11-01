// Links in file views (DIRECTORIES.md): a tile opened beside inherits the source tile's cwd (not
// the target's folder); same-tile navigation switches root and title, never the cwd.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROOT } from '../lib.mjs'

export const hiddenWindow = true // real clicks into content frames

export default async (ctx, h) => {
  const R = realpathSync(mkdtempSync(join(tmpdir(), 'tie-cwdl-')))
  for (const d of ['one', 'two', 'docs', 'docs/sub']) mkdirSync(join(R, d))
  writeFileSync(join(R, 'docs', 'a.md'), '# A\n\n[to b](b.md) [to c](sub/c.md) [script](run.sh)\n')
  writeFileSync(join(R, 'docs', 'b.md'), '# B\n')
  writeFileSync(join(R, 'docs', 'sub', 'c.md'), '# C\n')
  writeFileSync(join(R, 'docs', 'run.sh'), 'echo hi\n')
  writeFileSync(join(R, 'docs', 'p.html'), '<!doctype html><title>p</title><a id="md" href="b.md" style="display:block;padding:20px">to b.md</a>')
  const tieIn = (dir, ...args) => {
    const env = { ...process.env, TIE_INSTANCE: ctx.instance }
    delete env.TIE_SOCKET
    delete env.TIE_TILE
    return JSON.parse(execFileSync(join(ROOT, 'bin/tie'), [...args, '--json'], { cwd: dir, env }).toString())
  }
  const ids = async () => new Set((await h.list(ctx)).tiles.map((t) => t.id))
  const added = (before, what) => h.waitFor(ctx, async () => (await h.list(ctx)).tiles.find((t) => !before.has(t.id)), what)
  try {
    const a = tieIn(join(R, 'one'), 'add', join(R, 'docs', 'a.md'), '--focus')
    const shows = (id, text) => h.waitFor(ctx, () => h.mdState(ctx, id).then((s) => s.text.startsWith(text)), `${id} shows ${text}`)
    await shows(a.id, 'A')
    const fr = () => h.contentFrame(ctx, a.id)

    // Cmd-click: a markdown tile beside, in a.md's tile cwd.
    let before = await ids()
    await h.clickIn(ctx, await fr(), 'a >> text=to b', { meta: true })
    const b = await added(before, 'cmd-click opens beside')
    await shows(b.id, 'B')
    h.assert(b.cwd === join(R, 'one'), `beside (same kind): source cwd (${b.cwd})`)
    await ctx.tie('close', '--tile', b.id)

    // Another kind: beside, same cwd.
    await ctx.tie('focus', '--tile', a.id)
    before = await ids()
    await h.clickIn(ctx, await fr(), 'a >> text=script')
    const t = await added(before, 'run.sh beside')
    h.assert(t.kind === 'text' && t.cwd === join(R, 'one'), `beside (other kind): source cwd (${t.kind} ${t.cwd})`)
    await ctx.tie('close', '--tile', t.id)

    // Plain click into another folder: same tile, title follows, cwd stays.
    await ctx.tie('focus', '--tile', a.id)
    await h.clickIn(ctx, await fr(), 'a >> text=to c')
    await shows(a.id, 'C')
    const a2 = await h.tileOf(ctx, a.id)
    h.assert(a2.cwd === join(R, 'one') && a2.title === h.tilde(join(R, 'docs', 'sub', 'c.md')), `same tile: cwd kept, title = path (${a2.cwd} ${a2.title})`)

    // Html link to markdown: beside, the html tile's cwd.
    const p = tieIn(join(R, 'two'), 'add', join(R, 'docs', 'p.html'), '--focus')
    const hf = await h.htmlFrame(ctx, p.id)
    before = await ids()
    await h.clickIn(ctx, hf, '#md')
    const m = await added(before, 'html → markdown beside')
    h.assert(m.kind === 'markdown' && m.cwd === join(R, 'two'), `html link beside: its cwd (${m.cwd})`)
  } finally {
    rmSync(R, { recursive: true, force: true })
  }
}
