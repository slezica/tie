// tie-dev css-changes: the CSS edits made in a running instance's devtools, as a unified diff against
// src/renderer/style.css (HARNESS.md "CSS changes"). Read-only: CDP `CSS.getStyleSheetText`, never a
// write. The UI sheet is found by content (packaged / built: `tie://app/assets/index-*.css`, style.css
// followed by xterm's CSS; hot mode: the dev server's `style.css` link); the base is the candidate
// (working tree, last commits touching the file) with the smallest diff: the build may predate HEAD.
// Diff on stdout (git-style paths, `git apply`-able); what was chosen, notes: stderr.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROOT, connectPage, fail } from './lib.mjs'

const FILE = 'src/renderer/style.css'
const COMMITS = 15
const instance = process.env.TIE_INSTANCE || 'dev'
const note = (s) => process.stderr.write(`${s}\n`)

// Chromium decodes the built sheet as windows-1252 (served as `text/css` without a charset, no
// @charset): UTF-8 bytes come back as pairs ("×" → "Ã—"). Each run of non-ASCII characters that
// re-encodes to windows-1252 bytes forming valid UTF-8 is repaired; other runs (a "×" typed in
// devtools: one byte, not UTF-8) stay as they are.
const CP1252 = { 0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f }
const utf8 = new TextDecoder('utf-8', { fatal: true })
function repairRun(run) {
  const bytes = []
  for (const ch of run) {
    const c = ch.codePointAt(0)
    const b = c <= 0xff ? c : CP1252[c]
    if (b === undefined) return run
    bytes.push(b)
  }
  try {
    return utf8.decode(Uint8Array.from(bytes))
  } catch {
    return run
  }
}
const repairLine = (line) => line.replace(/[^\x00-\x7f]+/g, repairRun)

const lines = (text) => text.replace(/\n$/, '').split('\n')

const tmp = mkdtempSync(join(tmpdir(), 'tie-css-'))
const tmpFile = (name, ls) => {
  const p = join(tmp, name)
  writeFileSync(p, ls.length ? ls.join('\n') + '\n' : '')
  return p
}
const diff = (args, a, b) => spawnSync('diff', [...args, a, b], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout

// The sheet's part that stands for the base: other CSS bundled with it (xterm's, after it in the
// built sheet) cut off. Ends found by anchors: the base's first / last 3 lines as a block, the
// occurrence nearest where the base would put it. A plain diff can't cut it: it matches the base's
// last "}" to one in xterm's CSS. An edited end (no anchor): the cut that gives the smallest diff,
// within 40 lines of the line count.
const ANCHOR = 3
const WINDOW = 40
function findBlock(sheet, block, near) {
  let best = -1
  for (let i = 0; i + block.length <= sheet.length; i++)
    if (block.every((l, j) => sheet[i + j] === l) && (best < 0 || Math.abs(i - near) < Math.abs(best - near))) best = i
  return best
}
const changedLines = (base, part) =>
  diff([], tmpFile('base', base), tmpFile('part', part))
    .split('\n')
    .filter((l) => /^[<>]( |$)/.test(l)).length
function fit(base, sheet, refine = false) {
  const head = findBlock(sheet, base.slice(0, ANCHOR), 0)
  const from = Math.max(0, head)
  const tailAt = findBlock(sheet, base.slice(-ANCHOR), from + base.length - ANCHOR)
  let to = tailAt >= 0 ? tailAt + ANCHOR : Math.min(sheet.length, from + base.length)
  if (tailAt < 0 && refine) {
    // Ties (a cut a few lines short can cost the same as the edit): the cut nearest the line count.
    const expect = to
    let min = Infinity
    for (let k = Math.max(from + 1, expect - WINDOW); k <= Math.min(sheet.length, expect + WINDOW); k++) {
      const c = changedLines(base, sheet.slice(from, k))
      if (c < min || (c === min && Math.abs(k - expect) < Math.abs(to - expect))) [min, to] = [c, k]
    }
  }
  const part = sheet.slice(from, to)
  return { part, changed: changedLines(base, part), anchored: head >= 0 && tailAt >= 0 }
}

// Candidates: the working tree, then the last commits touching the file (newest first); same text once.
function candidates() {
  const out = [{ name: 'working tree', text: readFileSync(join(ROOT, FILE), 'utf8') }]
  const log = execFileSync('git', ['log', `-n${COMMITS}`, '--format=%h %s', '--', FILE], { cwd: ROOT, encoding: 'utf8' }).trim()
  for (const row of log ? log.split('\n') : []) {
    const [hash] = row.split(' ')
    out.push({ name: row, text: execFileSync('git', ['show', `${hash}:${FILE}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }) })
  }
  return out.filter((c, i) => out.findIndex((o) => o.text === c.text) === i)
}

async function sheets() {
  const { browser, page } = await connectPage(instance)
  try {
    const cdp = await page.context().newCDPSession(page)
    const headers = []
    cdp.on('CSS.styleSheetAdded', (e) => headers.push(e.header))
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable') // existing sheets are announced before this returns
    const out = []
    for (const h of headers) {
      const { text } = await cdp.send('CSS.getStyleSheetText', { styleSheetId: h.styleSheetId }).catch(() => ({ text: null }))
      if (text != null) out.push({ url: h.sourceURL || '(inline <style>)', origin: h.origin, text })
    }
    await cdp.detach().catch(() => {})
    return out
  } finally {
    await browser.close().catch(() => {}) // disconnects (connectOverCDP): the instance keeps running
  }
}

try {
  const all = await sheets()
  const bases = candidates()
  // The UI sheet: the one holding most of the file's distinct lines (any base will do for this).
  const marks = new Set(lines(bases[0].text).filter((l) => l.trim().length >= 12))
  const scored = all
    .filter((s) => s.origin === 'regular')
    .map((s) => {
      const have = new Set(lines(s.text).map(repairLine))
      return { s, score: [...marks].filter((m) => have.has(m)).length / marks.size }
    })
    .sort((a, b) => b.score - a.score)
  if (!scored.length || scored[0].score < 0.5) throw new Error(`no stylesheet in instance "${instance}" looks like ${FILE} (best match ${Math.round((scored[0]?.score ?? 0) * 100)}%)`)
  const sheet = scored[0].s
  const raw = lines(sheet.text)
  const live = raw.map(repairLine)
  const repaired = live.filter((l, i) => l !== raw[i]).length

  let best = null
  for (const c of bases) {
    const r = fit(lines(c.text), live)
    if (!best || r.changed < best.changed) best = { ...r, c }
  }
  if (!best.anchored) best = { ...fit(lines(best.c.text), live, true), c: best.c } // an edited first / last rule
  note(`css-changes: instance ${instance}, sheet ${sheet.url}`)
  note(`base: ${best.c.name} (smallest diff of ${bases.length} distinct candidates: working tree, last ${COMMITS} commits touching ${FILE})`)
  if (repaired) note(`note: ${repaired} line(s) with non-ASCII text repaired (Chromium read the sheet as windows-1252: served without a charset)`)
  note('note: element.style (inline) edits are not included')

  // Hunk headers carry the rule's selector (the last line opening a block before the hunk), as git's.
  const text = diff(['-U3', '-F', '^[[:space:]]*[^[:space:]}/*][^;]*[{]$', '--label', `a/${FILE}`, '--label', `b/${FILE}`], tmpFile('base', lines(best.c.text)), tmpFile('part', best.part))
  process.stdout.write(text || 'no changes\n')

  // Rules added with devtools' "New Style Rule" live in their own sheet, not in a file.
  for (const s of all.filter((s) => s.origin === 'inspector' && s.text.trim())) {
    note(`\nnote: rules added in devtools (inspector-stylesheet, in no file):`)
    note(s.text.trim())
  }
} catch (e) {
  rmSync(tmp, { recursive: true, force: true })
  fail(e)
}
rmSync(tmp, { recursive: true, force: true })
