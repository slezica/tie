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

// Structural equality: same components in the same bars, gravities and order (order matters: never
// compare as sets; key order of the objects does not).
export const sameBars = (a: Bars, b: Bars) =>
  BARS.every((bar) => GRAVITIES.every((g) => a[bar][g].length === b[bar][g].length && a[bar][g].every((c, i) => b[bar][g][i] === c)))

// Edit mode drop (S33 to S36): `c` moves to `bar`'s `gravity` list at `index`, counted in that list
// without `c` (clamped). A new layout; `bars` is untouched. A bar left empty is just empty (hidden, S4).
export function moveComponent(bars: Bars, c: Component, bar: Bar, gravity: Gravity, index: number): Bars {
  const next = {} as Bars
  for (const b of BARS) next[b] = { start: bars[b].start.filter((x) => x !== c), end: bars[b].end.filter((x) => x !== c) }
  const list = next[bar][gravity]
  list.splice(Math.max(0, Math.min(list.length, index)), 0, c)
  return next
}

export const COMPONENT_LABELS: Record<Component, string> = { tabs: 'Tabs', shelf: 'Shelf', templates: 'Templates' }
const BAR_LABELS: Record<Bar, string> = { top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right' }

// Settings row summary: per bar that holds something, its components in visual order.
// "Bottom: Tabs, Shelf, Templates"; "Top: Tabs · Left: Shelf, Templates".
export const barsSummary = (bars: Bars) =>
  BARS.filter((b) => !barEmpty(bars, b))
    .map((b) => `${BAR_LABELS[b]}: ${barItems(bars, b).map((c) => COMPONENT_LABELS[c]).join(', ')}`)
    .join(' · ')

export interface BarRect {
  x: number
  y: number
  w: number
  h: number
}

// Where each bar is, or would be if it held something (S9): top / bottom span the window's width
// (top below the title strip), left / right fit between the top and bottom bars that exist.
// `shown`: whether a bar exists now; `size`: each bar's thickness (shown or not: its own size).
export function barRects(w: number, h: number, strip: number, size: Record<Bar, number>, shown: (b: Bar) => boolean): Record<Bar, BarRect> {
  const top = strip + (shown('top') ? size.top : 0)
  const bottom = h - (shown('bottom') ? size.bottom : 0)
  return {
    top: { x: 0, y: strip, w, h: size.top },
    bottom: { x: 0, y: h - size.bottom, w, h: size.bottom },
    left: { x: 0, y: top, w: size.left, h: bottom - top },
    right: { x: w - size.right, y: top, w: size.right, h: bottom - top },
  }
}

// Edit mode zones (S31): where each bar is indicated and takes a component drag. An existing bar:
// its rect. A potential one: its edge, less what other bars hold, so zones never overlap: top /
// bottom between the side bars that exist, left / right between the top / bottom zones.
export function barZones(w: number, h: number, strip: number, size: Record<Bar, number>, shown: (b: Bar) => boolean): Record<Bar, BarRect> {
  const r = barRects(w, h, strip, size, shown)
  const zones = { ...r }
  const x0 = shown('left') ? size.left : 0
  const x1 = w - (shown('right') ? size.right : 0)
  for (const b of ['top', 'bottom'] as const) if (!shown(b)) zones[b] = { ...r[b], x: x0, w: x1 - x0 }
  for (const b of ['left', 'right'] as const) if (!shown(b)) zones[b] = { ...r[b], y: strip + size.top, h: h - size.bottom - (strip + size.top) }
  return zones
}

// Target bar of a component drag at (x, y) (S34): the bar zone holding the point; an existing bar
// wins over a potential one (they meet at corners), then the zone whose window edge is nearest.
// null: over no zone (the board): a drop there changes nothing.
export function barAt(zones: { bar: Bar; rect: BarRect; exists: boolean }[], x: number, y: number): Bar | null {
  const edge = (z: { bar: Bar; rect: BarRect }) =>
    z.bar === 'top' ? y - z.rect.y : z.bar === 'bottom' ? z.rect.y + z.rect.h - y : z.bar === 'left' ? x - z.rect.x : z.rect.x + z.rect.w - x
  const hits = zones.filter((z) => x >= z.rect.x && x <= z.rect.x + z.rect.w && y >= z.rect.y && y <= z.rect.y + z.rect.h)
  hits.sort((a, b) => Number(b.exists) - Number(a.exists) || edge(a) - edge(b))
  return hits[0]?.bar ?? null
}

// Gravity by the pointer's half of the bar along its axis (S35): before the midpoint, start.
export function gravityAt(bar: Bar, rect: BarRect, x: number, y: number): Gravity {
  return isVertical(bar) ? (y < rect.y + rect.h / 2 ? 'start' : 'end') : x < rect.x + rect.w / 2 ? 'start' : 'end'
}

// Index in a gravity list (S36): how many of its other components have their midpoint (along the
// axis) before the pointer's position `p`.
export const indexAt = (mids: number[], p: number) => mids.filter((m) => m < p).length
