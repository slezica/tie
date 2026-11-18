// Mouse interactions: tile/template/shelf-item drag & drop, border resize, floating resize.
import { compute, dropZone, nearestEdge, equalize, insert, insertGroup, move, resize, contains, type Border, type Rect, type Side, type TileId } from '@core/layout'
import { S, GAP, TITLE, MIN, SLOT, SLOT_GAP, tie, boardRect, shelfRect, layoutOpts, location, spaceOf, debug, withSpace, type Kind } from './state'
import { place, placeGroup, floatGroup, shelveGroup, selection, swap, activate, clearSelection, openTile, displaceTile, setFloatRect, defaultFloatRect, clampFloat, cwdOf, contextOf, besidePlacement, type Placement } from './ops'
import type { OpenOpts } from './kinds'
import { tabDropAt, markTabDrop, newTab, moveToTab, moveGroupToTab, switchTab, edgeScroll } from './tabs'
import { render } from './render'
import { setShelfGhost, clearShelfGhost, hideShelfItems } from './shelf'
import { displayIcon, displayTitle } from './tile'
import { iconHtml } from './icons'
import { TEMPLATES, type Template } from './kinds'
import { infoDialog } from './dialog'
import { pickPath } from './picker'

// A group: the shelf selection, in shelf order (SHELF.md "Selection"); a drag starting on a selected
// item becomes one (startDrag).
export type DragSource = { type: 'tile'; id: TileId } | { type: 'template'; template: Template['id']; label: string } | { type: 'group'; ids: TileId[] }

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

// What a drop does: land at a placement; swap with a slotted tile (a tile dropped on its center);
// displace one (a new tile on its center: it takes the leaf, the old one is shelved); join a tab
// (space id, null = a new tab); a group's floats (board-relative rects, one per tile).
type Drop = Placement | { type: 'swap'; with: TileId } | Displace | { type: 'tab'; space: string | null } | { type: 'floats'; rects: Rect[] }
export type Displace = { type: 'displace'; with: TileId }

interface Target {
  drop: Drop
  // Window coords, exactly where the drop lands: one per tile (a group: in its order); a swap: the
  // target's rect, then the source's own (on the board).
  previews: Rect[]
  slot?: number // shelf: visual slot of the ghost (among the items shown)
}

// Floats of a group cascade from the pointer: the first where a single tile would float, each next
// one TITLE px up and left of the previous (behind it: their title bars show above the first's).
const cascade = (i: number) => i * TITLE

// Where would the source land if dropped at (x, y)?
function computeTarget(src: DragSource, x: number, y: number, shift: boolean, grab: { dx: number; dy: number }): Target | null {
  const b = boardRect()
  const sr = shelfRect()
  const srcId = src.type === 'tile' ? src.id : null
  const group = src.type === 'group' ? src.ids : null
  const moving = group ?? (srcId ? [srcId] : []) // hidden from the strip while dragged

  // The shelf takes the strip, plus the empty toolbar between + and the strip right of the
  // toolbar's midpoint (left of it: a new tab, below), over the toolbar's height. Rect math only: a
  // tab area past the midpoint keeps the whole gap, a strip past it takes it.
  const tb = document.getElementById('toolbar')!.getBoundingClientRect()
  const add = document.getElementById('tab-add')!.getBoundingClientRect()
  const left = Math.min(sr.x, Math.max(tb.left + tb.width / 2, add.right))
  const hit = { x: left, y: tb.top, w: sr.x + sr.w - left, h: tb.height }
  if (inside(hit, x, y)) {
    // Slot under the pointer, by pitch from the strip's left edge (the strip holds the "+" hint or
    // the ghost as one more slot, so its width is stable while dragging); left of the strip: slot 0.
    // The dragged item is hidden: the slot counts the items shown; the index is into S.shelf
    // (place() detaches first). A group: its items hidden, its ghosts from the slot on (one per
    // tile); the index is among the other items (shelveGroup).
    const list = document.getElementById('shelf')!
    const shown = S.shelf.filter((id) => !moving.includes(id))
    const slot = x < sr.x ? 0 : Math.max(0, Math.min(shown.length, Math.floor((x - sr.x + list.scrollLeft) / (SLOT + SLOT_GAP))))
    if (group) return { drop: { type: 'shelf', index: slot }, previews: [], slot }
    const srcIdx = srcId ? S.shelf.indexOf(srcId) : -1
    const index = srcIdx >= 0 && slot > srcIdx ? slot + 1 : slot
    return { drop: { type: 'shelf', index }, previews: [], slot }
  }

  // Tab area: join that tab, or a new one. A board tile over its own tab: nothing to do.
  const tab = tabDropAt(x, y)
  if (tab !== undefined) {
    if (tab && srcId && tab === spaceOf(srcId)?.id && location(srcId) !== 'shelved') return null
    return { drop: { type: 'tab', space: tab }, previews: [] }
  }

  if (!inside(b, x, y)) return null
  if (group) return groupTarget(group, x, y, shift, grab)

  if (shift) {
    const f = srcId ? S.floats.find((f) => f.id === srcId) : undefined
    const base = f ?? defaultFloatRect()
    const r = clampFloat({ x: x - b.x - grab.dx, y: y - b.y - grab.dy, w: base.w, h: base.h })
    return { drop: { type: 'float', rect: r }, previews: [{ x: b.x + r.x, y: b.y + r.y, w: r.w, h: r.h }] }
  }

  if (!S.tree || (S.tree.type === 'leaf' && S.tree.id === srcId)) {
    return { drop: { type: 'slot', at: null, side: 'r' }, previews: [b] }
  }

  // Slotted tile under the cursor (floating tiles are not drop targets).
  for (const [id, r] of compute(S.tree, b, layoutOpts()).tiles) {
    if (!inside(r, x, y)) continue
    if (id === srcId) return null
    // Center zone (a collapsed tile: all of it, it is all title bar): a tile swaps places with it;
    // a new one (template, OS file) takes its leaf, it goes to the shelf. Else: the nearest edge.
    const zone = srcId && r.collapsed !== 'none' ? 'center' : dropZone(r, x, y)
    if (zone === 'center' && srcId) {
      const own = location(srcId) !== 'shelved' ? S.rects.get(srcId) : undefined
      return { drop: { type: 'swap', with: id }, previews: own ? [r, own] : [r] }
    }
    if (zone === 'center') return { drop: { type: 'displace', with: id }, previews: [r] }
    const side: Side = zone
    const probe = srcId ?? '__new__'
    const tree = srcId && contains(S.tree, srcId) ? move(S.tree, srcId, id, side) : insert(S.tree, id, side, probe)
    const collapsed = new Set(S.collapsed)
    collapsed.delete(probe)
    const after = compute(tree, b, { gap: GAP, bar: TITLE, collapsed })
    const p = after.tiles.get(probe)
    return { drop: { type: 'slot', at: id, side }, previews: p ? [p] : [] }
  }
  return null
}

// A group over the board (SHELF.md "Group drag"): floats cascade (shift); else the empty board, or
// the nearest edge of the slotted tile under the pointer (no center zone: no swap, no displace).
// Previews: the rects the drop makes, from the same insertion (placeGroup: insertGroup).
function groupTarget(ids: TileId[], x: number, y: number, shift: boolean, grab: { dx: number; dy: number }): Target | null {
  const b = boardRect()
  if (shift) {
    const base = defaultFloatRect()
    const rects = ids.map((_, i) => clampFloat({ x: x - b.x - grab.dx - cascade(i), y: y - b.y - grab.dy - cascade(i), w: base.w, h: base.h }))
    return { drop: { type: 'floats', rects }, previews: rects.map((r) => ({ x: b.x + r.x, y: b.y + r.y, w: r.w, h: r.h })) }
  }
  const landing = (at: TileId | null, side: Side): Target => {
    const tree = insertGroup(S.tree, at, side, ids, b, layoutOpts())
    const after = compute(tree, b, { ...layoutOpts(), zoomed: null })
    return { drop: { type: 'slot', at, side }, previews: ids.map((id) => after.tiles.get(id)!).filter(Boolean) }
  }
  if (!S.tree) return landing(null, 'r')
  for (const [id, r] of compute(S.tree, b, layoutOpts()).tiles) if (inside(r, x, y)) return landing(id, nearestEdge(r, x, y))
  return null
}

async function applyDrop(src: DragSource, t: Target) {
  const d = t.drop
  debug('layout', 'drop', src, d)
  // Source or target tile may have closed (or moved) mid-drag.
  if (src.type === 'tile' && !S.tiles.has(src.id)) return
  if (src.type === 'group') return dropGroup(src.ids.filter((id) => S.tiles.has(id)), d)
  if (d.type === 'tab') return dropOnTab(src, d.space)
  if (d.type === 'swap') {
    if (src.type !== 'tile' || !contains(S.tree, d.with)) return
    swap(src.id, d.with)
    return activate(src.id) // like any drop: the dragged tile is active
  }
  if (d.type === 'floats') return
  if (d.type === 'slot' && d.at && !contains(S.tree, d.at)) return
  if (src.type === 'tile') return d.type === 'displace' ? undefined : place(src.id, d) // a tile's center drop is a swap
  // Template: the new tile starts in its context tile's cwd (contextOf: the tile next to / under the
  // drop, else the active one: shelf, empty board area, float); fresh (a terminal: its shell now).
  const at = d.type === 'slot' ? d.at : d.type === 'displace' ? d.with : null
  const cwd = await cwdOf(contextOf(d))
  if (at && !contains(S.tree, at)) return
  const opts = await templateOpts(src.template, cwd)
  if (!opts || (at && !contains(S.tree, at))) return
  if (d.type === 'displace') displaceTile(d.with, opts.kind, opts.opts)
  else openTile(opts.kind, d, opts.opts)
}

// A group lands (SHELF.md "Group drag"); after: selection cleared, the first tile active (a strip
// reorder: keys back to the recent board tile).
function dropGroup(ids: TileId[], d: Drop) {
  if (!ids.length) return
  if (d.type === 'tab') return moveGroupToTab(ids, d.space)
  if (d.type === 'shelf') return shelveGroup(ids, d.index ?? S.shelf.length)
  if (d.type === 'floats') return floatGroup(ids, d.rects)
  if (d.type === 'slot') return placeGroup(ids, d) // refuses a target gone mid-drag
}

// What a template opens, with the new tile's `cwd`: its kind, or for `file` the picked file's
// (Tie's picker from `cwd`, else the app cwd; any file; cancel = null, no tile). Its kind as for
// tie add (main: extension, else content); not openable (too large...): a modal says why, null.
export async function templateOpts(template: Template['id'], cwd: string | undefined): Promise<{ kind: Kind; opts: OpenOpts } | null> {
  if (template !== 'file') return { kind: template, opts: { cwd } }
  const path = await pickPath(cwd || S.cwd)
  if (!path) return null
  const v = await tie.doc.viewer(path)
  if ('error' in v) return void infoDialog("Can't open", v.error), null
  return { kind: v.kind as Kind, opts: { path: v.path, cwd } }
}

// Onto a tab: the tile joins it (or a new tab: `space` null), the tab is shown, the tile active.
// A template: a new tile of its kind there, beside its active tile, starting in that tile's cwd
// (fresh; contextOf: the tab's active tile); a new tab: the app cwd.
async function dropOnTab(src: Exclude<DragSource, { type: 'group' }>, space: string | null) {
  const exists = () => space === null || S.spaces.some((x) => x.id === space)
  if (src.type === 'tile') return moveToTab(src.id, space ?? newTab({ empty: true }))
  const cwd = space ? await cwdOf(withSpace(space, () => contextOf())) : undefined
  if (!exists()) return
  const opts = await templateOpts(src.template, cwd)
  if (!opts || !exists()) return
  if (space) switchTab(space)
  else newTab({ empty: true })
  openTile(opts.kind, besidePlacement(null), opts.opts)
}

// Where a template dropped at (x, y) would land (OS file drops use the same rules; not the tabs):
// a placement, or displacing the tile under it (its center).
export function placementAt(x: number, y: number): Placement | Displace | null {
  const d = computeTarget({ type: 'template', template: 'terminal', label: '' }, x, y, false, { dx: 120, dy: 14 })?.drop
  return d && d.type !== 'tab' && d.type !== 'swap' && d.type !== 'floats' ? d : null
}

// Drop previews: a pool, one element per rect shown. The first two are #preview and #preview2
// (index.html; a swap's second rect); more are made on demand (a group: one per tile).
function previewPool(n: number): HTMLElement[] {
  const pool = [document.getElementById('preview')!, document.getElementById('preview2')!, ...document.querySelectorAll<HTMLElement>('.drop-preview')]
  while (pool.length < n) {
    const el = document.createElement('div')
    el.className = 'drop-preview'
    pool.at(-1)!.after(el)
    pool.push(el)
  }
  return pool
}

function showPreviews(rects: Rect[], float: boolean) {
  previewPool(rects.length).forEach((el, i) => {
    const p = rects[i]
    el.style.display = p ? 'block' : 'none'
    el.classList.toggle('float', float)
    if (p) Object.assign(el.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px` })
  })
}

// Pointer-down on a draggable: becomes a drag past THRESHOLD, otherwise a click. A shelf item in
// the selection drags the whole selection (a group, SHELF.md "Group drag"); anything else
// de-selects. Escape cancels: nothing moves, the selection stays.
export function startDrag(e: PointerEvent, from: DragSource, onClick?: () => void) {
  let src = from
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
  const ghost = document.getElementById('ghost')!
  const iconOf = (id: TileId) => iconHtml(displayIcon(S.tiles.get(id)!))
  const icons = () =>
    src.type === 'group' ? src.ids.filter((id) => S.tiles.has(id)).map(iconOf) : src.type === 'tile' ? [iconOf(src.id)] : [iconHtml({ glyph: TEMPLATES.find((t) => t.id === (src as any).template)!.icon })]

  const update = () => {
    target = computeTarget(src, lx, ly, shift, grab)
    showPreviews(target?.previews ?? [], target?.drop.type === 'float' || target?.drop.type === 'floats')
    markTabDrop(target?.drop.type === 'tab' ? target.drop.space : undefined)
    // Over the strip the ghost slots show the landing; the pointer label would only cover them.
    const onShelf = target?.slot !== undefined
    if (onShelf) setShelfGhost(target!.slot!, icons())
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
    if (src.type === 'tile' && location(src.id) === 'shelved' && S.selected.has(src.id)) src = { type: 'group', ids: selection() }
    else clearSelection()
    const hidden = src.type === 'group' ? src.ids : src.type === 'tile' && location(src.id) === 'shelved' ? [src.id] : []
    hideShelfItems(hidden)
    // The "+" hint stands for the hidden items: as wide (the strip keeps its width).
    document.getElementById('shelf')!.style.setProperty('--drag-slots', String(Math.max(1, hidden.length)))
    const n = src.type === 'group' ? src.ids.length : 0
    const label = src.type === 'group' ? `${n} tile${n === 1 ? '' : 's'}` : src.type === 'tile' ? displayTitle(S.tiles.get(src.id)!) : src.label
    ghost.innerHTML = `${icons()[0] ?? ''}${n > 1 ? `<span class="count">${n}</span>` : ''}<span>${label.replace(/</g, '&lt;')}</span>`
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
    showPreviews([], false)
    ghost.style.display = 'none'
    markTabDrop(undefined)
    clearShelfGhost()
    hideShelfItems([])
    document.getElementById('shelf')!.style.removeProperty('--drag-slots')
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

// Border between slotted siblings: drag resizes both neighbors; double-click equalizes the split's children.
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
  h.addEventListener('dblclick', () => {
    const br = borderData.get(h)
    if (!S.tree || !br) return
    S.sp.tree = equalize(S.tree, br.path)
    render()
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
