// Bar sizes (LAYOUT.md "Bar sizes"; design S19 to S24): each bar's stored size (main keeps it in the
// UI state file; handed over at boot), the size it is shown at (window limits), the CSS that follows
// (root `--size-<bar>`; per bar `--k`, the content scale, and `.narrow`, a vertical bar's form), and
// the resize: drag a bar's board-side edge (`.bar-edge`), double-click for the default size.
import { BARS, isVertical, type Bar } from '@core/bars'
import { defaultSizes, defaultSize, shownSize, minSize, maxSize, barScale, barForm, type BarSizes } from '@core/barsize'
import { tie, debug } from './state'
import { track } from './drag'
import { render } from './render'

let stored: BarSizes = defaultSizes()
let applied = '' // the shown sizes last written to the CSS (applySizes runs on every render)

export const storedSizes = (): BarSizes => ({ ...stored })
export const shownSizes = (): BarSizes => Object.fromEntries(BARS.map((b) => [b, shownSize(b, stored[b], innerWidth)])) as BarSizes

// Boot: the sizes main read from the state file.
export function initSizes(s: BarSizes) {
  stored = { ...s }
  applySizes()
}

// Shown sizes → CSS: root `--size-<bar>` (the inset vars follow: style.css `has-<bar>`), each bar's
// `--k` (horizontal content scale, S19) and `.narrow` (vertical narrow form, S14). Only on change.
export function applySizes() {
  const shown = shownSizes()
  const key = BARS.map((b) => shown[b]).join()
  if (key === applied) return
  applied = key
  const root = document.documentElement.style
  for (const bar of BARS) {
    root.setProperty(`--size-${bar}`, `${shown[bar]}px`)
    const el = document.getElementById(`bar-${bar}`)!
    el.style.setProperty('--k', String(barScale(bar, shown[bar])))
    if (isVertical(bar)) el.classList.toggle('narrow', barForm(shown[bar]) === 'narrow')
  }
}

// A bar's size within today's limits (vertical: 30% of the window width).
const limit = (bar: Bar, px: number) => Math.round(Math.max(minSize(bar), Math.min(maxSize(bar, innerWidth), px)))

// Main writes the file (it cleans the payload again: uistate.ts).
const persist = (bar: Bar) => void tie.ui.setBarSizes({ [bar]: stored[bar] }).then((s) => debug('layout', 'bar sizes saved', s))

// Set as a resize ending would (double-click, dev `bar-size`): stored, applied, persisted.
export function setBarSize(bar: Bar, px: number) {
  const size = limit(bar, px)
  debug('layout', 'bar size', bar, size)
  if (size === stored[bar]) return
  stored[bar] = size
  render()
  persist(bar)
}

// Edges: drag along the bar's thickness resizes it live (board and tiles follow at each move, as a
// tile border drag); the file is written once, at the end. Double-click: the default size.
export function initBarEdges() {
  for (const edge of document.querySelectorAll<HTMLElement>('.bar-edge')) {
    const bar = edge.dataset.bar as Bar
    const v = isVertical(bar)
    edge.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const start = shownSizes()[bar]
      const before = stored[bar]
      const p0 = v ? e.clientX : e.clientY
      const sign = bar === 'left' || bar === 'top' ? 1 : -1 // toward the board grows it
      document.body.classList.add('dragging', v ? 'resizing-row' : 'resizing-col')
      edge.classList.add('active')
      const done = () => {
        document.body.classList.remove('dragging', 'resizing-row', 'resizing-col')
        edge.classList.remove('active')
        if (stored[bar] !== before) persist(bar)
      }
      track(e, {
        move: (ev) => {
          const size = limit(bar, start + sign * ((v ? ev.clientX : ev.clientY) - p0))
          if (size === shownSizes()[bar]) return
          stored[bar] = size
          render()
        },
        up: done,
        cancel: done,
      })
    })
    edge.addEventListener('dblclick', () => setBarSize(bar, defaultSize(bar)))
  }
}
