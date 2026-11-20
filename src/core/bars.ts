// Bars layout (docs/2026-11-19-configurable-toolbars.md): four bars, three components, each in one
// bar at one end (gravity), in order. Pure rules: shape, default, validity, migration of the old
// `toolbar` setting, lookups, the nearest-component drop rule. Users: core/settings, renderer/bars.

export const BARS = ['top', 'bottom', 'left', 'right'] as const
export type Bar = (typeof BARS)[number]
export const COMPONENTS = ['tabs', 'shelf', 'templates'] as const
export type Component = (typeof COMPONENTS)[number]
export const GRAVITIES = ['start', 'end'] as const
export type Gravity = (typeof GRAVITIES)[number]

export type BarLayout = Record<Gravity, Component[]>
export type Bars = Record<Bar, BarLayout>

const empty = (): BarLayout => ({ start: [], end: [] })

// Today's look: everything in the bottom bar, tabs at the start, shelf and templates at the end.
export function defaultBars(at: Bar = 'bottom'): Bars {
  const bars: Bars = { top: empty(), bottom: empty(), left: empty(), right: empty() }
  bars[at] = { start: ['tabs'], end: ['shelf', 'templates'] }
  return bars
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

// Exactly the four bars, each exactly {start, end} arrays of component names; every component once.
export function validBars(v: unknown): v is Bars {
  if (!isObject(v)) return false
  const keys = Object.keys(v)
  if (keys.length !== BARS.length || !BARS.every((b) => keys.includes(b))) return false
  const seen: string[] = []
  for (const b of BARS) {
    const bar = v[b]
    if (!isObject(bar)) return false
    const gk = Object.keys(bar)
    if (gk.length !== GRAVITIES.length || !GRAVITIES.every((g) => gk.includes(g))) return false
    for (const g of GRAVITIES) {
      const list = bar[g]
      if (!Array.isArray(list)) return false
      for (const c of list) {
        if (!(COMPONENTS as readonly unknown[]).includes(c) || seen.includes(c as string)) return false
        seen.push(c as string)
      }
    }
  }
  return seen.length === COMPONENTS.length
}

// Valid: a copy; anything else (hand-edited file): the whole layout falls back to the default.
export function cleanBars(v: unknown): Bars {
  if (!validBars(v)) return defaultBars()
  const copy = defaultBars()
  for (const b of BARS) copy[b] = { start: [...v[b].start], end: [...v[b].end] }
  return copy
}

// Old files: `toolbar: "top"` and no `bars` → the default layout on the top bar. `toolbar` is
// ignored otherwise (and dropped by sanitize). Returns the raw object with `bars` filled in, or as is.
export function migrateToolbar(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.bars === undefined && raw.toolbar === 'top') return { ...raw, bars: defaultBars('top') }
  return raw
}

export const isVertical = (bar: Bar) => bar === 'left' || bar === 'right'

// Where a component sits: bar, gravity, index in that gravity's list.
export function placeOf(bars: Bars, c: Component): { bar: Bar; gravity: Gravity; index: number } {
  for (const bar of BARS)
    for (const gravity of GRAVITIES) {
      const index = bars[bar][gravity].indexOf(c)
      if (index >= 0) return { bar, gravity, index }
    }
  throw new Error(`component not in the layout: ${c}`) // validBars guarantees each one
}

export const barOf = (bars: Bars, c: Component): Bar => placeOf(bars, c).bar

// A bar's components in visual order: start list, then end list.
export const barItems = (bars: Bars, bar: Bar): Component[] => [...bars[bar].start, ...bars[bar].end]

export const barEmpty = (bars: Bars, bar: Bar) => barItems(bars, bar).length === 0

// Components that take tile drops (S25): tabs and shelf; templates never.
export const takesDrops = (c: Component) => c === 'tabs' || c === 'shelf'

// A component's span along its bar's axis (window px).
export interface Span {
  c: Component
  lo: number
  hi: number
}

// Tile drop over a bar at axis position `p` (S25, S26): the component whose span holds it (any,
// templates included: those take nothing), else the nearest drop-taking one along the axis (ties:
// the first in order); null when the bar holds none (templates only). `inside`: p is in its span.
export function dropComponent(spans: Span[], p: number): { c: Component; inside: boolean } | null {
  const on = spans.find((s) => p >= s.lo && p <= s.hi)
  if (on) return { c: on.c, inside: true }
  let best: Span | null = null
  let dist = Infinity
  for (const s of spans) {
    if (!takesDrops(s.c)) continue
    const d = p < s.lo ? s.lo - p : p - s.hi
    if (d < dist) (dist = d), (best = s)
  }
  return best && { c: best.c, inside: false }
}
