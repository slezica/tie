// Bar sizes (LAYOUT.md "Bar sizes"; design S19 to S24): each bar's stored size (main keeps it in the
// UI state file; handed over at boot), the size it is shown at (window limits), the CSS that follows
// (root `--size-<bar>`; per bar `--k`, the content scale; a vertical bar's form `.narrow` and its scale `--kn`), and
// the resize: drag a bar's board-side edge (`.bar-edge`), double-click for the default size.
import { BARS, isVertical, type Bar } from '@core/bars'
import { defaultSizes, defaultSize, shownSize, minSize, maxSize, barScale, barForm, narrowScale, type BarSizes } from '@core/barsize'
import { tie, debug } from './state'
import { track } from './drag'
import { render } from './render'

let stored: BarSizes = defaultSizes()
let written: BarSizes = defaultSizes() // what the state file holds (as far as this renderer wrote / read it)
let held: BarSizes | null = null // the edit layout mode is open: the sizes as it opened; writes wait for its end
let applied = '' // the shown sizes last written to the CSS (applySizes runs on every render)

export const storedSizes = (): BarSizes => ({ ...stored })
export const shownSizes = (): BarSizes => Object.fromEntries(BARS.map((b) => [b, shownSize(b, stored[b], innerWidth)])) as BarSizes

// Boot: the sizes main read from the state file.
export function initSizes(s: BarSizes) {
  stored = { ...s }
  written = { ...s }
  applySizes()
}

// The edit layout mode (layoutedit.ts, design S46): resizes in it apply live, as in normal use, but
// the file is written only when the mode ends. Done (`keep`) writes the sizes as they are; Cancel /
// Escape / an abort restores the sizes as the mode opened (and writes whatever the file lacks of
// them: nothing, unless a write slipped in). A crash or quit inside the mode: the file holds the
// sizes from before it (as Cancel).
let resizing: (() => void) | null = null // ends the edge drag in progress, at its current size

export function holdSizes() {
  held = { ...stored }
}
export function releaseSizes(keep: boolean) {
  if (!held) return
  resizing?.() // Escape mid-resize: the drag ends here, before the restore (a later move would undo it)
  const was = held
  held = null
  if (!keep && BARS.some((b) => stored[b] !== was[b])) {
    stored = { ...was }
    debug('layout', 'bar sizes restored', stored)
    render()
  }
  persist()
}

// Shown sizes → CSS: root `--size-<bar>` (the inset vars follow: style.css `has-<bar>`), each bar's
// `--k` (horizontal content scale, S19); a vertical bar's `.narrow` (form, S14) and `--kn` (its
// shelf and templates' scale in that form, narrowScale). Only on change.
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
    if (!isVertical(bar)) continue
    el.classList.toggle('narrow', barForm(shown[bar]) === 'narrow')
    el.style.setProperty('--kn', String(narrowScale(shown[bar])))
  }
}

// A bar's size within today's limits (vertical: 30% of the window width).
const limit = (bar: Bar, px: number) => Math.round(Math.max(minSize(bar), Math.min(maxSize(bar, innerWidth), px)))

// The bars whose size the file lacks, written (main cleans the payload again: uistate.ts). Held while
// the edit layout mode is open (releaseSizes).
function persist() {
  if (held) return
  const diff = Object.fromEntries(BARS.filter((b) => stored[b] !== written[b]).map((b) => [b, stored[b]])) as Partial<BarSizes>
  if (!Object.keys(diff).length) return
  Object.assign(written, diff)
  void tie.ui.setBarSizes(diff).then((s) => debug('layout', 'bar sizes saved', s))
}

// Set as a resize ending would (double-click, dev `bar-size`): stored, applied, persisted.
export function setBarSize(bar: Bar, px: number) {
  const size = limit(bar, px)
  debug('layout', 'bar size', bar, size)
  if (size === stored[bar]) return
  stored[bar] = size
  render()
  persist()
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
      const p0 = v ? e.clientX : e.clientY
      const sign = bar === 'left' || bar === 'top' ? 1 : -1 // toward the board grows it
      document.body.classList.add('dragging', v ? 'resizing-row' : 'resizing-col')
      edge.classList.add('active')
      const done = () => {
        resizing = null
        document.body.classList.remove('dragging', 'resizing-row', 'resizing-col')
        edge.classList.remove('active')
        persist()
      }
      const stop = track(e, {
        move: (ev) => {
          const size = limit(bar, start + sign * ((v ? ev.clientX : ev.clientY) - p0))
          if (size === shownSizes()[bar]) return
          stored[bar] = size
          render()
        },
        up: done,
        cancel: done,
      })
      resizing = () => (stop(), done())
    })
    edge.addEventListener('dblclick', () => setBarSize(bar, defaultSize(bar)))
  }
}
