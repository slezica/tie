// Fuzzy path matching for the file picker: fzf v1 (first greedy window, shrunk backwards) scored with
// fzf's path-scheme constants; smart case, NFC, space-separated AND terms; top-K ranking with a depth
// tiebreak. Pure (renderer). docs/2026-10-30-file-picker.md ("Components", "Research").

export const SCORE_MATCH = 16
export const GAP_START = -3
export const GAP_EXTEND = -1
export const BONUS_DELIMITER = 9 // after `/`; the start of the path counts as after one
export const BONUS_BOUNDARY = 8 // after `_ - .` (non-word) or a space
export const BONUS_CAMEL = 7 // lower → upper, non-digit → digit
export const BONUS_CONSECUTIVE = 4
export const FIRST_CHAR_MULTIPLIER = 2

export interface Hit {
  path: string
  score: number
  positions: number[] // UTF-16 indices into `path` (the original string), sorted
}

// fzf char classes (order matters: `> NONWORD` = word chars and delimiters).
const WHITE = 0, NONWORD = 1, DELIM = 2, LOWER = 3, UPPER = 4, LETTER = 5, NUMBER = 6

function bonusFor(prev: number, cls: number): number {
  if (cls > NONWORD) {
    if (prev === WHITE) return BONUS_BOUNDARY
    if (prev === DELIM) return BONUS_DELIMITER
    if (prev === NONWORD) return BONUS_BOUNDARY
  }
  if ((prev === LOWER && cls === UPPER) || (prev !== NUMBER && cls === NUMBER)) return BONUS_CAMEL
  if (cls === NONWORD || cls === DELIM || cls === WHITE) return BONUS_BOUNDARY
  return 0
}
const BONUS = Array.from({ length: 49 }, (_, i) => bonusFor(Math.floor(i / 7), i % 7))

const wide = new Map<number, number>() // non-ASCII code unit → class
function classOf(c: number): number {
  if (c >= 97 && c <= 122) return LOWER
  if (c >= 65 && c <= 90) return UPPER
  if (c >= 48 && c <= 57) return NUMBER
  if (c === 47) return DELIM
  if (c === 32 || (c >= 9 && c <= 13) || c === 0x85 || c === 0xa0) return WHITE
  if (c < 128) return NONWORD
  let k = wide.get(c)
  if (k === undefined) {
    const s = String.fromCharCode(c)
    k = c >= 0xd800 && c <= 0xdfff ? LETTER : /\p{Ll}/u.test(s) ? LOWER : /\p{Lu}/u.test(s) ? UPPER
      : /\p{L}/u.test(s) ? LETTER : /\p{N}/u.test(s) ? NUMBER : /\s/u.test(s) ? WHITE : NONWORD
    wide.set(c, k)
  }
  return k
}

// Lowercase, same length (index-aligned with `s`): toLowerCase, else per code unit.
function lower(s: string): string {
  const l = s.toLowerCase()
  if (l.length === s.length) return l
  let out = ''
  for (const c of s) { const x = c.toLowerCase(); out += x.length === c.length ? x : c }
  return out
}

interface Term { q: string; cs: boolean }

// Query → terms: NFC, split on spaces; smart case per term (as fzf): an uppercase letter = case-sensitive.
export function terms(query: string): Term[] {
  return query.normalize('NFC').split(' ').filter(Boolean).map((t) => {
    const cs = /\p{Lu}/u.test(t)
    return { q: cs ? t : lower(t), cs }
  })
}

// One term against `s` (`low` = lower(s), or null if no term needs it): score, or -Infinity.
// Positions (indices into `s`) pushed to `pos` if given.
function matchTerm({ q, cs }: Term, s: string, low: string, pos: number[] | null): number {
  const t = cs ? s : low, m = q.length
  let end = -1
  for (let k = 0; k < m; k++) if ((end = t.indexOf(q[k], end + 1)) < 0) return -Infinity
  let start = end // backward: the shortest window ending at `end`
  for (let k = m - 2; k >= 0; k--) start = t.lastIndexOf(q[k], start - 1)
  let score = 0, gap = false, run = 0, first = 0
  let prev = start > 0 ? classOf(s.charCodeAt(start - 1)) : DELIM
  for (let i = start, j = 0; i <= end; i++) {
    const cls = classOf(s.charCodeAt(i))
    if (j < m && t.charCodeAt(i) === q.charCodeAt(j)) {
      let b = BONUS[prev * 7 + cls]
      if (run === 0) first = b
      else {
        if (b >= BONUS_BOUNDARY && b > first) first = b
        b = Math.max(b, first, BONUS_CONSECUTIVE)
      }
      score += SCORE_MATCH + (j === 0 ? b * FIRST_CHAR_MULTIPLIER : b)
      pos?.push(i)
      gap = false; run++; j++
    } else {
      score += gap ? GAP_EXTEND : GAP_START
      gap = true; run = 0; first = 0
    }
    prev = cls
  }
  return score
}

// Path in NFC; `back` maps positions in the NFC text to the original's (null: same string). Composition
// runs per segment (a starter + its combining marks); a matched composed char maps to its whole segment.
// If per-segment NFC differs from whole-string NFC (rare: e.g. Hangul jamo), positions are the NFC
// text's, unmapped.
interface Text { s: string; back: ((pos: number[]) => number[]) | null }

const COMPOSABLE = /[^\u0000-\u02ff]/ // NFC leaves text below U+0300 unchanged

function text(path: string): Text {
  if (!COMPOSABLE.test(path)) return { s: path, back: null }
  const s = path.normalize('NFC')
  if (s === path) return { s, back: null }
  const segs: [number, number, number, number][] = [] // [orig start, orig end, nfc start, nfc end]
  let out = ''
  for (let i = 0; i < path.length; ) {
    let j = i + 1
    while (j < path.length && /[\p{M}\udc00-\udfff]/u.test(path[j])) j++
    const part = path.slice(i, j).normalize('NFC')
    segs.push([i, j, out.length, out.length + part.length])
    out += part
    i = j
  }
  if (out !== s) return { s, back: (pos) => pos }
  return {
    s,
    back: (pos) => {
      const res = new Set<number>()
      let g = 0
      for (const p of pos) {
        while (segs[g][3] <= p) g++
        const [os, oe, ns, ne] = segs[g]
        if (oe - os === ne - ns) res.add(os + p - ns)
        else for (let x = os; x < oe; x++) res.add(x)
      }
      return [...res].sort((a, b) => a - b)
    },
  }
}

function matchAll(ts: Term[], s: string, pos: number[] | null): number {
  let total = 0, low = ''
  for (const term of ts) {
    if (!term.cs && !low) low = lower(s)
    const sc = matchTerm(term, s, low, pos)
    if (sc === -Infinity) return sc
    total += sc
  }
  return total
}

function positions(ts: Term[], t: Text): number[] {
  const pos: number[] = []
  matchAll(ts, t.s, pos)
  const sorted = [...new Set(pos)].sort((a, b) => a - b)
  return t.back ? t.back(sorted) : sorted
}

export function score(query: string, path: string): { score: number; positions: number[] } | null {
  const ts = terms(query), t = text(path)
  const sc = matchAll(ts, t.s, null)
  return sc === -Infinity ? null : { score: sc, positions: positions(ts, t) }
}

// Count of `/`, a directory's trailing `/` not counted.
export function depth(path: string): number {
  let d = 0
  for (let i = 0; i < path.length - 1; i++) if (path.charCodeAt(i) === 47) d++
  return d
}

// Ranking order: score desc, depth asc, length asc, path asc.
export function compare(a: Hit, b: Hit): number {
  return b.score - a.score || depth(a.path) - depth(b.path) || a.path.length - b.path.length
    || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
}

interface Entry { score: number; depth: number; path: string }

function before(a: Entry, b: Entry): boolean {
  return a.score !== b.score ? a.score > b.score : a.depth !== b.depth ? a.depth < b.depth
    : a.path.length !== b.path.length ? a.path.length < b.path.length : a.path < b.path
}

// Top `k` of `paths` for `query`, best first. Partial selection: a sorted buffer of k entries;
// positions computed for the winners only. Empty query: everything, score 0, shallowest first.
// Speed: matches the raw path first, NFC only when it can matter: a raw hit on composable text, or a
// raw miss with a non-ASCII query (an ASCII query missing raw misses in NFC too, but for the NFC
// singletons U+037E → `;`, U+1FEF → `` ` ``, U+212A → `K` case-sensitive: ignored).
export function rank(query: string, paths: string[], k: number): Hit[] {
  if (k <= 0) return []
  const ts = terms(query)
  const ascii = ts.every((t) => !/[^\x00-\x7f]/.test(t.q))
  const top: Entry[] = []
  for (const path of paths) {
    let sc = 0
    if (ts.length) {
      sc = matchAll(ts, path, null)
      if (sc === -Infinity ? !ascii : COMPOSABLE.test(path)) sc = matchAll(ts, text(path).s, null)
      if (sc === -Infinity) continue
    }
    let d = -1
    if (top.length === k) { // full: beat the worst, without allocating
      const w = top[k - 1]
      if (sc < w.score) continue
      if (sc === w.score && ((d = depth(path)) > w.depth || (d === w.depth
        && (path.length > w.path.length || (path.length === w.path.length && path >= w.path))))) continue
    }
    const e: Entry = { score: sc, depth: d < 0 ? depth(path) : d, path }
    let i = top.length < k ? top.length : k - 1
    while (i > 0 && before(e, top[i - 1])) { top[i] = top[i - 1]; i-- }
    top[i] = e
  }
  return top.map((e) => ({ path: e.path, score: e.score, positions: positions(ts, text(e.path)) }))
}

// Streamed chunks: fold a chunk's hits (`rank(query, chunk, k)`) into the running top-K.
export function merge(top: Hit[], hits: Hit[], k: number): Hit[] {
  return [...top, ...hits].sort(compare).slice(0, k)
}
