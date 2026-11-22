// `tie-dev css-changes` (HARNESS.md "CSS changes") against this instance: no edit → "no changes" (base = working tree; the sheet read as UTF-8: `@charset`, nothing to repair); a rule changed through CDP from a second session (as a devtools edit; one with a non-ASCII char) → exactly that delta as a unified diff, git-style paths, the selector in its context; a rule added in an inspector sheet listed apart; the instance's sheets untouched by the command (read-only).
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { ROOT } from '../lib.mjs'

export default async (ctx, h) => {
  const run = () => {
    const r = spawnSync(`${ROOT}/bin/tie-dev`, ['--instance', ctx.instance, 'css-changes'], { encoding: 'utf8', env: { ...process.env, TIE_TILE: '' } })
    return { code: r.status, out: r.stdout, err: r.stderr }
  }
  const cdp = await ctx.page.context().newCDPSession(ctx.page)
  const headers = []
  cdp.on('CSS.styleSheetAdded', (e) => headers.push(e.header))
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const ui = headers.find((x) => /^tie:\/\/app\/assets\/index-.*\.css$/.test(x.sourceURL))
  h.assert(ui, `UI sheet found (${headers.map((x) => x.sourceURL)})`)
  const text = async () => (await cdp.send('CSS.getStyleSheetText', { styleSheetId: ui.styleSheetId })).text
  const before = await text()

  // No edit.
  let r = run()
  h.assert(r.code === 0, `exit 0 (${r.code}: ${r.err})`)
  h.assert(r.out === 'no changes\n', `no edit: "no changes" (${JSON.stringify(r.out.slice(0, 400))})`)
  h.assert(/^base: working tree /m.test(r.err), `base: the working tree (${r.err})`)
  h.assert(/sheet tie:\/\/app\/assets\/index-.*\.css/.test(r.err), `the UI sheet named (${r.err})`)
  h.assert(/element\.style \(inline\) edits are not included/.test(r.err), 'inline edits note')
  h.assert(!/repaired/.test(r.err), `nothing to repair (${r.err})`)
  h.assert((await text()) === before, 'the command left the sheet as it was')
  // The sheet decoded as UTF-8 (PENDING 44 fixed: `@charset "UTF-8"` first in style.css, kept first by the build).
  h.assert(before.startsWith('@charset "UTF-8";'), `@charset first in the built sheet (${JSON.stringify(before.slice(0, 40))})`)
  h.assert(before.includes('(× --k in a horizontal bar)') && !before.includes('Ã'), 'non-ASCII read back as written ("×", no mojibake)')

  // A devtools-like edit: one declaration changed, a comment with "×" added (typed) on a line whose
  // own comment has a "×": both come back right.
  const old = '  --tabs-min: 140px;'
  const source = readFileSync(`${ROOT}/src/renderer/style.css`, 'utf8').split('\n').find((l) => l.startsWith(old))
  h.assert(source.includes('×'), `the edited line has a "×" of its own (${source})`)
  h.assert(before.split(old).length === 2, 'the edited line is unique')
  const edited = before.replace(old, '  --tabs-min: 152px; /* 2 × 76 */')
  await cdp.send('CSS.setStyleSheetText', { styleSheetId: ui.styleSheetId, text: edited })
  await h.eventually(ctx, async () => h.assert((await h.cssVar(ctx, '--tabs-min')) === '152px', 'edit applied'))
  r = run()
  h.assert(r.code === 0, `exit 0 after the edit (${r.err})`)
  const lines = r.out.split('\n')
  h.assert(lines[0] === '--- a/src/renderer/style.css' && lines[1] === '+++ b/src/renderer/style.css', `paths (${lines.slice(0, 2)})`)
  const minus = lines.filter((l) => l.startsWith('-') && !l.startsWith('---'))
  const plus = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++'))
  h.assert(minus.length === 1 && plus.length === 1 && lines.filter((l) => l.startsWith('@@')).length === 1, `one hunk, one line each way (${r.out})`)
  h.assert(minus[0] === `-${source}`, `old line as in the file (${minus[0]})`)
  h.assert(plus[0] === `+${source.replace('140px;', '152px; /* 2 × 76 */')}`, `new line: the edit, both "×" right (${plus[0]})`)
  h.assert(lines.filter((l) => l.startsWith(' ')).length === 6, `3 lines of context each side (${r.out})`)
  h.assert(lines[2].endsWith(' @@ :root {'), `the rule's selector in the hunk header (${lines[2]})`)
  h.assert((await text()) === edited, 'the command left the edited sheet as it was')
  ctx.log(r.out)

  // A rule added with devtools' "New Style Rule": its own sheet (inspector), listed apart.
  const frame = (await cdp.send('Page.getFrameTree')).frameTree.frame.id
  const { styleSheetId } = await cdp.send('CSS.createStyleSheet', { frameId: frame })
  await cdp.send('CSS.setStyleSheetText', { styleSheetId, text: '#brand { letter-spacing: 1px; }' })
  r = run()
  h.assert(/rules added in devtools \(inspector-stylesheet[^]*#brand \{ letter-spacing: 1px; \}/.test(r.err), `inspector rule listed (${r.err})`)
  h.assert(plus.length === r.out.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).length, 'the diff unchanged by the inspector rule')

  // Restored: no changes again.
  await cdp.send('CSS.setStyleSheetText', { styleSheetId: ui.styleSheetId, text: before })
  await cdp.send('CSS.setStyleSheetText', { styleSheetId, text: '' })
  r = run()
  h.assert(r.out === 'no changes\n' && !/inspector-stylesheet/.test(r.err), `restored: "no changes" (${r.out}${r.err})`)

  // An edit in the file's last rule (its end anchor gone): still exactly that delta, xterm's CSS after it left out.
  const src = readFileSync(`${ROOT}/src/renderer/style.css`, 'utf8')
  const last = '  display: none; /* ping outranks activity */\n}\n'
  h.assert(src.endsWith(last) && before.split(last).length === 2, 'the last rule as expected')
  await cdp.send('CSS.setStyleSheetText', { styleSheetId: ui.styleSheetId, text: before.replace(last, '  display: block;\n}\n') })
  r = run()
  const pm = r.out.split('\n').filter((l) => /^[-+](?![-+]{2} )/.test(l))
  h.assert(pm.join('|') === '-  display: none; /* ping outranks activity */|+  display: block;', `last rule edited: one line each way (${r.out})`)
  h.assert(!/xterm/.test(r.out), 'xterm CSS left out')

  // A build older than the working tree: the base is the commit it was built from ("no changes").
  const commits = spawnSync('git', ['log', '-n15', '--format=%h', '--', 'src/renderer/style.css'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim().split('\n')
  const show = (c) => spawnSync('git', ['show', `${c}:src/renderer/style.css`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).stdout
  const older = commits.slice(1).find((c) => show(c) !== src && show(c) !== show(commits[0]))
  h.assert(older, 'an older version of style.css in the last commits')
  const n = src.split('\n').length - 1 // the file's lines; the built sheet: those, then xterm's CSS
  const rest = before.split('\n').slice(n).join('\n')
  await cdp.send('CSS.setStyleSheetText', { styleSheetId: ui.styleSheetId, text: show(older) + rest })
  r = run()
  h.assert(r.out === 'no changes\n', `older build: "no changes" (${r.out.slice(0, 400)})`)
  h.assert(new RegExp(`^base: ${older} `, 'm').test(r.err), `older build: base ${older} (${r.err})`)

  await cdp.send('CSS.setStyleSheetText', { styleSheetId: ui.styleSheetId, text: before })
  await cdp.detach()
}
