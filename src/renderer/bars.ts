// Bars (docs/LAYOUT.md "Bars"): the four bar containers, components mounted per the `bars`
// setting (core/bars), and which component a tile drop over a bar goes to.
import { BARS, GRAVITIES, barItems, barEmpty, barOf, dropComponent, isVertical, defaultBars, type Bar, type Bars, type Component, type Span } from '@core/bars'

let layout: Bars = defaultBars()
export const bars = () => layout

const barEl = (bar: Bar) => document.getElementById(`bar-${bar}`)!

// A component's elements, in order: the brand always sits just before the tabs (S5).
const parts = (c: Component): HTMLElement[] => (c === 'tabs' ? ['brand', 'tabs'] : [c]).map((id) => document.getElementById(id)!)
// The element a component's span and hit test use (the brand is not part of it).
const compEl = (c: Component) => document.getElementById(c)!

// Mount every component where the layout says; an empty bar is hidden (S4) and its inset is 0
// (root classes `has-<bar>`, style.css). Moves only what changed: a move resets scroll positions.
export function applyBars(next: Bars) {
  layout = next
  const root = document.documentElement.classList
  for (const bar of BARS) {
    const el = barEl(bar)
    for (const g of GRAVITIES) {
      const group = el.querySelector(`.group.${g}`)!
      const want = next[bar][g].flatMap(parts)
      if (want.length === group.children.length && want.every((p, i) => group.children[i] === p)) continue
      for (const p of want) group.appendChild(p)
    }
    const empty = barEmpty(next, bar)
    el.hidden = empty
    root.toggle(`has-${bar}`, !empty)
  }
  // The templates' divider only beside the shelf in the same group: on the side facing it.
  const tpl = compEl('templates')
  const group = tpl.parentElement!
  const sibs = [...group.children]
  const i = sibs.indexOf(tpl)
  tpl.classList.toggle('after-shelf', sibs[i - 1]?.id === 'shelf')
  tpl.classList.toggle('before-shelf', sibs[i + 1]?.id === 'shelf')
}

// The bar a component sits in, and whether it is vertical (left / right).
export const barOfComponent = (c: Component) => barOf(layout, c)
export const verticalComponent = (c: Component) => isVertical(barOf(layout, c))

export type BarDrop = { c: 'tabs'; inside: boolean } | { c: 'shelf'; inside: boolean } | null

// A tile drop at (x, y) over a bar (S25, S26): the component under it along the bar's axis, else the
// nearest drop-taking one in that bar. undefined: not over a shown bar; null: over one, no drop
// there (templates, a bar holding only templates). Rects only: the brand and gaps are empty space.
export function barDropAt(x: number, y: number): BarDrop | undefined {
  for (const bar of BARS) {
    if (barEmpty(layout, bar)) continue
    const r = barEl(bar).getBoundingClientRect()
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue
    const v = isVertical(bar)
    const spans: Span[] = barItems(layout, bar).map((c) => {
      const b = compEl(c).getBoundingClientRect()
      return { c, lo: v ? b.top : b.left, hi: v ? b.bottom : b.right }
    })
    const hit = dropComponent(spans, v ? y : x)
    return hit && hit.c !== 'templates' ? { c: hit.c, inside: hit.inside } : null
  }
  return undefined
}
