// Bar sizes (docs/2026-11-19-configurable-toolbars.md S19 to S24; LAYOUT.md "Bar sizes"): each bar's
// thickness (top / bottom: height; left / right: width), its limits, how content scales with it, and
// the UI state file that keeps it (`<stateDir>/<instance>.ui.json`). Pure rules. Users: main
// (uistate.ts: the file), renderer (barsize.ts: edges, CSS vars).
import { BARS, isVertical, type Bar } from './bars'

export type BarSizes = Record<Bar, number>

export const HBAR = { min: 40, def: 40, max: 60 } // top / bottom: max = 1.5x the default (S21, S22, S53)
export const VBAR = { min: 40, def: 160, share: 0.3, max: 1200 } // left / right: up to 30% of the window width; `max`: static cap (files)

export const defaultSize = (bar: Bar) => (isVertical(bar) ? VBAR.def : HBAR.def)
export const defaultSizes = (): BarSizes => ({ top: HBAR.def, bottom: HBAR.def, left: VBAR.def, right: VBAR.def })

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// Static limits (no window): what a stored size may be. Whole px.
export const clampStored = (bar: Bar, n: number) => Math.round(isVertical(bar) ? clamp(n, VBAR.min, VBAR.max) : clamp(n, HBAR.min, HBAR.max))

// Smallest size: 40, every bar (S53), whatever it holds (S54: a side bar holding the tabs too).
export const minSize = (bar: Bar) => (isVertical(bar) ? VBAR.min : HBAR.min)
// Largest size now: horizontal 60; vertical 30% of the window width, never under the minimum (a
// window too small for both: the minimum wins).
export const maxSize = (bar: Bar, windowW: number) => (isVertical(bar) ? Math.max(minSize(bar), Math.floor(windowW * VBAR.share)) : HBAR.max)

// The size a bar is shown at: the stored one within today's limits. A vertical bar wider than 30% of
// a narrowed window is shown clamped; the stored size stays (back when the window grows).
export const shownSize = (bar: Bar, stored: number, windowW: number) => Math.round(clamp(stored, minSize(bar), maxSize(bar, windowW)))

// Content scale by a bar's size (S19, S53): 1x at 40 px (every bar's minimum), 1.5x at 60 px, the
// most. The same in both orientations: at the same size, an icon is the same size in a top / bottom
// bar (barScale) and in a narrow side bar (narrowScale).
const sizeScale = (size: number) => Math.round(clamp(size / HBAR.def, 1, HBAR.max / HBAR.def) * 1000) / 1000
// A horizontal bar's content scale; vertical bars: 1 (their shelf / templates scale by width: the
// narrow form).
export const barScale = (bar: Bar, size: number) => (isVertical(bar) ? 1 : sizeScale(size))

// Vertical bar forms (S14, S15; SHELF.md "Forms"), by width. Narrow: icons only, scaled by
// narrowScale, centred, up to LIST_MIN. List: default icons with titles, from LIST_MIN on (a title of
// ~6 letters there).
export const LIST_MIN = 100
export const barForm = (size: number): 'narrow' | 'list' => (size < LIST_MIN ? 'narrow' : 'list')

// Content scale of a narrow vertical bar's shelf and templates (S53): a horizontal bar's at the same
// size (1x at 40 px, 1.5x from 60 px on; centred after that).
export const narrowScale = sizeScale

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

// Sizes from untrusted input (the file, an IPC payload): each known bar with a finite number,
// clamped to the static limits, over `base`; anything else dropped (named in `dropped`: unknown keys,
// non-numbers, NaN, Infinity). Not an object: null.
export function cleanSizes(v: unknown, base: BarSizes): { sizes: BarSizes; dropped: string[] } | null {
  if (!isObject(v)) return null
  const sizes = { ...base }
  const dropped: string[] = []
  for (const [k, n] of Object.entries(v)) {
    if (!(BARS as readonly string[]).includes(k) || typeof n !== 'number' || !Number.isFinite(n)) {
      dropped.push(k)
      continue
    }
    sizes[k as Bar] = clampStored(k as Bar, n)
  }
  return { sizes, dropped }
}

// The state file's text → sizes. Missing, unparseable, wrong shape: defaults (never an error the
// user sees: it is Tie's own cache, not a settings file). `bars` cleaned over the defaults.
export function parseUiState(text: string | null): { bars: BarSizes; problem: string | null } {
  if (text === null) return { bars: defaultSizes(), problem: null }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { bars: defaultSizes(), problem: `not JSON: ${e instanceof Error ? e.message : String(e)}` }
  }
  if (!isObject(raw)) return { bars: defaultSizes(), problem: 'not an object' }
  const c = cleanSizes(raw.bars, defaultSizes())
  if (!c) return { bars: defaultSizes(), problem: raw.bars === undefined ? null : '`bars` not an object' }
  return { bars: c.sizes, problem: c.dropped.length ? `dropped: ${c.dropped.join(', ')}` : null }
}

export const uiStateText = (bars: BarSizes) => JSON.stringify({ bars: { top: bars.top, bottom: bars.bottom, left: bars.left, right: bars.right } }, null, 2) + '\n'

export const sameSizes = (a: BarSizes, b: BarSizes) => BARS.every((bar) => a[bar] === b[bar])
