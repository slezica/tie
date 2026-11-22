// Bar sizes (docs/2026-11-19-configurable-toolbars.md S19 to S24; LAYOUT.md "Bar sizes"): each bar's
// thickness (top / bottom: height; left / right: width), its limits, how content scales with it, and
// the UI state file that keeps it (`<stateDir>/<instance>.ui.json`). Pure rules. Users: main
// (uistate.ts: the file), renderer (barsize.ts: edges, CSS vars).
import { BARS, isVertical, type Bar } from './bars'

export type BarSizes = Record<Bar, number>

export const HBAR = { min: 32, def: 40, max: 60 } // top / bottom: max = 1.5x the default (S21, S22)
export const VBAR = { min: 48, def: 160, share: 0.3, max: 1200 } // left / right: up to 30% of the window width; `max`: static cap (files)

export const defaultSize = (bar: Bar) => (isVertical(bar) ? VBAR.def : HBAR.def)
export const defaultSizes = (): BarSizes => ({ top: HBAR.def, bottom: HBAR.def, left: VBAR.def, right: VBAR.def })

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// Static limits (no window): what a stored size may be. Whole px.
export const clampStored = (bar: Bar, n: number) => Math.round(isVertical(bar) ? clamp(n, VBAR.min, VBAR.max) : clamp(n, HBAR.min, HBAR.max))

// A side bar holding the tabs (feel round 5, user): a tab row shows at least TAB_CHARS characters of
// its title before the ellipsis, so such a bar is at least TABS_MIN wide. Derived once (macOS: the
// tab title's font, 12 px semibold system font, measured in Tie's Chromium):
// - text: TAB_CHARS × TAB_CHAR_PX (lowercase average 6.7 px, 'n' 7.35 px: 7.5 leaves room for
//   wider letters) + the ellipsis (10.85 px → TAB_ELLIPSIS_PX), rounded up: 49 px;
// - the row: the narrow form's tab padding (4 px each side), the narrow bar's --pad (4 px each side).
// TABS_MIN is below LIST_MIN: a bar at the minimum is in the narrow form, whose insets these are
// (style.css `.bar.v.narrow`). A pinged tab's dot or a custom icon take from the title (not counted).
export const TAB_CHARS = 5
export const TAB_CHAR_PX = 7.5
export const TAB_ELLIPSIS_PX = 11
export const NARROW_PAD = 4 // a narrow side bar's --pad (rows), each side
export const NARROW_TAB_PAD = 4 // a narrow side bar's tab padding, each side
export const TABS_MIN = Math.ceil(TAB_CHARS * TAB_CHAR_PX + TAB_ELLIPSIS_PX) + 2 * NARROW_TAB_PAD + 2 * NARROW_PAD // 65

// Smallest size: horizontal 32; vertical 48, or TABS_MIN when the bar holds the tabs (`tabs`).
export const minSize = (bar: Bar, tabs = false) => (isVertical(bar) ? (tabs ? TABS_MIN : VBAR.min) : HBAR.min)
// Largest size now: horizontal 60; vertical 30% of the window width, never under the minimum (a
// window too small for both: the minimum wins, as for 48).
export const maxSize = (bar: Bar, windowW: number, tabs = false) => (isVertical(bar) ? Math.max(minSize(bar, tabs), Math.floor(windowW * VBAR.share)) : HBAR.max)

// The size a bar is shown at: the stored one within today's limits. A vertical bar wider than 30% of
// a narrowed window is shown clamped; the stored size stays (back when the window grows). Same for a
// side bar holding the tabs with a smaller stored size (a layout from settings, tabs moved there by
// hand edit): shown at TABS_MIN, stored kept (back when the tabs leave).
export const shownSize = (bar: Bar, stored: number, windowW: number, tabs = false) => Math.round(clamp(stored, minSize(bar, tabs), maxSize(bar, windowW, tabs)))

// Content scale of a horizontal bar (S19): 1x at 40 px, 1.5x at 60 px. Below 40 it shrinks with the
// bar down to a compact floor, SCALE_MIN (reached at 35 px; icons 14 px): smaller icons stop being
// legible; text never shrinks (the renderer's --kt). Vertical bars: 1 (their shelf / templates
// scale by width: the narrow form).
export const SCALE_MIN = 0.875
export const barScale = (bar: Bar, size: number) => (isVertical(bar) ? 1 : Math.round(clamp(size / HBAR.def, SCALE_MIN, HBAR.max / HBAR.def) * 1000) / 1000)

// Vertical bar forms (S14, S15; SHELF.md "Forms"), by width. Narrow: icons only, scaled by
// narrowScale, centred, up to LIST_MIN. List: default icons with titles, from LIST_MIN on (a title of
// ~6 letters there).
export const LIST_MIN = 100
export const barForm = (size: number): 'narrow' | 'list' => (size < LIST_MIN ? 'narrow' : 'list')

// Content scale of a narrow vertical bar's shelf and templates (feel round 2): at the minimum width
// the default size, NARROW_MIN (1x: 28 px slots, 16 px glyphs; round 1's SCALE_MIN read too small),
// then growing with the width at a horizontal bar's rate (1 / 40 per px), capped at 1.5x (reached at
// 68 px; centred after that).
export const NARROW_MIN = 1
export const narrowScale = (size: number) => Math.round(clamp(NARROW_MIN + (size - VBAR.min) / HBAR.def, NARROW_MIN, HBAR.max / HBAR.def) * 1000) / 1000

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
