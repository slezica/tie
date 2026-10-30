// Mouse interactions: tile/template/shelf-item drag & drop, border resize, floating resize.
import { compute, dropSide, insert, move, resize, contains, type Border, type Rect, type Side, type TileId } from '@core/layout'
import { S, GAP, TITLE, MIN, SLOT, SLOT_GAP, tie, boardRect, shelfRect, location, spaceOf, debug, type Kind } from './state'
import { place, swap, activate, openTile, setFloatRect, defaultFloatRect, clampFloat, cwdOf, besidePlacement, type Placement } from './ops'
import type { OpenOpts } from './kinds'
import { tabDropAt, markTabDrop, newTab, moveToTab, switchTab, edgeScroll } from './tabs'
import { render } from './render'
import { setShelfGhost, clearShelfGhost, hideShelfItem } from './shelf'
import { displayIcon, displayTitle } from './tile'
import { iconHtml } from './icons'
import { TEMPLATES, type Template } from './kinds'
import { infoDialog } from './dialog'

export type DragSource = { type: 'tile'; id: TileId } | { type: 'template'; template: Template['id']; label: string }

const THRESHOLD = 4

// Follow a pointer from pointerdown until release. Listens on window (capture phase), so a
// release is seen even if pointer capture is lost; a move with no button held counts as a
// missed release. Pointer capture does not hold over content frames (out-of-process): while
// tracking, frames ignore the pointer (body.tracking, style.css), else they swallow moves and the
// release.
export function track(e: PointerEvent, h: { move: (ev: PointerEvent) => void; up: (ev: PointerEvent) => void; cancel?: () => void }) {
  document.body.classList.add('tracking')
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
    document.body.classList.remove('tracking')
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

// What a drop does: land at a placement; swap with a slotted tile (its title bar); join a tab
// (space id, null = a new tab).
type Drop = Placement | { type: 'swap'; with: TileId } | { type: 'tab'; space: string | null }

interface Target {
  drop: Drop
  preview: Rect | null // window coords
  also?: Rect // swap: the source's own rect (on the board), second preview
  slot?: number // shelf: visual slot of the ghost (among the items shown)
}

// Where would the source land if dropped at (x, y)?
function computeTarget(src: DragSource, x: number, y: number, shift: boolean, grab: { dx: number; dy: number }): Target | null {
  const b = boardRect()
  const sr = shelfRect()
  const srcId = src.type === 'tile' ? src.id : null

  if (inside(sr, x, y)) {
    // Slot under the pointer, by pitch from the strip's left edge (the strip holds the "+" hint or
    // the ghost as one more slot, so its width is stable while dragging). The dragged item is
    // hidden: the slot counts the items shown; the index is into S.shelf (place() detaches first).
    const list = document.getElementById('shelf')!
    const shown = S.shelf.filter((id) => id !== srcId)
    const slot = Math.max(0, Math.min(shown.length, Math.floor((x - sr.x + list.scrollLeft) / (SLOT + SLOT_GAP))))
    const srcIdx = srcId ? S.shelf.indexOf(srcId) : -1
    const index = srcIdx >= 0 && slot > srcIdx ? slot + 1 : slot
    return { drop: { type: 'shelf', index }, preview: null, slot }
  }

  // Tab area: join that tab, or a new one. A board tile over its own tab: nothing to do.
  const tab = tabDropAt(x, y)
  if (tab !== undefined) {
    if (tab && srcId && tab === spaceOf(srcId)?.id && location(srcId) !== 'shelved') return null
    return { drop: { type: 'tab', space: tab }, preview: null }
  }

  if (!inside(b, x, y)) return null

  if (shift) {
    const f = srcId ? S.floats.find((f) => f.id === srcId) : undefined
    const base = f ?? defaultFloatRect()
    const r = clampFloat({ x: x - b.x - grab.dx, y: y - b.y - grab.dy, w: base.w, h: base.h })
    return { drop: { type: 'float', rect: r }, preview: { x: b.x + r.x, y: b.y + r.y, w: r.w, h: r.h } }
  }

  if (!S.tree || (S.tree.type === 'leaf' && S.tree.id === srcId)) {
    return { drop: { type: 'slot', at: null, side: 'r' }, preview: b }
  }

  // Slotted tile under the cursor (floating tiles are not drop targets).
  const layout = compute(S.tree, b, { gap: GAP, bar: TITLE, collapsed: S.collapsed })
  for (const [id, r] of layout.tiles) {
    if (!inside(r, x, y)) continue
    if (id === srcId) return null
    // A tile onto a title bar (a collapsed tile is all title bar): swap places with it.
    if (srcId && (S.collapsed.has(id) || y < r.y + TITLE)) {
      const own = location(srcId) !== 'shelved' ? S.rects.get(srcId) : undefined
      return { drop: { type: 'swap', with: id }, preview: r, also: own }
    }
    const side: Side = dropSide(r, x, y)
    const probe = srcId ?? '__new__'
    const tree = srcId && contains(S.tree, srcId) ? move(S.tree, srcId, id, side) : insert(S.tree, id, side, probe)
    const collapsed = new Set(S.collapsed)
    collapsed.delete(probe)
    const after = compute(tree, b, { gap: GAP, bar: TITLE, collapsed })
    return { drop: { type: 'slot', at: id, side }, preview: after.tiles.get(probe) ?? null }
  }
  return null
}

async function applyDrop(src: DragSource, t: Target) {
  const d = t.drop
  debug('layout', 'drop', src, d)
  // Source or target tile may have closed (or moved) mid-drag.
  if (src.type === 'tile' && !S.tiles.has(src.id)) return
  if (d.type === 'tab') return dropOnTab(src, d.space)
  if (d.type === 'swap') {
    if (src.type !== 'tile' || !contains(S.tree, d.with)) return
    swap(src.id, d.with)
    return activate(src.id) // like any drop: the dragged tile is active
  }
  if (d.type === 'slot' && d.at && !contains(S.tree, d.at)) return
  if (src.type === 'tile') return place(src.id, d)
  // Template dropped next to a tile: start where that tile's shell is (like cmd+D).
  const at = d.type === 'slot' ? d.at : null
  const cwd = at ? await cwdOf(at) : undefined
  if (at && !contains(S.tree, at)) return
  const opts = await templateOpts(src.template, cwd)
  if (!opts || (at && !contains(S.tree, at))) return
  openTile(opts.kind, d, opts.opts)
}

// What a template opens: its kind, or for `file` the picked file's (main's dialog, any file; cancel
// = null, no tile). Its kind as for tie add (main: extension, else content); not openable (too
// large...): a modal says why, null.
async function templateOpts(template: Template['id'], cwd: string | undefined): Promise<{ kind: Kind; opts: OpenOpts } | null> {
  if (template !== 'file') return { kind: template, opts: { cwd } }
  const path = await tie.doc.pick(cwd ?? S.cwd)
  if (!path) return null
  const v = await tie.doc.viewer(path)
  if ('error' in v) return void infoDialog("Can't open", v.error), null
  return { kind: v.kind as Kind, opts: { path: v.path } }
}

// Onto a tab: the tile joins it (or a new tab: `space` null), the tab is shown, the tile active.
// A template: a new tile of its kind there (default cwd), beside its active tile.
async function dropOnTab(src: DragSource, space: string | null) {
  const exists = () => space === null || S.spaces.some((x) => x.id === space)
  if (src.type === 'tile') return moveToTab(src.id, space ?? newTab({ empty: true }))
  const opts = await templateOpts(src.template, undefined)
  if (!opts || !exists()) return
  if (space) switchTab(space)
  else newTab({ empty: true })
  openTile(opts.kind, besidePlacement(null), opts.opts)
}

// Where a template dropped at (x, y) would land (OS file drops use the same rules; not the tabs).
export function placementAt(x: number, y: number): Placement | null {
  const d = computeTarget({ type: 'template', template: 'terminal', label: '' }, x, y, false, { dx: 120, dy: 14 })?.drop
  return d && d.type !== 'tab' && d.type !== 'swap' ? d : null
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
  let edge: ReturnType<typeof edgeScroll> | null = null // tab list auto-scroll, while started
  const preview = document.getElementById('preview')!
  const preview2 = document.getElementById('preview2')!
  const ghost = document.getElementById('ghost')!
  const icon = () => (src.type === 'tile' ? displayIcon(S.tiles.get(src.id)!) : { glyph: TEMPLATES.find((t) => t.id === src.template)!.icon })

  const update = () => {
    target = computeTarget(src, lx, ly, shift, grab)
    const show = (el: HTMLElement, p: Rect | null | undefined) => {
      el.style.display = p ? 'block' : 'none'
      if (p) Object.assign(el.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px` })
    }
    show(preview, target?.preview)
    show(preview2, target?.also)
    preview.classList.toggle('float', target?.drop.type === 'float')
    markTabDrop(target?.drop.type === 'tab' ? target.drop.space : undefined)
    // Over the strip the ghost slot shows the landing; the pointer label would only cover it.
    const onShelf = target?.slot !== undefined
    if (onShelf) setShelfGhost(target!.slot!, iconHtml(icon()))
    else clearShelfGhost()
    ghost.style.display = onShelf ? 'none' : 'flex'
    // Beside the pointer, kept inside the window (dragging along the bottom toolbar).
    ghost.style.left = `${Math.min(lx + 12, window.innerWidth - ghost.offsetWidth - 4)}px`
    ghost.style.top = `${Math.min(ly + 12, window.innerHeight - ghost.offsetHeight - 4)}px`
    edge?.at(lx, ly)
  }

  const begin = () => {
    started = dragging = true
    document.body.classList.add('dragging', 'tile-drag') // tile-drag: the shelf shows its "+" hint slot
    if (S.revealed) (S.revealed = null), render()
    if (src.type === 'tile' && location(src.id) === 'shelved') hideShelfItem(src.id)
    const label = src.type === 'tile' ? displayTitle(S.tiles.get(src.id)!) : src.label
    ghost.innerHTML = `${iconHtml(icon())}<span>${label.replace(/</g, '&lt;')}</span>`
    ghost.style.display = 'flex'
    // Near the tab list's ends it scrolls; each step moves tabs under the pointer: target again.
    edge = edgeScroll({ past: false, step: update })
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
    edge?.stop()
    edge = null
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('keyup', onKey, true)
    preview.style.display = preview2.style.display = ghost.style.display = 'none'
    markTabDrop(undefined)
    clearShelfGhost()
    hideShelfItem(null)
    document.body.classList.remove('dragging', 'tile-drag')
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
    const sp = S.sp
    const start = sp.tree!
    let last = start
    const s0 = br.dir === 'row' ? e.clientX : e.clientY
    document.body.classList.add('dragging', br.dir === 'row' ? 'resizing-row' : 'resizing-col')
    const done = () => document.body.classList.remove('dragging', 'resizing-row', 'resizing-col')
    const stop = track(e, {
      move: (ev) => {
        // Tree changed under the drag (open/close/move, tab switch): stop, never write a stale tree.
        if (sp.tree !== last || S.visible !== sp.id) return stop(), done()
        const d = (br.dir === 'row' ? ev.clientX : ev.clientY) - s0
        sp.tree = last = resize(start, br.path, br.index, d, br.length, MIN)
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
