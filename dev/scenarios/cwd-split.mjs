// Tile cwd (DIRECTORIES.md) per kind: `tie add` stores the caller's cwd on every kind (root stays the
// file's folder); titles (file / html: path, browser: host + path, tab: cwd basename); cmd+D from a
// file / html / browser tile → a terminal in that tile's cwd; cmd+O from a browser → picker there; cmd+D
// from a terminal → its shell's cwd, read fresh (not the 2 s poll).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { ROOT } from '../lib.mjs'

export default async (ctx, h) => {
  const R = realpathSync(mkdtempSync(join(tmpdir(), 'tie-cwd-')))
  for (const d of ['one', 'two', 'three', 'docs']) mkdirSync(join(R, d))
  writeFileSync(join(R, 'docs', 'a.md'), '# A\n')
  writeFileSync(join(R, 'docs', 'p.html'), '<!doctype html><title>P</title><h1>P</h1>')
  const s = await h.site(ctx, (path) => (path === '/x/y/' ? '<!doctype html><title>Y</title><h1>y</h1>' : null))
  // bin/tie run from `dir` (the caller's cwd), outside any tile.
  const tabTitle = async () => { const l = await h.list(ctx); return l.tabs.find((t) => t.id === l.tab).title }
  // cmd+D on the active tile: a new terminal, its cwd and its shell's pwd.
  const split = async (from, dir) => {
    await h.press(ctx, 'Meta+d')
    const t = await h.waitFor(ctx, async () => { const l = await h.list(ctx); return l.active !== from && l.tiles.find((x) => x.id === l.active) }, `split from ${from}`)
    h.assert(t.kind === 'terminal' && t.cwd === dir, `split from ${from}: terminal in ${dir} (got ${t.kind} ${t.cwd})`)
    await h.waitShell(ctx, t.id)
    await ctx.page.keyboard.type('clear; pwd\n')
    await h.waitFor(ctx, async () => (await h.screen(ctx, t.id)).startsWith(dir + 'bash'), `${t.id}: pwd = ${dir}`) // rows joined (narrow tiles wrap the path)
    await ctx.tie('close', '--tile', t.id)
  }
  try {
    // tie add <file> from one/: cwd = the caller's, root = the file's folder (relative links work).
    const f = await ctx.tieAt(join(R, 'one'), 'add', '../docs/a.md', '--focus')
    h.assert(f.kind === 'markdown' && f.cwd === join(R, 'one'), `file tile: cwd = caller's (${f.cwd})`)
    h.assert(f.title === h.tilde(join(R, 'docs', 'a.md')), `file tile title = its path (${f.title})`)
    await h.waitMd(ctx, f.id, 'A', 'a.md shown')
    h.assert((await tabTitle()) === 'one', `tab title = the active file tile's cwd (${await tabTitle()})`)
    await split(f.id, join(R, 'one'))

    // Html: same.
    const p = await ctx.tieAt(join(R, 'two'), 'add', join(R, 'docs', 'p.html'), '--focus')
    h.assert(p.kind === 'html' && p.cwd === join(R, 'two') && p.title === h.tilde(join(R, 'docs', 'p.html')), `html tile: ${p.cwd} ${p.title}`)
    await h.htmlFrame(ctx, p.id)
    h.assert((await tabTitle()) === 'two', `tab title = the html tile's cwd (${await tabTitle()})`)
    await split(p.id, join(R, 'two'))

    // Browser: title = host + path (no scheme, no trailing /); tab = its cwd.
    const b = await ctx.tieAt(join(R, 'three'), 'add', s.url + '/x/y/', '--focus')
    h.assert(b.kind === 'browser' && b.cwd === join(R, 'three'), `browser tile: cwd ${b.cwd}`)
    await h.waitTile(ctx, b.id, (t) => t.web.title === 'Y', 'page loaded')
    h.assert((await h.tileOf(ctx, b.id)).title === s.url.replace('http://', '') + '/x/y', `browser title: ${(await h.tileOf(ctx, b.id)).title}`)
    h.assert((await tabTitle()) === 'three', `tab title = the browser tile's cwd (${await tabTitle()})`)
    await split(b.id, join(R, 'three'))

    // cmd+O from the browser: the picker starts in its cwd.
    await ctx.tie('focus', '--tile', b.id)
    await h.waitActive(ctx, b.id)
    await h.press(ctx, 'Meta+o')
    await ctx.page.waitForSelector('#picker')
    const line = await ctx.page.$eval('#picker-input', (e) => e.value)
    h.assert(line === h.tilde(join(R, 'three')) + '/', `cmd+O from a browser: picker in its cwd (${line})`)
    await h.pickCancel(ctx)

    // A shell `cd`: the terminal's cwd and its tab title follow (poll).
    const t = await ctx.tieAt(join(R, 'one'), 'add', 'terminal', '--tab', 'new', '--focus')
    await h.waitShell(ctx, t.id)
    h.assert((await tabTitle()) === 'one', `new tab from one/: ${await tabTitle()}`)
    await ctx.page.keyboard.type(`cd ${join(R, 'two')}\n`)
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, t.id)).cwd === join(R, 'two'), 'cd: tile cwd follows', 6000)
    await h.waitFor(ctx, async () => (await tabTitle()) === basename(join(R, 'two')), 'cd: tab title follows')

    // Tiles from nothing (cmd+T, `+`): the app cwd (`S.cwd` = TIE_CWD: the repo here), never the
    // active tile's (DIRECTORIES.md 3; t is active, in two/).
    for (const how of ['cmd+T', '+']) {
      await ctx.tie('focus', '--tile', t.id)
      await h.waitActive(ctx, t.id)
      const tab = (await h.list(ctx)).tab
      if (how === 'cmd+T') await h.press(ctx, 'Meta+t')
      else await ctx.page.click('#tab-add')
      const n = await h.waitFor(ctx, async () => { const l = await h.list(ctx); return l.tab !== tab && l.tiles.find((x) => x.tab === l.tab) }, `${how}: new tab with a terminal`)
      h.assert(n.kind === 'terminal' && n.cwd === ROOT, `${how}: app cwd ${ROOT} (got ${n.kind} ${n.cwd})`)
      await h.waitShell(ctx, n.id)
    }

    // cmd+D from a terminal right after a `cd`: the shell's cwd, read fresh (h.openFresh).
    const a = (await h.list(ctx)).active
    await h.waitActive(ctx, a)
    const s1 = await h.openFresh(ctx, R, a, () => h.press(ctx, 'Meta+d'), 'cmd+D split')
    h.assert(s1.t.kind === 'terminal' && s1.t.cwd === s1.dir, `cmd+D: tile cwd ${s1.t.cwd} (want ${s1.dir})`)
    await h.waitActive(ctx, s1.t.id)
    await h.waitShell(ctx, s1.t.id)
    await ctx.page.keyboard.type('clear; pwd\n')
    await h.waitFor(ctx, async () => (await h.screen(ctx, s1.t.id)).startsWith(s1.dir + 'bash'), `${s1.t.id}: pwd = ${s1.dir}`)
  } finally {
    await s.close()
    rmSync(R, { recursive: true, force: true })
  }
}
