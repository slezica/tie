// tie open --replace (CLI.md): typed in a Tie terminal (a tile caller), the opened tile takes the
// terminal's place (slot, float, shelf index) with its state once tie exits; the terminal closes.
// Failures (busy shell, tie under another process, flag conflicts, external caller) open nothing.
import { join } from 'node:path'
import { ROOT, rpc } from '../lib.mjs'

export default async (ctx, h) => {
  const md = join(ROOT, 'dev/samples/markdown.md')
  const cmd = `tie open ${md} --replace`
  const L = () => h.list(ctx)
  const ids = async () => (await L()).tiles.map((t) => t.id).join(',')
  const has = async (id) => (await L()).tiles.some((t) => t.id === id)
  const terminal = async (...flags) => {
    const id = (await ctx.tie('open', 'terminal', ...flags)).id
    await ctx.sleep(900) // shell up, rc files done (their children would count as busy)
    return id
  }
  // Typed in the active terminal `old`; waits until it's gone: the one new tile is its replacement.
  const replace = async (old, line = cmd, during) => {
    const before = (await L()).tiles.map((t) => t.id)
    await ctx.page.keyboard.type(line + '\n')
    await during?.()
    await h.waitFor(ctx, async () => !(await has(old)), `${old} replaced`, 8000)
    await ctx.sleep(200)
    const added = (await L()).tiles.filter((t) => !before.includes(t.id))
    h.assert(added.length === 1 && added[0].kind === 'markdown', `one markdown tile added: ${JSON.stringify(added)}`)
    return added[0]
  }
  // Typed in the active terminal `old`: fails with `re`, opens nothing, `old` stays.
  let n = 0
  const fails = async (old, line, re) => {
    const before = await ids()
    const mark = `done${++n}`
    await ctx.page.keyboard.type(`${line}; echo ${mark}-$?\n`)
    const out = await h.waitFor(ctx, async () => {
      const s = await h.screen(ctx, old)
      return s.includes(`${mark}-1`) && s
    }, `${line}: exit 1`, 6000)
    h.assert(re.test(out), `${line}: error ${re}: ${out}`)
    await ctx.sleep(300)
    h.assert((await ids()) === before && (await has(old)), `${line}: nothing opened, terminal stays`)
  }
  await ctx.sleep(800)

  // External caller (the harness): no terminal of its own.
  const ext = await ctx.tie('open', md, '--replace').then(() => null, (e) => e.message)
  h.assert(/no terminal to replace/.test(ext ?? ''), `external: ${ext}`)
  // Clients can't call the internal replace method (it would close any tile).
  const a = (await L()).tiles[0].id
  const raw = await rpc(ctx.instance, 'replace', { old: a, id: a }).then(() => null, (e) => e.message)
  h.assert(/unknown method: replace/.test(raw ?? '') && (await has(a)), `client replace refused: ${raw}`)

  // Slotted, active: same rect, the new tile active (and has input).
  const b = await terminal()
  const ra = await h.rectOf(ctx, a)
  h.assert((await L()).active === a, 'a active')
  const na = await replace(a)
  h.assert(na.state === 'slotted' && JSON.stringify(na.rect) === JSON.stringify(ra), `slot kept: ${JSON.stringify(ra)} -> ${JSON.stringify(na.rect)}`)
  h.assert(na.active, 'new tile active (old was)')
  h.assert((await ctx.page.evaluate(() => document.activeElement?.closest('.tile')?.dataset.id)) === na.id, 'keys to the new tile')
  h.assert(!na.title.includes('replace') && na.icon === '', 'no custom title / icon')
  await ctx.shot('replace-slot')

  // Slotted, not active when tie exits: placed, input stays where it is.
  const c = await terminal()
  await ctx.tie('focus', b)
  const rb = await h.rectOf(ctx, b)
  const nb = await replace(b, `sleep 1.5; ${cmd}`, () => ctx.tie('focus', c))
  h.assert(JSON.stringify(nb.rect) === JSON.stringify(rb) && !nb.active && (await L()).active === c, `inactive: placed, c keeps input: ${JSON.stringify(nb)}`)

  // Floating: same rect.
  const f = await terminal('--float', '--focus')
  const rf = await h.rectOf(ctx, f)
  const nf = await replace(f)
  h.assert(nf.state === 'floating' && JSON.stringify(nf.rect) === JSON.stringify(rf) && nf.active, `float kept: ${JSON.stringify(rf)} -> ${JSON.stringify(nf)}`)

  // Shelved (pinned to type in it): same shelf index, pinned, active.
  const s0 = await terminal('--shelved')
  const s = await terminal('--shelved')
  const s1 = await terminal('--shelved')
  await ctx.tie('focus', s)
  await ctx.sleep(300)
  const idx = (await L()).shelf.indexOf(s)
  const ns = await replace(s)
  const ls = await L()
  h.assert(ns.state === 'shelved' && ls.shelf.indexOf(ns.id) === idx && ls.shelf.includes(s0) && ls.shelf.includes(s1), `shelf index kept: ${idx} -> ${JSON.stringify(ls.shelf)}`)
  h.assert(ns.pinned && ns.active, `pinned + active: ${JSON.stringify(ns)}`)
  await ctx.shot('replace-shelf')
  await ctx.tie('focus', c)

  // Failures, typed in c (idle shell, active).
  await ctx.sleep(300)
  await fails(c, `${cmd} --float`, /--replace takes no other placement/)
  await fails(c, `sh -c '${cmd} || exit 1; true'`, /tie runs under (sh|bash)/)
  await ctx.page.keyboard.type('sleep 100 &\n')
  await ctx.sleep(500)
  await fails(c, cmd, /A process is running: \S*sleep/)
  await ctx.page.keyboard.type('kill %1\n')
  await ctx.sleep(500)
  // Job gone: works again.
  const nc = await replace(c)
  h.assert(nc.active, 'replaced once idle')
  h.assert(/\[rpc\] replace /.test(ctx.appLog()), 'replace logged')
}
