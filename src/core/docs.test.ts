// Docs and source rules checked against the tree (no app code): SECURITY.md names real scenarios, and
// the IPC / URL-opening rules it states hold in src/.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const security = readFileSync(join(ROOT, 'docs/SECURITY.md'), 'utf8')
const scenario = (name: string) => existsSync(join(ROOT, 'dev/scenarios', `${name}.mjs`))

// Backticked tokens shaped like a scenario name: lowercase words joined by hyphens.
const NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const backticked = (text: string) => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1])
// Parenthesized text (nested too) removed: commentary, where other backticked words live
// (`preload`, `update-target-url`, file names).
const outsideParens = (text: string) => {
  let out = ''
  let depth = 0
  for (const c of text) {
    if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    else if (depth === 0) out += c
  }
  return out
}

// Rule: in the Guards table, the Test column (last cell) outside parentheses names scenarios: every
// scenario-shaped backticked token there must be dev/scenarios/<name>.mjs. Anywhere in the doc, a
// backticked `sec-...` name must be one too.
function citedScenarios(doc: string): string[] {
  const names = new Set<string>()
  for (const line of doc.split('\n')) {
    if (!line.startsWith('|') || /^\|\s*-/.test(line)) continue
    const cells = line.split('|').slice(1, -1)
    if (cells.length < 3) continue
    for (const t of backticked(outsideParens(cells[cells.length - 1]))) if (NAME.test(t)) names.add(t)
  }
  for (const t of backticked(doc)) if (/^sec-[a-z0-9-]+$/.test(t)) names.add(t)
  return [...names].sort()
}

describe('SECURITY.md', () => {
  const cited = citedScenarios(security)

  it('cites scenarios at all (the parser still finds the table)', () => {
    expect(cited.length).toBeGreaterThan(20)
    expect(cited).toContain('sec-html')
  })

  it('names only scenarios that exist', () => {
    expect(cited.filter((n) => !scenario(n))).toEqual([])
  })

  it('the rule catches drift: a renamed scenario left in the Test column', () => {
    const drift = '| Guard | `x.ts` | `sec-html`, `html-scripts` (mutation: `preload` → red) |'
    const names = citedScenarios(drift)
    expect(names).toEqual(['html-scripts', 'sec-html'])
    expect(names.filter((n) => !scenario(n))).toEqual(['html-scripts'])
  })
})

// Source files under src/ (no tests, no declarations), relative paths.
function sources(dir = join(ROOT, 'src')): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return sources(p)
    return /\.ts$/.test(f) && !/\.(test|d)\.ts$/.test(f) ? [relative(ROOT, p)] : []
  })
}

// SECURITY.md "Rules": IPC only via `ipc.on` / `ipc.handle` (`uiIpc`), never `ipcMain` directly;
// opening URLs only through `openExternal` in src/main/security.ts. Rule checked: `ipcMain`, and
// Electron's `shell` (imported, or its open calls), appear in no other file.
describe('source rules (SECURITY.md)', () => {
  const OWNER = 'src/main/security.ts'
  const files = sources().map((f) => ({ f, text: readFileSync(join(ROOT, f), 'utf8') }))
  const electronNames = (text: string) =>
    [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'electron'/g)].flatMap((m) => m[1].split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]))
  const usesIpcMain = (text: string) => /\bipcMain\b/.test(text)
  const usesShell = (text: string) => electronNames(text).includes('shell') || /\bshell\.open(External|Path)\b/.test(text) || /require\(['"]electron['"]\)\.shell/.test(text)

  it('finds the sources, the owner included (not vacuous)', () => {
    const owner = files.find((x) => x.f === OWNER)
    expect(files.length).toBeGreaterThan(30)
    expect(owner && usesIpcMain(owner.text) && usesShell(owner.text)).toBe(true)
  })

  it('ipcMain only in src/main/security.ts (uiIpc)', () => {
    expect(files.filter((x) => usesIpcMain(x.text)).map((x) => x.f)).toEqual([OWNER])
  })

  it("Electron's shell (openExternal) only in src/main/security.ts", () => {
    expect(files.filter((x) => usesShell(x.text)).map((x) => x.f)).toEqual([OWNER])
  })
})
