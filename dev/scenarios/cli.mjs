// tie CLI: argument handling (relative --cwd, --tile, set, aliases, flag spellings, float rect, escaping, ids).
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, rpc } from '../lib.mjs'

export default async (ctx, h) => {
  // Relative --cwd resolves against the caller's directory (CLI run from another directory, as
  // from a shell), not Tie's.
  const dir = join(ROOT, 'dev')
  const rel = (await ctx.tieAt(dir, 'add', 'terminal', '--cwd', '.', '--cmd', 'pwd -P; sleep 30')).id
  const pwd = await h.waitFor(ctx, async () => (await h.lines(ctx, rel))[0], 'pwd output', 10000)
  h.assert(pwd === realpathSync(dir), `relative --cwd: ${pwd}`)
  await ctx.tie('close', '--tile', rel)

  // Default placement (no --at): beside the active tile (external caller: no caller tile), along
  // its longer side (CLI.md "Placement"). Twice: the second splits the narrowed active tile.
  {
    const parentOf = (n, id) => {
      if (!n || n.type === 'leaf') return null
      const i = n.children.findIndex((c) => c.type === 'leaf' && c.id === id)
      return i >= 0 ? { n, i } : n.children.map((c) => parentOf(c, id)).find(Boolean) ?? null
    }
    const a0 = (await h.list(ctx)).active
    const added = []
    for (let k = 0; k < 2; k++) {
      const r = await h.rectOf(ctx, a0)
      const dir = r.h > r.w ? 'col' : 'row'
      const id = (await ctx.tie('add', 'terminal')).id
      added.push(id)
      const s = await ctx.tie('state')
      const p = parentOf(s.tree, id)
      h.assert(p && p.n.dir === dir && p.i > 0 && p.n.children[p.i - 1].id === a0, `bare add #${k + 1}: after ${a0} in a ${dir} split (${r.w}x${r.h}): ${JSON.stringify(s.tree)}`)
      h.assert(s.active === a0, `bare add #${k + 1}: input stays on ${a0}`)
    }
    h.assert((await h.list(ctx)).tiles.filter((t) => added.includes(t.id)).every((t) => t.state === 'slotted'), 'bare adds slotted')
    for (const id of added) await ctx.tie('close', '--tile', id)
  }

  // list: flags of background-tab tiles come from their own tab.
  const a = (await h.list(ctx)).tiles[0].id
  await ctx.tie('add', 'terminal', '--at', a, '--side', 'r')
  await h.clickButton(ctx, a, 'collapse')
  await h.press(ctx, 'Meta+t')
  const l = await h.waitFor(ctx, async () => { const l = await h.list(ctx); return l.tabs.length === 2 && l.tab === l.tabs[1].id && l }, 'cmd+T: new tab')
  const ta = l.tiles.find((t) => t.id === a)
  h.assert(ta.collapsed && ta.active === (l.tabs[0].active === a), `background tile flags: ${JSON.stringify(ta)}`)
  await h.press(ctx, 'Meta+1')
  await h.waitFor(ctx, async () => { const l = await h.list(ctx); return l.tab === l.tabs[0].id }, 'cmd+1: first tab')

  // move --float on a floating tile keeps its rect.
  const f = (await ctx.tie('add', 'terminal', '--float')).id
  const tp = await h.titlePoint(ctx, f)
  await h.drag(ctx, tp, { x: tp.x - 150, y: tp.y - 100 }, { shift: true })
  const r0 = await h.rectOf(ctx, f)
  await ctx.tie('move', '--tile', f, '--float')
  const r1 = await h.rectOf(ctx, f)
  h.assert(JSON.stringify(r0) === JSON.stringify(r1), `float rect kept: ${JSON.stringify(r0)} -> ${JSON.stringify(r1)}`)

  // --shelve and --shelved are interchangeable.
  h.assert((await ctx.tie('move', '--tile', f, '--shelved')).state === 'shelved', 'move --shelved')
  h.assert((await ctx.tie('add', 'terminal', '--shelve')).state === 'shelved', 'add --shelve')

  // move needs a placement; --at must name a board tile (f is shelved): refused, nothing added.
  h.assert((await h.tieError(ctx, 'move', '--tile', a))?.includes('move needs --at, --float, --shelve, --tab or --swap'), 'move without placement refused')
  h.assert((await h.tieError(ctx, 'move', '--tile', a, '--side', 'r'))?.includes('move needs --at'), 'move --side alone refused')
  const nBefore = (await h.list(ctx)).tiles.length
  h.assert((await h.tieError(ctx, 'move', '--tile', a, '--at', f))?.includes(`not on board: ${f}`), 'move --at a shelved tile refused')
  h.assert((await h.tieError(ctx, 'add', 'terminal', '--at', f))?.includes(`not on board: ${f}`), 'add --at a shelved tile refused')
  h.assert((await h.list(ctx)).tiles.length === nBefore, 'refused add: no tile')
  h.assert((await h.tileOf(ctx, f)).state === 'shelved', 'refused move: f still shelved')

  // set: title and icon in one call; "" restores the automatic one; one field leaves the other.
  const auto = (await h.tileOf(ctx, a)).title
  let r = await ctx.tie('set', '--tile', a, '--title', 'my build', '--icon', '🛠️')
  h.assert(r.title === 'my build' && r.icon === '🛠️', `set --title --icon: ${JSON.stringify(r)}`)
  r = await ctx.tie('s', '--tile', a, '--title', '')
  h.assert(r.title === auto && r.icon === '🛠️', `set --title "": automatic title, icon kept: ${JSON.stringify(r)}`)
  r = await ctx.tie('set', '--tile', a, '--icon', '')
  h.assert(r.icon === '', `set --icon "": automatic icon: ${JSON.stringify(r)}`)
  h.assert((await h.tieError(ctx, 'set', '--tile', a))?.includes('set needs --title or --icon'), 'set needs a field')
  h.assert((await h.tieError(ctx, 'title', a, 'x'))?.includes('unknown command: title'), 'title: gone')
  h.assert((await h.tieError(ctx, 'icon', a, 'x'))?.includes('unknown command: icon'), 'icon: gone')
  h.assert(await rpc(ctx.instance, 'title', { id: a, text: 'x' }).then(() => false, (e) => e.message === 'unknown method: title'), 'socket: no title method')

  // --tile replaces the positional id; external callers (the harness) have no current tile.
  h.assert((await h.tieError(ctx, 'ping', a))?.includes(`unexpected argument: ${a}`), 'positional id refused')
  h.assert((await h.tieError(ctx, 'close'))?.includes('no current tile: use --tile <id>'), 'no current tile')
  h.assert((await h.tieError(ctx, 'focus', '--tile', 'tzzzzzz'))?.includes('no such tile: tzzzzzz'), 'unknown --tile')
  // Dev builds: add --id names the new tile (harness); tile-shaped and free, else refused.
  const named = await ctx.tie('add', 'terminal', '--shelved', '--id', 'tnamed')
  h.assert(named.id === 'tnamed', `add --id: ${named.id}`)
  h.assert((await h.tieError(ctx, 'add', 'terminal', '--id', 'tnamed'))?.includes('id in use: tnamed'), 'add --id: taken refused')
  h.assert((await h.tieError(ctx, 'add', 'terminal', '--id', 's1'))?.includes('bad id: s1'), 'add --id: not tile-shaped refused')
  await ctx.tie('close', '--tile', 'tnamed')
  // Invalid arguments are refused everywhere: stray positionals, options of another command, unknown options.
  h.assert((await h.tieError(ctx, 'list', 'x'))?.includes('unexpected argument: x'), 'list: positional refused')
  h.assert((await h.tieError(ctx, 'add', 'terminal', 'x'))?.includes('unexpected argument: x'), 'add: extra positional refused')
  h.assert((await h.tieError(ctx, 'close', '--tile', a, '--clear'))?.includes('unknown option --clear for close'), 'close: option of another command refused')
  h.assert((await h.tieError(ctx, 'add', 'terminal', '--bogus', '1'))?.includes('unknown option --bogus for add'), 'add: unknown option refused')

  // add --icon, single-letter aliases (l a c), entropic ids.
  const ai = await ctx.tie('a', 'terminal', '--shelved', '--title', 'iconed', '--icon', '🧪')
  h.assert(ai.title === 'iconed' && ai.icon === '🧪', `add --title --icon: ${JSON.stringify(ai)}`)
  const ids = (await ctx.tie('l')).tiles.map((t) => t.id)
  h.assert(ids.includes(ai.id) && ids.every((x) => /^t[abcdefghijkmnpqrstuvwxyz23456789]{6}$/.test(x)), `ids: t + 6 base32: ${ids}`)
  h.assert((await ctx.tie('l')).tabs.every((t) => /^s[abcdefghijkmnpqrstuvwxyz23456789]{6}$/.test(t.id)), 'tab ids: s + 6 base32')
  await ctx.tie('c', '--tile', ai.id)
  h.assert(!(await h.list(ctx)).tiles.some((t) => t.id === ai.id), 'c = close')

  // Icons are text, never markup.
  await ctx.tie('set', '--tile', a, '--icon', '<b id=inj>x</b>')
  h.assert(!(await ctx.page.$('#inj')), 'icon not parsed as HTML')
  const shown = await ctx.page.$eval(`.tile[data-id="${a}"] .titlebar .icon`, (e) => e.textContent)
  h.assert(shown === '<b id=inj>x</b>', `icon shown literally: ${shown}`)

  // focus: switches to the tile's tab, expands it, gives it input.
  const tabsBefore = (await h.list(ctx)).tabs.length
  const [, fb] = await h.threeWaySplit(ctx)
  await h.clickButton(ctx, fb, 'collapse')
  await h.press(ctx, 'Meta+t')
  await h.waitFor(ctx, async () => (await h.list(ctx)).tabs.length === tabsBefore + 1, 'cmd+T: new tab')
  h.assert((await h.tileOf(ctx, fb)).collapsed && (await h.list(ctx)).tab !== (await h.tileOf(ctx, fb)).tab, 'before focus: fb collapsed, on a hidden tab')
  await ctx.tie('focus', '--tile', fb)
  await h.eventually(ctx, async () => {
    const fl = await h.list(ctx)
    const t = fl.tiles.find((x) => x.id === fb)
    h.assert(fl.tab === t.tab && fl.active === fb && !t.collapsed, 'focus: switched tab, expanded, active')
    h.assert(fl.tabs.length === tabsBefore + 1, 'tab count unchanged by focus')
  })

  // --help is the capability listing for agents: every command, kind and env var, in sections.
  {
    const help = execFileSync(join(ROOT, 'bin/tie'), ['--help']).toString()
    const want = ['USAGE', 'DESCRIPTION', 'TILE KINDS', 'TILE IDS', 'PLACEMENT', 'BEHAVIOR', 'OUTPUT AND EXIT STATUS', 'ENVIRONMENT', 'EXAMPLES']
    for (const w of [...want, 'tie list', 'tie add', 'tie close', 'tie move', '--tab', '--swap', 'tie focus', 'tie ping', 'tie set', '--tile', '--icon', 'Aliases', 'l list', 'p ping', 'terminal', 'markdown', '.md', 'text', 'image', '.png', '.svg', 'hex', 'html', '.html', 'browser', 'tie add|replace <url>', 'tie add browser', 'tie replace', 'http(s)', 'Downloads', 'Size limits', 'TIE_TILE', 'TIE_SOCKET', 'TIE_INSTANCE'])
      h.assert(help.includes(w), `help mentions ${w}`)
  }
}
