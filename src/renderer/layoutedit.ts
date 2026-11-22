// Edit layout mode (LAYOUT.md "Edit mode"; design S28 to S38): entered from the settings panel's
// Layout row (`Modify`). The board is dimmed and takes no input; the four bars are indicated
// (existing outlined, absent ones as potential zones); Tabs, Shelf and Templates are dragged to any
// bar, either end, any order. Each drop is applied live; Done hands the layout back to the panel
// (its draft), Cancel / Escape hand back nothing (the panel re-applies its draft). Never writes.
import { BARS, COMPONENTS, COMPONENT_LABELS, barAt, barEmpty, barRects, barZones, gravityAt, indexAt, isVertical, moveComponent, placeOf, sameBars, type Bar, type BarRect, type Bars, type Component, type Gravity } from '@core/bars'
import { bars } from './bars'
import { shownSizes } from './barsize'
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
const INSET = 4 // a label's chip stays this far inside its component's box, every side
const LABEL_MIN = 0.65 // smallest label scale (font, padding); a label still too long is truncated

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

// Geometry: the title strip (stylesheet), each bar's size (shown, barsize.ts), the applied layout.
function geometry() {
  const cs = getComputedStyle(document.documentElement)
  const px = (n: string) => parseFloat(cs.getPropertyValue(n)) || 0
  const layout = bars()
  const shown = (b: Bar) => !barEmpty(layout, b)
  const args = [innerWidth, innerHeight, px('--strip-h'), shownSizes(), shown] as const
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
  // Labels: inside their component's box, centred on it, over its content; window-positioned (they
  // push nothing). Never past the box: INSET inside it on every side (feel round 2). A label that
  // doesn't fit shrinks (`--ls`: font and padding, down to LABEL_MIN), then truncates (ellipsis). In
  // a vertical bar a label is rotated (read top to bottom) where that makes it larger; where it fits
  // either way, the bar's orientation: rotated when any of its labels is (one look per bar unless a
  // label would have to shrink).
  const placeLabels = (g: ReturnType<typeof geometry>) => {
    for (const b of BARS) {
      const v = isVertical(b)
      const items = [...g.layout[b].start, ...g.layout[b].end].map((c) => ({ el: $(`.le-label[data-c="${c}"]`), comp: compRect(c), rotate: false }))
      // The scale a label needs to fit its box in an orientation (1: fits as is).
      const need = (el: HTMLElement, comp: BarRect, rotated: boolean) => {
        el.classList.toggle('rotated', rotated)
        Object.assign(el.style, { maxWidth: '', maxHeight: '' })
        el.style.setProperty('--ls', '1')
        const r = el.getBoundingClientRect()
        return Math.min(1, (comp.w - 2 * INSET) / r.width, (comp.h - 2 * INSET) / r.height)
      }
      const fits = items.map((i) => (v ? { across: need(i.el, i.comp, false), rotated: need(i.el, i.comp, true) } : null))
      const barRotated = fits.some((f) => f && f.rotated > f.across)
      items.forEach((i, n) => {
        const f = fits[n]
        i.rotate = !!f && (f.rotated === f.across ? barRotated : f.rotated > f.across)
      })
      for (const { el, comp, rotate } of items) {
        const w = Math.max(0, comp.w - 2 * INSET)
        const h = Math.max(0, comp.h - 2 * INSET)
        let ls = Math.max(LABEL_MIN, Math.floor(need(el, comp, rotate) * 1000) / 1000)
        el.style.setProperty('--ls', String(ls))
        // Text doesn't scale quite linearly with the font: a step smaller while it is still too big.
        const fits = () => {
          const r = el.getBoundingClientRect()
          return r.width <= w && r.height <= h
        }
        while (ls > LABEL_MIN && !fits()) {
          ls = Math.max(LABEL_MIN, Math.round((ls - 0.02) * 1000) / 1000)
          el.style.setProperty('--ls', String(ls))
        }
        Object.assign(el.style, { maxWidth: `${w}px`, maxHeight: `${h}px` }) // past LABEL_MIN: truncated
        const r = el.getBoundingClientRect()
        el.style.left = `${comp.x + (comp.w - r.width) / 2}px`
        el.style.top = `${comp.y + (comp.h - r.height) / 2}px`
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
      document.documentElement.classList.add('layout-dragging') // bar edges out of the way (style.css)
      for (const p of parts(c)) p.classList.add('le-dragging')
      $(`.le-comp[data-c="${c}"]`).classList.add('dragging')
    }
    const end = () => {
      s.cancelDrag = null
      root.classList.remove('dragging')
      document.documentElement.classList.remove('layout-dragging')
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
      document.documentElement.classList.remove('layout-editing', 'layout-dragging')
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
