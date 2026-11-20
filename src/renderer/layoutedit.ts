// Edit layout mode (LAYOUT.md "Edit mode"; design S28 to S38): entered from the settings panel's
// Layout row (`Modify`). The board is dimmed and takes no input; the four bars are indicated
// (existing outlined, absent ones as potential zones); Tabs, Shelf and Templates are dragged to any
// bar, either end, any order. Each drop is applied live; Done hands the layout back to the panel
// (its draft), Cancel / Escape hand back nothing (the panel re-applies its draft). Never writes.
import { BARS, COMPONENTS, COMPONENT_LABELS, barAt, barEmpty, barRects, barZones, gravityAt, indexAt, isVertical, moveComponent, placeOf, sameBars, type Bar, type BarRect, type Bars, type Component, type Gravity } from '@core/bars'
import { bars } from './bars'
import { appearance, applyAppearance } from './appearance'
import { track } from './drag'
import { S, debug } from './state'
import { render } from './render'
import { closeMenu } from './menu'

type Target = { bar: Bar; gravity: Gravity; index: number }

interface Session {
  cleanup: () => void
  cancelDrag: (() => void) | null
}
let session: Session | null = null

export const editingLayout = () => !!session

const THRESHOLD = 4
const GAP = 6 // between components in a bar (style.css .bar gap)
const LABEL_GAP = 6 // label off its bar's board-side edge
const MARGIN = 4 // labels kept this far inside the board, and apart

// A component's elements: the brand sits just before the tabs (S5) and moves with them.
const parts = (c: Component) => (c === 'tabs' ? ['brand', 'tabs'] : [c]).map((id) => document.getElementById(id)!)

// A component's box (window px): the union of its shown parts (the brand is hidden when empty).
function compRect(c: Component): BarRect {
  const rs = parts(c)
    .map((p) => p.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
  if (!rs.length) return { x: 0, y: 0, w: 0, h: 0 }
  const x = Math.min(...rs.map((r) => r.left))
  const y = Math.min(...rs.map((r) => r.top))
  return { x, y, w: Math.max(...rs.map((r) => r.right)) - x, h: Math.max(...rs.map((r) => r.bottom)) - y }
}

const lo = (r: BarRect, v: boolean) => (v ? r.y : r.x)
const len = (r: BarRect, v: boolean) => (v ? r.h : r.w)
const mid = (r: BarRect, v: boolean) => lo(r, v) + len(r, v) / 2

// Geometry from the stylesheet (thicknesses, title strip) and the applied layout.
function geometry() {
  const cs = getComputedStyle(document.documentElement)
  const px = (n: string) => parseFloat(cs.getPropertyValue(n)) || 0
  const layout = bars()
  const shown = (b: Bar) => !barEmpty(layout, b)
  const args = [innerWidth, innerHeight, px('--strip-h'), px('--hbar'), px('--vbar'), shown] as const
  return { layout, shown, rects: barRects(...args), zones: barZones(...args), pad: px('--pad') }
}

const place = (el: HTMLElement, r: BarRect) => Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` })

// Enter the mode on the applied layout (the panel's draft, previewed). `done`: the mode's layout on
// Done; null on Cancel / Escape (the caller re-applies what it had: the layout as the mode opened).
export function editLayout(done: (result: Bars | null) => void) {
  if (session) return
  closeMenu()
  if (S.revealed) (S.revealed = null), render()
  const start = bars()
  const root = document.createElement('div')
  root.id = 'layout-edit'
  root.innerHTML = `
    <div class="le-dim"></div>
    ${BARS.map((b) => `<div class="le-bar" data-bar="${b}"></div>`).join('')}
    ${COMPONENTS.map((c) => `<div class="le-comp" data-c="${c}"></div>`).join('')}
    <div class="le-preview"></div>
    ${COMPONENTS.map((c) => `<div class="le-label" data-c="${c}">${COMPONENT_LABELS[c]}</div>`).join('')}
    <div class="le-box" role="group" aria-label="Edit layout">
      <p>Drag Tabs, Shelf and Templates to any edge</p>
      <button class="le-cancel">Cancel</button>
      <button class="le-done">Done</button>
    </div>`
  document.body.appendChild(root)
  document.documentElement.classList.add('layout-editing') // bars stop being window drag regions (style.css)
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T
  const box = $('.le-box')
  const cancelBtn = $<HTMLButtonElement>('.le-cancel')
  const doneBtn = $<HTMLButtonElement>('.le-done')
  const preview = $('.le-preview')

  // Indicators, component boxes, labels: re-placed on every change of the window, the bars or a
  // component's size (a tab opened meanwhile), and after each drop.
  const layout = () => {
    const g = geometry()
    for (const b of BARS) {
      const el = $(`.le-bar[data-bar="${b}"]`)
      place(el, g.zones[b])
      el.classList.toggle('exists', g.shown(b))
    }
    for (const c of COMPONENTS) place($(`.le-comp[data-c="${c}"]`), compRect(c))
    placeLabels(g)
  }
  // Labels: beside their component, on the board side of its bar, outside the layout flow. Kept
  // inside the four zones (never over a bar or a potential one): along the bar within that inner
  // area; a side bar's labels also clear the top / bottom bars' label bands (no clash at the
  // corners). Pushed apart along the bar so they never overlap each other.
  const placeLabels = (g: ReturnType<typeof geometry>) => {
    const z = g.zones
    const board = { left: z.left.x + z.left.w, right: z.right.x, top: z.top.y + z.top.h, bottom: z.bottom.y }
    const band = $('.le-label').offsetHeight + LABEL_GAP
    for (const b of BARS) {
      const v = isVertical(b)
      const r = g.rects[b]
      const items = [...g.layout[b].start, ...g.layout[b].end].map((c) => {
        const el = $(`.le-label[data-c="${c}"]`)
        const size = v ? el.offsetHeight : el.offsetWidth
        return { el, size, at: mid(compRect(c), v) - size / 2 }
      })
      items.sort((a, b) => a.at - b.at)
      const min = (v ? board.top + (g.shown('top') ? band : 0) : board.left) + MARGIN
      const max = (v ? board.bottom - (g.shown('bottom') ? band : 0) : board.right) - MARGIN
      for (let i = 0; i < items.length; i++) items[i].at = Math.max(items[i].at, i ? items[i - 1].at + items[i - 1].size + MARGIN : min)
      for (let i = items.length - 1; i >= 0; i--) items[i].at = Math.min(items[i].at, i < items.length - 1 ? items[i + 1].at - items[i].size - MARGIN : max - items[i].size)
      for (const { el, at } of items) {
        const cross = v ? el.offsetWidth : el.offsetHeight
        const off = b === 'top' ? r.y + r.h + LABEL_GAP : b === 'bottom' ? r.y - LABEL_GAP - cross : b === 'left' ? r.x + r.w + LABEL_GAP : r.x - LABEL_GAP - cross
        el.style.left = `${v ? off : at}px`
        el.style.top = `${v ? at : off}px`
      }
    }
  }

  const finish = (result: Bars | null) => {
    if (session !== s) return
    s.cancelDrag?.()
    session = null
    s.cleanup()
    done(result)
  }

  // Clicks, presses, menus, wheels never reach what is under the mode (the root covers the window
  // below the title strip): only component drags and the box's buttons act.
  root.addEventListener('contextmenu', (e) => e.preventDefault())
  root.addEventListener('wheel', (e) => e.preventDefault(), { passive: false })
  for (const c of COMPONENTS) $(`.le-comp[data-c="${c}"]`).addEventListener('pointerdown', (e) => pressComponent(e, c))
  cancelBtn.addEventListener('click', () => finish(null))
  doneBtn.addEventListener('click', () => finish(bars()))

  // Keys: Escape cancels a drag, else the mode (S29); everything else stays in the box (its buttons:
  // Tab, Enter, Space). A dialog over the mode (Quit) keeps its own keys.
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as Element | null
    if (t?.closest?.('.dialog-backdrop')) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.type === 'keydown') s.cancelDrag ? s.cancelDrag() : finish(null)
      return
    }
    if (t && box.contains(t)) {
      // Tab stays between the box's two buttons (focus never leaves for what lies under the mode).
      if (e.key === 'Tab' && e.type === 'keydown') {
        e.preventDefault()
        ;(t === cancelBtn ? doneBtn : cancelBtn).focus()
      }
      return
    }
    e.preventDefault()
    e.stopImmediatePropagation()
  }
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('keyup', onKey, true)

  const ro = new ResizeObserver(() => layout())
  for (const el of [...COMPONENTS.flatMap(parts), ...BARS.map((b) => document.getElementById(`bar-${b}`)!)]) ro.observe(el)
  window.addEventListener('resize', layout)

  // Component drag (S33 to S36, S38).
  const pressComponent = (e: PointerEvent, c: Component) => {
    if (e.button !== 0 || s.cancelDrag) return
    e.preventDefault()
    const sx = e.clientX
    const sy = e.clientY
    let started = false
    let target: Target | null = null
    const update = (x: number, y: number) => {
      const g = geometry()
      const bar = barAt(BARS.map((b) => ({ bar: b, rect: g.zones[b], exists: g.shown(b) })), x, y)
      for (const b of BARS) $(`.le-bar[data-bar="${b}"]`).classList.toggle('target', b === bar)
      if (!bar) {
        target = null
        preview.classList.remove('shown')
        return
      }
      const v = isVertical(bar)
      const rect = g.rects[bar]
      const gravity = gravityAt(bar, rect, x, y)
      const others = g.layout[bar][gravity].filter((o) => o !== c)
      const index = indexAt(others.map((o) => mid(compRect(o), v)), v ? y : x)
      target = { bar, gravity, index }
      // The potential bar's own preview: its future rect (S34).
      if (!g.shown(bar)) place($(`.le-bar[data-bar="${bar}"]`), rect)
      showBox(boxRect(c, g, target))
    }
    // The box: roughly the component's size there (its length along its own bar, a long one capped
    // in the other orientation), at its landing place among the components of that list.
    const boxRect = (c: Component, g: ReturnType<typeof geometry>, t: Target): BarRect => {
      const v = isVertical(t.bar)
      const r = g.rects[t.bar]
      const own = compRect(c)
      const ownV = isVertical(placeOf(g.layout, c).bar)
      const span = len(r, v) - 2 * g.pad
      const length = Math.max(28, Math.min(len(own, ownV), (ownV === v ? 0.45 : 0.3) * span))
      const others = g.layout[t.bar][t.gravity].filter((o) => o !== c).map(compRect)
      let a: number
      if (t.gravity === 'start') a = t.index ? lo(others[t.index - 1], v) + len(others[t.index - 1], v) + GAP : lo(r, v) + g.pad
      else a = (t.index < others.length ? lo(others[t.index], v) - GAP : lo(r, v) + len(r, v) - g.pad) - length
      a = Math.max(lo(r, v) + g.pad, Math.min(a, lo(r, v) + len(r, v) - g.pad - length))
      const cross = (v ? r.w : r.h) - 2 * g.pad
      return v ? { x: r.x + g.pad, y: a, w: cross, h: length } : { x: a, y: r.y + g.pad, w: length, h: cross }
    }
    // Moves animated (CSS transition); the first placement of a drag jumps there.
    const showBox = (r: BarRect) => {
      if (!preview.classList.contains('shown')) {
        preview.style.transition = 'none'
        place(preview, r)
        preview.classList.add('shown')
        void preview.offsetWidth
        preview.style.transition = ''
      } else place(preview, r)
    }
    const begin = () => {
      started = true
      root.classList.add('dragging')
      for (const p of parts(c)) p.classList.add('le-dragging')
      $(`.le-comp[data-c="${c}"]`).classList.add('dragging')
    }
    const end = () => {
      s.cancelDrag = null
      root.classList.remove('dragging')
      for (const p of parts(c)) p.classList.remove('le-dragging')
      $(`.le-comp[data-c="${c}"]`).classList.remove('dragging')
      preview.classList.remove('shown')
      for (const b of BARS) $(`.le-bar[data-bar="${b}"]`).classList.remove('target')
      layout()
    }
    const stop = track(e, {
      move: (ev) => {
        if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < THRESHOLD) return
        if (!started) begin()
        update(ev.clientX, ev.clientY)
      },
      up: () => {
        const t = target
        const was = started
        end()
        if (!was || !t) return // a click, or a drop outside every bar: nothing
        const next = moveComponent(bars(), c, t.bar, t.gravity, t.index)
        debug('layout', 'component drop', c, t)
        if (sameBars(next, bars())) return
        applyAppearance({ ...appearance(), bars: next })
        layout()
      },
      cancel: end,
    })
    s.cancelDrag = () => {
      stop()
      end()
    }
  }

  const s: Session = {
    cancelDrag: null,
    cleanup: () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKey, true)
      window.removeEventListener('resize', layout)
      ro.disconnect()
      root.remove()
      document.documentElement.classList.remove('layout-editing')
    },
  }
  session = s
  debug('layout', 'edit mode', start)
  layout()
  doneBtn.focus()
}

// Leave the mode as Cancel (the panel closing or rebuilding under it): no callback.
export function abortLayoutEdit() {
  if (!session) return
  const s = session
  s.cancelDrag?.()
  session = null
  s.cleanup()
}
