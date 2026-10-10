// Mouse interactions: tile/template/shelf-item drag & drop, border resize, floating resize.
import { compute, dropSide, insert, move, resize, contains, type Border, type Rect, type Side, type TileId } from '@core/layout'
import { S, GAP, TITLE, MIN, boardRect, shelfRect, location, debug, type Kind } from './state'
import { place, openTile, setFloatRect, defaultFloatRect, clampFloat, type Placement } from './ops'
import { render } from './render'
import { shelfItemEl } from './shelf'
import { displayIcon, displayTitle, iconHtml } from './tile'

export type DragSource = { type: 'tile'; id: TileId } | { type: 'template'; kind: Kind; label: string }

const THRESHOLD = 4

// Follow a pointer from pointerdown until release. Listens on window (capture phase), so a
// release is seen even if pointer capture is lost; a move with no button held counts as a
// missed release. setPointerCapture keeps events flowing over embedded content.
function track(e: PointerEvent, h: { move: (ev: PointerEvent) => void; up: (ev: PointerEvent) => void; cancel?: () => void }) {
  try {
    ;((e.currentTarget ?? e.target) as HTMLElement).setPointerCapture(e.pointerId)
  } catch {}
  const id = e.pointerId
  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return
    if ((ev.buttons & 1) === 0) return onUp(ev) // release was missed
    h.move(ev)
  }
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return
    stop()
    h.up(ev)
  }
  const onCancel = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return
    stop()
    h.cancel?.()
  }
  const stop = () => {
    window.removeEventListener('pointermove', onMove, true)
    window.removeEventListener('pointerup', onUp, true)
    window.removeEventListener('pointercancel', onCancel, true)
  }
  window.addEventListener('pointermove', onMove, true)
  window.addEventListener('pointerup', onUp, true)
  window.addEventListener('pointercancel', onCancel, true)
  return stop
}
let dragging = false
export const isDragging = () => dragging

const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

interface Target {
  placement: Placement
  preview: Rect | null // window coords
  line?: Rect // shelf insertion marker
}

// Where would the source land if dropped at (x, y)?
function computeTarget(src: DragSource, x: number, y: number, shift: boolean, grab: { dx: number; dy: number }): Target | null {
  const b = boardRect()
  const sr = shelfRect()
  const srcId = src.type === 'tile' ? src.id : null

  if (inside(sr, x, y)) {
    // Insert index among shelf items by vertical midpoint.
    const ids = S.shelf
    let index = ids.length
    for (let i = 0; i < ids.length; i++) {
      const r = shelfItemEl(ids[i])?.getBoundingClientRect()
      if (r && y < r.top + r.height / 2) {
        index = i
        break
      }
    }
    const els = document.getElementById('items')!
    const er = els.getBoundingClientRect()
    const ref = ids[index] ? shelfItemEl(ids[index])!.getBoundingClientRect() : null
    const ly = ref ? ref.top - 3 : ids.length ? shelfItemEl(ids[ids.length - 1])!.getBoundingClientRect().bottom + 2 : er.top + 2
    return { placement: { type: 'shelf', index }, preview: null, line: { x: sr.x + 6, y: ly, w: sr.w - 12, h: 2 } }
  }

  if (!inside(b, x, y)) return null

  if (shift) {
    const f = srcId ? S.floats.find((f) => f.id === srcId) : undefined
    const base = f ?? defaultFloatRect()
    const r = clampFloat({ x: x - b.x - grab.dx, y: y - b.y - grab.dy, w: base.w, h: base.h })
    return { placement: { type: 'float', rect: r }, preview: { x: b.x + r.x, y: b.y + r.y, w: r.w, h: r.h } }
  }

  if (!S.tree || (S.tree.type === 'leaf' && S.tree.id === srcId)) {
    return { placement: { type: 'slot', at: null, side: 'r' }, preview: b }
  }

  // Slotted tile under the cursor (floating tiles are not drop targets).
  const layout = compute(S.tree, b, { gap: GAP, bar: TITLE, collapsed: S.collapsed })
  for (const [id, r] of layout.tiles) {
    if (!inside(r, x, y)) continue
    if (id === srcId) return null
    const side: Side = dropSide(r, x, y)
    const probe = srcId ?? '__new__'
    const tree = srcId && contains(S.tree, srcId) ? move(S.tree, srcId, id, side) : insert(S.tree, id, side, probe)
    const collapsed = new Set(S.collapsed)
    collapsed.delete(probe)
    const after = compute(tree, b, { gap: GAP, bar: TITLE, collapsed })
    return { placement: { type: 'slot', at: id, side }, preview: after.tiles.get(probe) ?? null }
  }
  return null
}

function applyDrop(src: DragSource, t: Target) {
  debug('layout', 'drop', src, t.placement)
  if (src.type === 'template') openTile(src.kind, t.placement)
  else place(src.id, t.placement)
}

// Pointer-down on a draggable: becomes a drag past THRESHOLD, otherwise a click.
export function startDrag(e: PointerEvent, src: DragSource, onClick?: () => void) {
  const sx = e.clientX
  const sy = e.clientY
  const srcRect = src.type === 'tile' ? S.rects.get(src.id) : undefined
  const grab = srcRect && location((src as any).id) === 'floating' ? { dx: sx - srcRect.x, dy: sy - srcRect.y } : { dx: 120, dy: 14 }
  let started = false
  let shift = e.shiftKey
  let lx = sx
  let ly = sy
  let target: Target | null = null
  const preview = document.getElementById('preview')!
  const line = document.getElementById('shelf-line')!
  const ghost = document.getElementById('ghost')!

  const update = () => {
    target = computeTarget(src, lx, ly, shift, grab)
    const p = target?.preview
    preview.style.display = p ? 'block' : 'none'
    if (p) Object.assign(preview.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px` })
    preview.classList.toggle('float', target?.placement.type === 'float')
    const l = target?.line
    line.style.display = l ? 'block' : 'none'
    if (l) Object.assign(line.style, { left: `${l.x}px`, top: `${l.y}px`, width: `${l.w}px` })
    ghost.style.left = `${lx + 12}px`
    ghost.style.top = `${ly + 12}px`
  }

  const begin = () => {
    started = dragging = true
    document.body.classList.add('dragging')
    if (S.revealed) (S.revealed = null), render()
    const label = src.type === 'tile' ? displayTitle(S.tiles.get(src.id)!) : src.label
    const icon = src.type === 'tile' ? displayIcon(S.tiles.get(src.id)!) : ''
    ghost.innerHTML = `${iconHtml(icon)}<span>${label.replace(/</g, '&lt;')}</span>`
    ghost.style.display = 'flex'
    debug('layout', 'drag start', src)
  }

  const onMove = (ev: PointerEvent) => {
    lx = ev.clientX
    ly = ev.clientY
    shift = ev.shiftKey
    if (!started && Math.hypot(lx - sx, ly - sy) < THRESHOLD) return
    if (!started) begin()
    update()
  }
  const onKey = (ev: KeyboardEvent) => {
    if (!started) return
    if (ev.key === 'Escape') {
      target = null
      finish()
      return
    }
    if (ev.key === 'Shift') {
      shift = ev.type === 'keydown'
      update()
    }
  }
  const finish = () => {
    stopTracking()
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('keyup', onKey, true)
    preview.style.display = line.style.display = ghost.style.display = 'none'
    document.body.classList.remove('dragging')
    dragging = false
  }
  const onUp = () => {
    const wasStarted = started
    const t = target
    finish()
    if (!wasStarted) onClick?.()
    else if (t) applyDrop(src, t)
  }
  const onCancel = () => {
    target = null
    finish()
  }
  const stopTracking = track(e, { move: onMove, up: onUp, cancel: onCancel })
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('keyup', onKey, true)
}

// Border between slotted siblings: drag resizes both neighbors.
const borderData = new WeakMap<HTMLElement, Border>()
export const setBorder = (h: HTMLElement, br: Border) => borderData.set(h, br)

export function attachBorder(h: HTMLElement) {
  h.addEventListener('pointerdown', (e) => {
    const br = borderData.get(h)
    if (e.button !== 0 || !S.tree || !br) return
    e.preventDefault()
    const start = S.tree
    const s0 = br.dir === 'row' ? e.clientX : e.clientY
    document.body.classList.add('dragging', br.dir === 'row' ? 'resizing-row' : 'resizing-col')
    const done = () => document.body.classList.remove('dragging', 'resizing-row', 'resizing-col')
    track(e, {
      move: (ev) => {
        const d = (br.dir === 'row' ? ev.clientX : ev.clientY) - s0
        S.tree = resize(start, br.path, br.index, d, br.length, MIN)
        render()
      },
      up: done,
      cancel: done,
    })
  })
}

// Floating tile edges/corners; e.target is a .rz handle.
export function startFloatResize(e: PointerEvent, id: TileId) {
  const h = e.target as HTMLElement
  const f = S.floats.find((f) => f.id === id)
  if (e.button !== 0 || !f) return
  e.preventDefault()
  e.stopPropagation()
  const dir = h.dataset.dir!
  const r0 = { x: f.x, y: f.y, w: f.w, h: f.h }
  const sx = e.clientX
  const sy = e.clientY
  document.body.classList.add('dragging')
  const done = () => document.body.classList.remove('dragging')
  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - sx
    const dy = ev.clientY - sy
    const r = { ...r0 }
    if (dir.includes('e')) r.w = r0.w + dx
    if (dir.includes('s')) r.h = r0.h + dy
    if (dir.includes('w')) (r.x = r0.x + dx), (r.w = r0.w - dx)
    if (dir.includes('n')) (r.y = r0.y + dy), (r.h = r0.h - dy)
    setFloatRect(id, r)
  }
  track(e, { move: onMove, up: done, cancel: done })
}
