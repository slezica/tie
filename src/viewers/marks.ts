// Change marks for live updates (live.ts): blocks an external write added or changed get a margin
// bar; it fades SEEN_MS after the block was seen on screen (not after the render), so off-screen
// changes stay marked until looked at. Unseen changes above / below the view show an edge marker
// (click = jump there). `n` jumps to the newest unseen change. docs/MARKDOWN.md "Live updates".
import { style } from './runtime'

const SEEN_MS = 3000 // marked block visible this long → fade
const FADE_MS = 1000 // fade duration (CSS transition)
const AT = 1 / 3 // jump target: block top at a third of the view

interface Mark {
  el: Element
  seq: number // update it came from (newer = higher)
  seen: boolean
}
const marks = new Map<Element, Mark>()
let seq = 0

// Bar: two shadows (the bar, then a --bg strip between it and the block); shadows aren't clipped by
// the block's own overflow, unlike a pseudo-element.
style(`
:root { --change: color-mix(in srgb, var(--accent) 75%, var(--bg)); }
.live > * { transition: box-shadow 1s; }
.live > .changed { box-shadow: -6px 0 0 0 var(--bg), -9px 0 0 0 var(--change); }
.live > .changed.fading { box-shadow: -6px 0 0 0 var(--bg), -9px 0 0 0 transparent; }
.edge-mark {
  position: fixed;
  left: 50%;
  z-index: 1;
  display: none;
  transform: translateX(-50%);
  padding: 1px 10px;
  border: 1px solid var(--change);
  background: color-mix(in srgb, var(--accent) 20%, var(--bg));
  color: var(--fg);
  font-size: 0.85em;
  cursor: pointer;
  user-select: none;
}
.edge-mark.above { top: 0; border-top: 0; border-radius: 0 0 6px 6px; }
.edge-mark.below { bottom: 0; border-bottom: 0; border-radius: 6px 6px 0 0; }
.edge-mark.on { display: block; }
`)

// Edge markers: fixed at the top / bottom of the view, outside the document.
const edge = (dir: 'above' | 'below', label: string) => {
  const el = Object.assign(document.createElement('div'), { className: `edge-mark ${dir}`, textContent: label })
  el.addEventListener('click', (e) => {
    e.preventDefault()
    const m = unseen().filter((m) => side(m.el) === dir)
    const near = dir === 'above' ? m.sort((a, b) => b.el.getBoundingClientRect().bottom - a.el.getBoundingClientRect().bottom) : m.sort((a, b) => a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top)
    if (near[0]) jump(near[0])
  })
  document.body.append(el)
  return el
}
const edges = { above: edge('above', '▲ changed above'), below: edge('below', '▼ changed below') }

const side = (el: Element): 'above' | 'below' | 'in' => {
  const r = el.getBoundingClientRect()
  return r.bottom <= 0 ? 'above' : r.top >= innerHeight ? 'below' : 'in'
}
const unseen = () => [...marks.values()].filter((m) => !m.seen && m.el.isConnected)

// Seen: enough of it on screen (half of it, or a third of the view for tall blocks).
function visible(el: Element): boolean {
  if (document.visibilityState !== 'visible') return false
  const r = el.getBoundingClientRect()
  const shown = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)
  return shown > 0 && shown >= Math.min(r.height * 0.5, innerHeight * 0.3)
}

function see(m: Mark) {
  if (m.seen) return
  m.seen = true
  setTimeout(() => {
    if (marks.get(m.el) !== m) return
    m.el.classList.add('fading')
    setTimeout(() => {
      if (marks.get(m.el) !== m) return
      m.el.classList.remove('changed', 'fading')
      marks.delete(m.el)
    }, FADE_MS)
  }, SEEN_MS)
}

// Re-check after any scroll, resize, update or visibility change.
export function refresh() {
  for (const m of marks.values()) if (!m.el.isConnected) marks.delete(m.el)
  for (const m of unseen()) if (visible(m.el)) see(m)
  const u = unseen().map((m) => side(m.el))
  edges.above.classList.toggle('on', u.includes('above'))
  edges.below.classList.toggle('on', u.includes('below'))
}

export function mark(els: Element[]) {
  if (!els.length) return
  seq++
  for (const el of els) {
    el.classList.remove('fading')
    el.classList.add('changed')
    marks.set(el, { el, seq, seen: false })
  }
  refresh()
}

export function clear() {
  for (const m of marks.values()) m.el.classList.remove('changed', 'fading')
  marks.clear()
  refresh()
}

function jump(m: Mark) {
  scrollTo({ top: scrollY + m.el.getBoundingClientRect().top - innerHeight * AT, behavior: 'instant' })
  see(m)
  refresh()
}

// `n`: newest unseen change first (document order within one update); each jump marks it seen, so
// repeated `n` walks the unseen ones. None unseen: the newest still-marked change.
export function next() {
  const order = (a: Mark, b: Mark) => b.seq - a.seq || (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)
  const m = unseen().sort(order)[0] ?? [...marks.values()].filter((m) => m.el.isConnected).sort(order)[0]
  if (m) jump(m)
}

// Harness view.
export const view = () => ({ marked: marks.size, unseen: unseen().length })

let frame = 0
const later = () => (frame ||= requestAnimationFrame(() => ((frame = 0), refresh())))
addEventListener('scroll', later)
addEventListener('resize', later)
document.addEventListener('visibilitychange', later)
