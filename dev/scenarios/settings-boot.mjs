// Saved settings apply at startup (regression: settings silently reset to defaults), each field sanitized
// on its own (out of range → clamped, wrong type → default); shell '' = the account's login shell.
import { execFileSync } from 'node:child_process'
import { userInfo } from 'node:os'

// Valid, non-default: theme, fontFamily, lineHeight, cellWidth, borderless. Out of range: fontSize. Wrong
// type: shell (string). Sanitize's other rules (wrong-type numbers, enums, booleans): src/core/settings.test.ts.
export const settings = { theme: 'nord', fontFamily: 'Menlo', fontSize: 200, lineHeight: 1.2, cellWidth: 95, shell: 5, borderless: true }

export default async (ctx, h) => {
  // Loaded: valid as saved, the others sanitized field by field.
  const s = (await ctx.page.evaluate(() => window.tie.settings.get())).settings
  const want = { theme: 'nord', fontFamily: 'Menlo', fontSize: 32, lineHeight: 1.2, cellWidth: 95, shell: '', borderless: true }
  for (const [k, v] of Object.entries(want)) h.assert(s[k] === v, `${k} loaded as ${JSON.stringify(v)}: ${JSON.stringify(s[k])}`)

  // Applied at boot, as loaded.
  h.assert((await h.cssVar(ctx, '--bg')) === '#2e3440', 'theme applied at boot')
  h.assert((await h.cssVar(ctx, '--tile-font-size')) === '32px', `font size applied at boot, clamped (${await h.cssVar(ctx, '--tile-font-size')})`)
  h.assert((await h.cssVar(ctx, '--tile-line-height')) === '1.2', `line height applied at boot (${await h.cssVar(ctx, '--tile-line-height')})`)
  const font = await ctx.page.evaluate(() => getComputedStyle(document.querySelector('.xterm-rows')).fontFamily)
  h.assert(font.startsWith('Menlo'), `font applied at boot (${font})`)
  // Cell width 95 %: the terminal's cells are narrower than the font's natural advance (letterSpacing
  // in device px, rounded: within a few percent of 95).
  const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
  const cell = await ctx.page.evaluate((id) => {
    const t = document.querySelector(`.tile[data-id="${id}"]`)
    const w = t.querySelector('.xterm-screen').getBoundingClientRect().width
    const c = document.createElement('canvas').getContext('2d')
    c.font = '32px Menlo'
    return { cell: w, natural: c.measureText('W').width }
  }, a)
  const cols = (await h.tileOf(ctx, a)).term.cols
  const ratio = cell.cell / cols / cell.natural
  ctx.log(`cell width ratio ${ratio.toFixed(3)}`)
  h.assert(ratio > 0.9 && ratio < 0.98, `cell width ~95 % of the font's (${(ratio * 100).toFixed(1)} %)`)
  // Borderless at boot: frameless window (square corners); tab bar at the left edge.
  h.assert(await ctx.page.evaluate(() => document.documentElement.classList.contains('borderless')), 'borderless at boot')

  // Login shell (TERMINALS.md "Spawn"): shell 5 → '' → the account's shell (userInfo, not $SHELL) with
  // -l; --cmd adds -i -c. Read from the process table: the argv the shell really got.
  const shell = userInfo().shell
  const argv = (pid) => execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim()
  const t = await h.waitShell(ctx, a)
  h.assert(t.term.pty && !t.error, `terminal started: ${JSON.stringify(t)}`)
  h.assert(argv(t.term.pid) === `${shell} -l`, `shell tile argv: ${argv(t.term.pid)} (want ${shell} -l)`)
  // `; :` keeps the shell itself alive while sleep runs (a lone last command may be exec'd in place).
  const c = (await ctx.tie('add', 'terminal', '--cmd', 'sleep 30; :')).id
  const pid = (await h.waitTile(ctx, c, (x) => x.term?.pid, 'cmd tile spawned')).term.pid
  h.assert(argv(pid) === `${shell} -l -i -c sleep 30; :`, `--cmd tile argv: ${argv(pid)}`)
  // A consistent grid at the clamped size.
  await h.assertPtySizes(ctx)
}
