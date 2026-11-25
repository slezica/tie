// Edit layout mode (LAYOUT.md "Edit mode"; design S28 to S38): entered from the settings panel's
// Layout row (`Modify`). The board is dimmed and takes no input; the four bars are indicated
// (existing outlined, absent ones as potential zones); Tabs, Shelf and Templates are dragged to any
// bar, either end, any order. Each drop is applied live; Done hands the layout back to the panel
// (its draft), Cancel / Escape hand back nothing (the panel re-applies its draft). Never writes the
// settings. Bar resizes in the mode (S42, S46): live; Done keeps (writes) them, Cancel restores the
// sizes as the mode opened (barsize.ts holdSizes / releaseSizes).
import { BARS, COMPONENTS, COMPONENT_LABELS, barAt, barEmpty, barRects, barZones, gravityAt, indexAt, isVertical, moveComponent, placeOf, sameBars, type Bar, type BarRect, type Bars, type Component, type Gravity } from '@core/bars'
import { bars } from './bars'
import { shownSizes, holdSizes, releaseSizes } from './barsize'
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
const INSET = 4 // a label's chip stays this far inside its component's box, every side
// A label's room (feel round 8): the free drag box is its label plus this each side; in the mode a
// component is at least its label plus this each side along its bar (`--le-min`, `grow`).
const LABEL_PAD = 6
const LABEL_MIN = 0.65 // a crowded bar (no room to grow): smallest label scale (font, padding), then truncated
// The templates' divider beside the shelf (style.css #templates.after-shelf / .before-shelf), along
// the bar: its margin outside the box, its padding and border inside.
const DIVIDER_OUT = 4
const DIVIDER_IN = 7
const BOX_MS = 140 // the drag box: snap, unsnap, a new landing place, the return after a drop outside every bar

// A component's elements: the brand sits just before the tabs (S5) and moves with them.
const parts = (c: Component) => (c === 'tabs' ? ['brand', 'tabs'] : [c]).map((id) => document.getElementById(id)!)

// A component's box (window px): the union of its shown parts (the brand is hidden when empty), as
// laid out: without the shift a drag gives it (`transform`, as it is now: mid-transition too).
function compRect(c: Component): BarRect {
  const rs = parts(c)
    .map((p) => {
      const r = p.getBoundingClientRect()
      const t = getComputedStyle(p).transform
      const m = t === 'none' ? null : new DOMMatrixReadOnly(t)
      return { x: r.left - (m?.m41 ?? 0), y: r.top - (m?.m42 ?? 0), w: r.width, h: r.height }
    })
    .filter((r) => r.w > 0 && r.h > 0)
  if (!rs.length) return { x: 0, y: 0, w: 0, h: 0 }
  const x = Math.min(...rs.map((r) => r.x))
  const y = Math.min(...rs.map((r) => r.y))
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y }
}

const lo = (r: BarRect, v: boolean) => (v ? r.y : r.x)
const len = (r: BarRect, v: boolean) => (v ? r.h : r.w)
const mid = (r: BarRect, v: boolean) => lo(r, v) + len(r, v) / 2

// The templates with their divider now (beside the shelf in their group: bars.ts).
const divided = (c: Component) => c === 'templates' && /\b(after|before)-shelf\b/.test(document.getElementById(c)!.className)
// A component's length along an axis, without its divider.
const natural = (c: Component, v: boolean) => len(compRect(c), v) - (divided(c) ? DIVIDER_IN : 0)

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
    <div class="le-preview"><span class="le-chip"></span></div>
    ${COMPONENTS.map((c) => `<div class="le-label le-chip" data-c="${c}">${COMPONENT_LABELS[c]}</div>`).join('')}
    <span class="le-chip le-measure" aria-hidden="true"></span>
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
  const chip = preview.firstElementChild as HTMLElement

  // Each label's own size (full scale, uncut): across, and its length rotated. The free box, the
  // components' room in the mode and the labels' orientation are drawn from it.
  const measure = $('.le-measure')
  const dims = Object.fromEntries(
    COMPONENTS.map((c) => {
      measure.textContent = COMPONENT_LABELS[c]
      measure.classList.remove('rotated')
      const a = measure.getBoundingClientRect()
      measure.classList.add('rotated')
      return [c, { w: a.width, h: a.height, rh: measure.getBoundingClientRect().height }]
    }),
  ) as Record<Component, { w: number; h: number; rh: number }>
  const widest = Math.max(...COMPONENTS.map((c) => dims[c].w))
  const padOf = (b: Bar) => parseFloat(getComputedStyle(document.getElementById(`bar-${b}`)!).getPropertyValue('--pad')) || 0
  // Labels in a side bar too narrow for the longest one across (its inset each side, in the bar's
  // rows: less its --pad): all rotated, read top to bottom. One look per bar, whatever it holds (a
  // drop turns no other label).
  const rotatedIn = (b: Bar, g: ReturnType<typeof geometry>) => isVertical(b) && widest + 2 * INSET > g.rects[b].w - 2 * padOf(b)
  // A component's room along bar `b` in the mode: its label's length there plus LABEL_PAD each side.
  const minAlong = (c: Component, b: Bar, g: ReturnType<typeof geometry>) => (rotatedIn(b, g) ? dims[c].rh : isVertical(b) ? dims[c].h : dims[c].w) + 2 * LABEL_PAD

  // Indicators, component boxes, labels: re-placed on every change of the window, the bars or a
  // component's size (a tab opened meanwhile), and after each drop.
  const layout = () => {
    const g = geometry()
    grow(g)
    for (const b of BARS) {
      const el = $(`.le-bar[data-bar="${b}"]`)
      place(el, g.zones[b])
      el.classList.toggle('exists', g.shown(b))
    }
    for (const b of BARS) for (const c of [...g.layout[b].start, ...g.layout[b].end]) place($(`.le-comp[data-c="${c}"]`), clip(compRect(c), g.rects[b]))
    placeLabels(g)
  }
  // Components grown to their label's room along their bar (feel round 8): `--le-min` on the
  // component's element (style.css: a min size while the mode runs; the tabs' on #tabs, the brand
  // adds to it; the templates' divider added). The others make room as in normal use (the tab list
  // shrinks first). A bar too full for that (its components past its end): no minimum there, its
  // components as in normal use; their labels shrink, then truncate (placeLabels).
  const grow = (g: ReturnType<typeof geometry>) => {
    for (const b of BARS) {
      const cs = [...g.layout[b].start, ...g.layout[b].end].map((c) => ({ c, el: document.getElementById(c)! }))
      for (const { c, el } of cs) el.style.setProperty('--le-min', `${minAlong(c, b, g) + (divided(c) ? DIVIDER_IN : 0)}px`)
      const bar = document.getElementById(`bar-${b}`)!
      const over = isVertical(b) ? bar.scrollHeight > bar.clientHeight : bar.scrollWidth > bar.clientWidth
      if (g.shown(b) && over) for (const { el } of cs) el.style.removeProperty('--le-min')
    }
  }
  const clip = (r: BarRect, to: BarRect): BarRect => {
    const x = Math.max(r.x, to.x)
    const y = Math.max(r.y, to.y)
    return { x, y, w: Math.max(0, Math.min(r.x + r.w, to.x + to.w) - x), h: Math.max(0, Math.min(r.y + r.h, to.y + to.h) - y) }
  }
  // Labels: inside their component's box (its part in the bar), centred on it, over its content;
  // window-positioned (they push nothing). Never past the box: INSET inside it on every side (feel
  // round 2). Orientation: `rotatedIn`. Grown components (`grow`) hold their label whole; in a
  // crowded bar a label that doesn't fit shrinks (`--ls`: font and padding, down to LABEL_MIN), then
  // truncates (ellipsis).
  const placeLabels = (g: ReturnType<typeof geometry>) => {
    for (const b of BARS) {
      const rotate = rotatedIn(b, g)
      for (const c of [...g.layout[b].start, ...g.layout[b].end]) {
        const el = $(`.le-label[data-c="${c}"]`)
        const comp = clip(compRect(c), g.rects[b])
        const w = Math.max(0, comp.w - 2 * INSET)
        const h = Math.max(0, comp.h - 2 * INSET)
        el.classList.toggle('rotated', rotate)
        Object.assign(el.style, { maxWidth: '', maxHeight: '' })
        el.style.setProperty('--ls', '1')
        const inBox = () => {
          const r = el.getBoundingClientRect()
          return r.width <= w + 0.01 && r.height <= h + 0.01
        }
        if (!inBox()) {
          const r = el.getBoundingClientRect()
          let ls = Math.max(LABEL_MIN, Math.floor(Math.min(1, w / r.width, h / r.height) * 1000) / 1000)
          el.style.setProperty('--ls', String(ls))
          // Text doesn't scale quite linearly with the font: a step smaller while it is still too big.
          while (ls > LABEL_MIN && !inBox()) {
            ls = Math.max(LABEL_MIN, Math.round((ls - 0.02) * 1000) / 1000)
            el.style.setProperty('--ls', String(ls))
          }
          Object.assign(el.style, { maxWidth: `${w}px`, maxHeight: `${h}px` }) // past LABEL_MIN: truncated
        }
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
    releaseSizes(!!result)
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

  // The drag box (`.le-preview`, S38, S52, S55): shown for the whole drag, the component's label in
  // it (centred, whole; feel round 8). Snapped (a target): the landing rect, the label as labels are
  // in that bar (`rotatedIn`). Free (over no bar): centred on the pointer, the label (across) plus
  // LABEL_PAD each side, following it at once. A change of form (snap, unsnap) or of landing place animates
  // (BOX_MS, eased) from where the box is drawn toward its goal, which keeps moving with the pointer
  // meanwhile (free); `then`: once there (the return to the origin: hide). The clock is a Web
  // Animation without keyframes (the harness's settle waits for it); frames draw (lerp), its end
  // draws the goal.
  type Tween = { from: BarRect; clock: Animation; then?: () => void }
  let snapped = false
  let goal: BarRect | null = null
  let drawn: BarRect | null = null
  let tween: Tween | null = null
  let frame = 0
  const same = (a: BarRect | null, b: BarRect | null) => !!a && !!b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5
  const draw = (r: BarRect) => {
    drawn = r
    place(preview, r)
  }
  const ease = (t: number) => 1 - (1 - t) * (1 - t)
  const step = () => {
    frame = 0
    if (!tween || !goal) return
    const t = Math.min(1, (Number(tween.clock.currentTime) || 0) / BOX_MS)
    if (t < 1 && tween.clock.playState === 'running') {
      const k = ease(t)
      const { from: f } = tween
      draw({ x: f.x + (goal.x - f.x) * k, y: f.y + (goal.y - f.y) * k, w: f.w + (goal.w - f.w) * k, h: f.h + (goal.h - f.h) * k })
      frame = requestAnimationFrame(step)
      return
    }
    const then = tween.then
    tween = null
    draw(goal)
    then?.()
  }
  // Aim the box at `r` (`snap`: a landing rect; else the pointer's), its label `rotated` or not.
  // `then`: after the animation.
  const aimBox = (r: BarRect, snap: boolean, rotated: boolean, then?: () => void) => {
    chip.classList.toggle('rotated', rotated)
    const animate = !!drawn && (!!then || snap !== snapped || (snap && !same(r, goal)))
    snapped = snap
    goal = r
    if (!drawn) {
      draw(r)
      preview.classList.add('shown')
    } else if (animate) {
      tween?.clock.cancel()
      const tw: Tween = { from: { ...drawn }, clock: preview.animate([], BOX_MS), then }
      tween = tw
      // Its end drawn as the clock finishes (before anything awaiting `finished` after it runs).
      tw.clock.finished.then(() => tween === tw && (cancelAnimationFrame(frame), step())).catch(() => {}) // cancelled: replaced or hidden
      if (!frame) frame = requestAnimationFrame(step)
    } else if (!tween) draw(r)
  }
  const hideBox = () => {
    tween?.clock.cancel()
    tween = null
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    drawn = goal = null
    snapped = false
    preview.classList.remove('shown')
    for (const c of COMPONENTS) $(`.le-label[data-c="${c}"]`).classList.remove('le-lifted') // the box carried it: back in place
  }

  // Component drag (S33 to S36, S38).
  const pressComponent = (e: PointerEvent, c: Component) => {
    if (e.button !== 0 || s.cancelDrag) return
    e.preventDefault()
    const sx = e.clientX
    const sy = e.clientY
    let started = false
    let target: Target | null = null
    let origin: BarRect | null = null // the component's box as the drag began
    let free = { w: 0, h: 0 } // the free box's size
    const label = $(`.le-label[data-c="${c}"]`)
    const update = (x: number, y: number) => {
      const g = geometry()
      const bar = barAt(BARS.map((b) => ({ bar: b, rect: g.zones[b], exists: g.shown(b) })), x, y)
      for (const b of BARS) $(`.le-bar[data-bar="${b}"]`).classList.toggle('target', b === bar)
      if (!bar) {
        target = null
        aimBox({ x: x - free.w / 2, y: y - free.h / 2, ...free }, false, false)
        shift(new Map(), false)
        lift(false)
        return
      }
      const v = isVertical(bar)
      const gravity = gravityAt(bar, g.rects[bar], x, y)
      const others = g.layout[bar][gravity].filter((o) => o !== c)
      const index = indexAt(others.map((o) => mid(compRect(o), v)), v ? y : x)
      target = { bar, gravity, index }
      placeTarget(g)
    }
    // The target's indicators: a potential bar's own preview, its future rect (S34); the box; the
    // others of its list making room.
    const placeTarget = (g: ReturnType<typeof geometry>) => {
      if (!target) return
      if (!g.shown(target.bar)) place($(`.le-bar[data-bar="${target.bar}"]`), g.rects[target.bar])
      const { box, shifts } = landing(c, g, target)
      aimBox(box, true, rotatedIn(target.bar, g))
      shift(shifts, isVertical(target.bar))
      const from = placeOf(g.layout, c)
      lift(from.bar === target.bar && from.gravity === target.gravity)
    }
    // Its own list the target: the others close over its place, so the dragged component's content
    // hides there (its outline, the drag's handle, stays; its label rides in the box all along).
    const lift = (on: boolean) => {
      for (const el of parts(c)) el.classList.toggle('le-lifted', on)
    }
    // The drop's result, drawn (feel round 6): the target list as it will be (`c` at its index),
    // packed from its end of the bar (the bar's padding), the bar's gap between components, each at
    // its length (the templates' divider where the shelf will be beside them). The box: `c` there,
    // roughly its size (its length along its own bar, a long one capped in the other orientation; at
    // least its room in the target bar, `minAlong`, as it will be grown there).
    // `shifts`: how far each other component of the list moves along the bar to its place.
    const landing = (c: Component, g: ReturnType<typeof geometry>, t: Target) => {
      const v = isVertical(t.bar)
      const r = g.rects[t.bar]
      const cs = getComputedStyle(document.getElementById(`bar-${t.bar}`)!)
      const gap = parseFloat(v ? cs.rowGap : cs.columnGap) || 0
      const a0 = lo(r, v) + (parseFloat(v ? cs.paddingTop : cs.paddingLeft) || 0)
      const a1 = lo(r, v) + len(r, v) - (parseFloat(v ? cs.paddingBottom : cs.paddingRight) || 0)
      const ownV = isVertical(placeOf(g.layout, c).bar)
      const span = len(r, v) - 2 * g.pad
      const length = Math.max(minAlong(c, t.bar, g), 28, Math.min(natural(c, ownV), (ownV === v ? 0.45 : 0.3) * span))
      const others = g.layout[t.bar][t.gravity].filter((o) => o !== c)
      const list = [...others]
      list.splice(Math.max(0, Math.min(others.length, t.index)), 0, c)
      const pair = (i: number) => (list[i] === 'shelf' && list[i + 1] === 'templates') || (list[i] === 'templates' && list[i + 1] === 'shelf')
      const size = list.map((o, i) => (o === c ? length : natural(o, v)) + (o === 'templates' && (pair(i - 1) || pair(i)) ? DIVIDER_IN : 0))
      const space = (i: number) => gap + (pair(i) ? DIVIDER_OUT : 0) // between list[i] and list[i + 1]
      const at: number[] = []
      if (t.gravity === 'start') list.reduce((p, _, i) => ((at[i] = p), p + size[i] + space(i)), a0)
      else list.reduceRight((p, _, i) => ((at[i] = p - size[i]), at[i] - space(i - 1)), a1)
      const shifts = new Map(others.map((o) => [o, at[list.indexOf(o)] - lo(compRect(o), v)]))
      const i = list.indexOf(c)
      const a = Math.max(a0, Math.min(at[i], a1 - size[i]))
      const cross = (v ? r.w : r.h) - 2 * g.pad
      const box: BarRect = v ? { x: r.x + g.pad, y: a, w: cross, h: size[i] } : { x: a, y: r.y + g.pad, w: size[i], h: cross }
      return { box, shifts }
    }
    // The others' shifts (`transform`, animated while dragging: style.css), their boxes and labels
    // with them; an empty map: all back.
    const shift = (shifts: Map<Component, number>, v: boolean) => {
      for (const o of COMPONENTS) {
        const d = shifts.get(o) ?? 0
        const tf = Math.abs(d) < 0.5 ? '' : v ? `translateY(${d}px)` : `translateX(${d}px)`
        for (const el of [...parts(o), $(`.le-comp[data-c="${o}"]`), $(`.le-label[data-c="${o}"]`)]) el.style.transform = tf
      }
    }
    const begin = () => {
      started = true
      hideBox() // a return still animating: done
      origin = compRect(c)
      free = { w: dims[c].w + 2 * LABEL_PAD, h: dims[c].h + 2 * LABEL_PAD }
      chip.textContent = COMPONENT_LABELS[c]
      // The label leaves its place for the box (hidden there until the box hides: hideBox).
      label.classList.add('le-lifted')
      root.classList.add('dragging')
      document.documentElement.classList.add('layout-dragging') // bar edges out of the way (style.css)
      for (const p of parts(c)) p.classList.add('le-dragging')
      $(`.le-comp[data-c="${c}"]`).classList.add('dragging')
    }
    // `back`: released over no bar; the box returns to the component's place, then hides. Else (a
    // drop, Escape, a cancel) it hides at once.
    const end = (back = false) => {
      s.cancelDrag = null
      root.classList.remove('dragging')
      document.documentElement.classList.remove('layout-dragging')
      shift(new Map(), false) // at once: animated only while dragging (style.css)
      lift(false)
      for (const p of parts(c)) p.classList.remove('le-dragging')
      $(`.le-comp[data-c="${c}"]`).classList.remove('dragging')
      if (back && origin && drawn) aimBox(origin, false, label.classList.contains('rotated'), hideBox)
      else hideBox()
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
        const next = was && t ? moveComponent(bars(), c, t.bar, t.gravity, t.index) : null
        end(was && !t)
        if (!next || !t) return // a click, or a drop outside every bar: nothing
        debug('layout', 'component drop', c, t)
        if (sameBars(next, bars())) return
        applyAppearance({ ...appearance(), bars: next })
        layout()
      },
      cancel: () => end(),
    })
    s.cancelDrag = () => {
      stop()
      end()
    }
  }

  const s: Session = {
    cancelDrag: null,
    cleanup: () => {
      hideBox()
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKey, true)
      window.removeEventListener('resize', layout)
      ro.disconnect()
      for (const c of COMPONENTS) document.getElementById(c)!.style.removeProperty('--le-min') // natural sizes again
      root.remove()
      document.documentElement.classList.remove('layout-editing', 'layout-dragging')
    },
  }
  session = s
  holdSizes()
  debug('layout', 'edit mode', start)
  layout()
  doneBtn.focus()
}

// Leave the mode as Cancel (the panel closing or rebuilding under it): no callback; sizes restored.
export function abortLayoutEdit() {
  if (!session) return
  const s = session
  s.cancelDrag?.()
  session = null
  s.cleanup()
  releaseSizes(false)
}
