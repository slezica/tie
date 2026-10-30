// File picker (cmd+O, file template): starts in the terminal's cwd, fuzzy rows (reti → tile.ts, marks), Enter opens, re-root on `/` and Backspace, gitignore on/off, Tab / Enter descend, arrows, Esc, "…" (native), template on a tab starts in its tile's cwd.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export default async (ctx, h) => {
  const R = realpathSync(mkdtempSync(join(tmpdir(), 'tie-picker-')))
  // A repo shaped like this one: .gitignore hides out/ (out/tile.ts would compete for `tile`).
  const files = ['src/renderer/tile.ts', 'src/renderer/tabs.ts', 'resources/bin/tie', 'docs/TILES.md', 'out/tile.ts']
  mkdirSync(join(R, '.git'), { recursive: true })
  writeFileSync(join(R, '.gitignore'), 'out/\n')
  for (const f of files) {
    mkdirSync(join(R, f, '..'), { recursive: true })
    writeFileSync(join(R, f), `// ${f}\n`)
  }
  try {
    const L = () => h.list(ctx)
    const ui = () => ctx.page.evaluate(() => ({
      text: document.getElementById('picker-input')?.value,
      rows: [...document.querySelectorAll('.picker-row')].map((r) => r.textContent),
      selected: document.querySelector('.picker-row.selected')?.textContent ?? null,
      marks: [...document.querySelectorAll('.picker-row.selected mark')].map((m) => m.textContent).join(''),
      status: document.getElementById('picker-status')?.textContent ?? '',
      focused: document.activeElement?.id,
    }))
    // Walk finished (no trailing …) with this status / these rows.
    const until = (pred, what) => h.waitFor(ctx, async () => { const u = await ui(); return !u.status.endsWith('…') && pred(u) && u }, what)
    const open = async (chord = 'Meta+o') => {
      await h.press(ctx, chord)
      await ctx.page.waitForSelector('#picker.shown')
    }
    const type = (s) => ctx.page.keyboard.type(s)
    const key = (k) => ctx.page.keyboard.press(k)
    const gone = () => ctx.page.waitForSelector('#picker', { state: 'detached' })

    // A terminal in the fixture root, active: cmd+O starts there.
    const a = (await L()).tiles[0].id
    const t = (await ctx.tie('add', 'terminal', '--cwd', R, '--at', a, '--side', 'r', '--focus')).id
    await h.waitShell(ctx, t)
    await h.waitActive(ctx, t)
    await open()
    let u = await until((u) => u.status === '4 files', 'root walked: 4 files (out/ ignored, dot files hidden)')
    h.assert(u.text === R + '/' && u.focused === 'picker-input', `prefix = the terminal's cwd, focused: ${JSON.stringify(u)}`)
    h.assert(!u.rows.some((r) => r.startsWith('out/')), `gitignore on: no out/ (${u.rows})`)
    // Empty query: shallowest first.
    h.assert(u.rows.slice(0, 3).sort().join() === 'docs/,resources/,src/', `empty query: top-level first (${u.rows})`)

    // reti → src/renderer/tile.ts on top, its matched chars marked.
    await type('reti')
    u = await until((u) => u.selected === 'src/renderer/tile.ts', 'reti: tile.ts selected')
    h.assert(u.rows[0] === 'src/renderer/tile.ts' && u.marks.toLowerCase() === 'reti', `top row + marks: ${JSON.stringify(u)}`)
    await ctx.shot('reti')
    await key('Enter')
    await gone()
    const x = await h.waitFor(ctx, async () => (await L()).tiles.find((x) => x.kind === 'text' && x.doc?.path === join(R, 'src/renderer/tile.ts')), 'tile.ts opened as text')
    let s = await ctx.tie('state')
    const row = (tree) => (tree.children ?? []).map((c) => c.id)
    h.assert(row(s.tree).join() === [a, t, x.id].join(), `right of the terminal: ${JSON.stringify(s.tree)}`)
    h.assert((await L()).active === x.id, 'new tile active')

    // `src/`: the walk re-roots (rows relative to src/); Backspace through the `/`: back to the root.
    await ctx.tie('focus', '--tile', t)
    await h.waitActive(ctx, t)
    await open()
    await until((u) => u.status === '4 files', 'root again')
    await type('src/')
    u = await until((u) => u.status === '2 files', 're-rooted at src/: 2 files')
    h.assert(u.text === R + '/src/' && u.rows.includes('renderer/tile.ts') && !u.rows.some((r) => r.startsWith('src/')), `rows relative to src/: ${u.rows}`)
    await key('Backspace')
    u = await until((u) => u.status === '4 files', 'Backspace through /: root')
    h.assert(u.text === R + '/src' && u.selected === 'src/', `query src, src/ on top: ${JSON.stringify(u)}`)
    // Enter on a dir row: the line descends into it.
    await key('Enter')
    u = await until((u) => u.status === '2 files' && u.text === R + '/src/', 'Enter on src/: descended')
    // Tab on a dir row descends; arrows move the selection.
    await type('rend')
    await until((u) => u.selected === 'renderer/', 'rend: renderer/ on top')
    await key('Tab')
    u = await until((u) => u.text === R + '/src/renderer/' && u.rows.length === 2, 'Tab: into renderer/')
    h.assert(u.rows.join() === 'tabs.ts,tile.ts' && u.selected === 'tabs.ts', `renderer rows: ${JSON.stringify(u)}`)
    await key('ArrowDown')
    h.assert((await ui()).selected === 'tile.ts', 'Down: next row')
    await key('ArrowUp')
    h.assert((await ui()).selected === 'tabs.ts', 'Up: back')
    // Tab on a file row: its directory (here: the same).
    await type('ta')
    await until((u) => u.selected === 'tabs.ts', 'ta: tabs.ts')
    await key('Tab')
    await until((u) => u.text === R + '/src/renderer/', 'Tab on a file: its parent dir')
    // Esc: nothing opened.
    const n = (await L()).tiles.length
    await key('Escape')
    await gone()
    await h.settle(ctx)
    h.assert((await L()).tiles.length === n && (await L()).active === t, 'Esc: nothing opened, focus back')

    // A typed path naming a file opens it even if the walk hides it (dot file).
    await open()
    await type('.gitignore')
    await key('Enter')
    await gone()
    const gi = await h.waitFor(ctx, async () => (await L()).tiles.find((x) => x.doc?.path === join(R, '.gitignore')), 'typed hidden path opened')
    await ctx.tie('close', '--tile', gi.id)
    // A typed path naming nothing, no rows: the status says so, the dialog stays.
    await ctx.tie('focus', '--tile', t)
    await h.waitActive(ctx, t)
    await open()
    await type('zzqx')
    await until((u) => u.rows.length === 0, 'no rows')
    await key('Enter')
    await h.waitFor(ctx, async () => (await ui()).status.includes('No such file'), 'missing: status error')
    await key('Escape')
    await gone()

    // Gitignore off (settings panel, Files): out/tile.ts listed.
    await ctx.page.evaluate(() => document.dispatchEvent(new CustomEvent('tie:settings')))
    await ctx.page.waitForSelector('.settings')
    await ctx.page.locator('nav button[data-page="files"]').click()
    await ctx.page.uncheck('#set-gitignore')
    await ctx.page.locator('.save').click()
    await ctx.page.waitForSelector('.settings', { state: 'detached' })
    await ctx.tie('focus', '--tile', t)
    await h.waitActive(ctx, t)
    await open()
    await type('tile')
    u = await until((u) => u.status === '5 files', 'gitignore off: 5 files')
    h.assert(u.rows.includes('out/tile.ts') && u.rows.includes('src/renderer/tile.ts'), `gitignore off: out/tile.ts listed (${u.rows})`)

    // "…": the native dialog (harness: answered by the dev socket), from the line's directory.
    const md = join(R, 'docs/TILES.md')
    await h.nativePickNext(ctx, md)
    await ctx.page.click('#picker-native')
    await gone()
    await h.waitFor(ctx, async () => (await L()).tiles.find((x) => x.kind === 'markdown' && x.doc?.path === md), '… → markdown tile')
    h.assert(ctx.appLog().includes('picker (harness)'), 'native dialog asked')

    // Templates onto a tab start in that tab's active tile's cwd (file: the picker; terminal: its shell).
    const t2 = (await ctx.tie('add', 'terminal', '--cwd', join(R, 'docs'), '--tab', 'new')).id
    const tab2 = (await h.tileOf(ctx, t2)).tab
    await ctx.tie('focus', '--tile', t2) // shown: its prompt draws
    await h.waitShell(ctx, t2)
    await ctx.tie('focus', '--tile', t)
    await h.waitFor(ctx, async () => (await L()).tab !== tab2, 'back to tab 1')
    h.assert((await L()).tab !== tab2, 'tab 2 not shown')
    const tabPoint = () => h.boxOf(ctx, `.tab[data-space="${tab2}"]`)
    // Tab titles follow the terminals' cwd (2 s poll): settled first, so no tab moves mid-drag.
    const titles = () => ctx.page.evaluate(() => [...document.querySelectorAll('.tab')].map((e) => e.textContent).join())
    await h.waitFor(ctx, async () => (await titles()) === `${R.split('/').pop()},docs`, 'tab titles = cwd basenames', 6000)
    await h.drag(ctx, await h.template(ctx, 'file'), await tabPoint())
    await ctx.page.waitForSelector('#picker')
    h.assert((await ui()).text === R + '/docs/', `file template on tab 2: picker in its cwd (${(await ui()).text})`)
    await h.pickCancel(ctx)
    await h.settle(ctx)
    h.assert((await L()).tab !== tab2, 'cancel: no switch')
    await h.drag(ctx, await h.template(ctx), await tabPoint())
    const nt = await h.waitFor(ctx, async () => { const l = await L(); return l.tab === tab2 && l.active !== t2 && l.tiles.find((x) => x.id === l.active && x.kind === 'terminal') }, 'terminal template on tab 2')
    await h.waitShell(ctx, nt.id)
    await type('clear; pwd\n')
    await h.waitText(ctx, nt.id, new RegExp(`${R.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/docs`))
  } finally {
    rmSync(R, { recursive: true, force: true })
  }
}
