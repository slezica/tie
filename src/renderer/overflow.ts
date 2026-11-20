// Scrolling lists in bars (TABS.md "Overflow", SHELF.md "Space"): the tab list and the shelf strip.
// Along their bar's axis: x in a top / bottom bar, y in a left / right one (`v`). Fades at the cut
// ends, keep-in-view, auto-scroll near an end while dragging, a vertical wheel mapped sideways.

// One list's scroll along its axis.
const pos = (el: HTMLElement, v: boolean) => (v ? el.scrollTop : el.scrollLeft)
const client = (el: HTMLElement, v: boolean) => (v ? el.clientHeight : el.clientWidth)
export const scrollSize = (el: HTMLElement, v: boolean) => (v ? el.scrollHeight : el.scrollWidth)
const setPos = (el: HTMLElement, v: boolean, n: number) => (v ? (el.scrollTop = n) : (el.scrollLeft = n))

// Overflow state: fades (`.more-start` / `.more-end`, style.css) on the ends with more content.
// Returns whether the list overflows.
export function syncFades(el: HTMLElement, v: boolean): boolean {
  const over = scrollSize(el, v) > client(el, v) + 1
  el.classList.toggle('more-start', over && pos(el, v) > 1)
  el.classList.toggle('more-end', over && pos(el, v) + client(el, v) < scrollSize(el, v) - 1)
  return over
}

// Scroll the list so the child is fully visible (never scrolls anything else). The list is the
// child's offsetParent (position: relative).
export function showChild(el: HTMLElement, child: HTMLElement, v: boolean) {
  const lo = v ? child.offsetTop : child.offsetLeft
  const hi = lo + (v ? child.offsetHeight : child.offsetWidth)
  if (lo < pos(el, v)) setPos(el, v, lo)
  else if (hi > pos(el, v) + client(el, v)) setPos(el, v, hi - client(el, v))
}

// A vertical wheel scrolls a horizontal list sideways (trackpads scroll sideways already); a list in
// a vertical bar scrolls natively (S18).
export function sideWheel(el: HTMLElement, vertical: () => boolean) {
  el.addEventListener('wheel', (e) => {
    if (vertical() || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    el.scrollLeft += e.deltaY
    e.preventDefault()
  })
}

// Auto-scroll while a drag's pointer is near one of the list's ends (only while it can scroll that
// way): a tab reorder (tabs.ts dragTab), a tile / template / shelf item / group over a list (drag.ts).
// Zone: EDGE px inside each end, as deep as the fades (style.css `.more-start` / `.more-end`). Speed by
// depth into the zone, one step per frame while the pointer stays (no moves needed); `step` runs after
// each step (things moved under the pointer: recompute the target). `past`: beyond the list's ends
// counts as deepest (tab drags); else the pointer must be on the list along its axis and on its bar
// across it (tile drags: `+` and the rest of #tabs are a target of their own). The axis is read once:
// the layout doesn't change mid-drag. Callers `stop()` when the drag ends.
export const EDGE = 24
const SPEED = { min: 2, max: 12 } // px per frame
let holding = 0 // auto-scrolling drags running: keep-in-view leaves the scroll alone (tabs.ts)
export const edgeHolding = () => holding > 0

export function edgeScroll(el: HTMLElement, v: boolean, o: { past: boolean; step: () => void }) {
  let x = 0
  let y = 0
  let raf = 0
  let done = false
  holding++
  const speed = (depth: number) => SPEED.min + (SPEED.max - SPEED.min) * Math.min(1, Math.max(0, depth) / EDGE)
  const velocity = () => {
    const r = el.getBoundingClientRect()
    const p = v ? y : x
    const lo = v ? r.top : r.left
    const hi = v ? r.bottom : r.right
    if (!o.past) {
      const bar = (el.closest('.bar') ?? el).getBoundingClientRect()
      const q = v ? x : y
      if (p < lo || p > hi || q < (v ? bar.left : bar.top) || q > (v ? bar.right : bar.bottom)) return 0
    }
    if (p < lo + EDGE && pos(el, v) > 0) return -speed(lo + EDGE - p)
    if (p > hi - EDGE && pos(el, v) + client(el, v) < scrollSize(el, v) - 1) return speed(p - (hi - EDGE))
    return 0
  }
  const tick = () => {
    const vel = velocity()
    const before = pos(el, v)
    if (vel) setPos(el, v, before + vel)
    if (!vel || pos(el, v) === before) return void (raf = 0)
    raf = requestAnimationFrame(tick) // before step: its `at()` sees the loop running
    o.step()
  }
  return {
    at(nx: number, ny: number) {
      x = nx
      y = ny
      if (!done && !raf && velocity()) raf = requestAnimationFrame(tick)
    },
    stop() {
      if (done) return
      done = true
      holding--
      cancelAnimationFrame(raf)
      raf = 0
    },
  }
}
