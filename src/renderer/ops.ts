// Space operations. Every mutation of S goes through here, then render().
import { insert, remove, parentDir, contains, type Rect, type Side, type TileId } from '@core/layout'
import { S, location, boardRect, getTile, debug, spaceOf, withSpace, type Kind } from './state'
import { createTile, mountTile, disposeTile, refreshTitle } from './tile'
import type { OpenOpts } from './kinds'
import { render } from './render'
import { closeTileMenu } from './menu'
import { dropSpace } from './tabs'

export type Placement =
  | { type: 'slot'; at: TileId | null; side: Side }
  | { type: 'float'; rect?: Partial<Rect> } // board-relative
  | { type: 'shelf'; index?: number }

const MIN_FLOAT = { w: 200, h: 120 }

export function clampFloat(r: Rect): Rect {
  const b = boardRect()
  const w = Math.max(MIN_FLOAT.w, Math.min(r.w, b.w))
  const h = Math.max(MIN_FLOAT.h, Math.min(r.h, b.h))
  return { x: Math.max(0, Math.min(r.x, b.w - w)), y: Math.max(0, Math.min(r.y, b.h - h)), w, h }
}

export function defaultFloatRect(): Rect {
  const b = boardRect()
  const w = Math.round(b.w * 0.45)
  const h = Math.round(b.h * 0.45)
  return { x: Math.round((b.w - w) / 2), y: Math.round((b.h - h) / 2), w, h }
}

// Remove a tile from whichever space holds it.
function detach(id: TileId) {
  for (const sp of S.spaces) {
    sp.tree = remove(sp.tree, id)
    sp.floats = sp.floats.filter((f) => f.id !== id)
    sp.shelf = sp.shelf.filter((s) => s !== id)
    sp.collapsed.delete(id)
    if (sp.zoomed === id) sp.zoomed = null
    if (sp.pinned === id) sp.pinned = null
    if (sp.revealed === id) sp.revealed = null
    // A slotted tile left without siblings can't stay collapsed.
    for (const c of sp.collapsed) if (!sp.floats.some((f) => f.id === c) && parentDir(sp.tree, c) === null) sp.collapsed.delete(c)
  }
}

// Run an op in the space that holds the tile (no-op wrapper if already current).
function inTileSpace<T>(id: TileId, fn: () => T): T {
  const sp = spaceOf(id)
  return sp && sp.id !== S.current ? withSpace(sp.id, fn) : fn()
}

// `activate: false` (CLI without --focus): the user's input stays where it is, unless nothing
// has it (empty board).
export function place(id: TileId, p: Placement, o: { activate?: boolean } = {}) {
  const t = getTile(id)
  const from = location(id)
  const oldFloat = S.floats.find((f) => f.id === id)
  const oldShelfIdx = S.shelf.indexOf(id)
  if (p.type === 'slot' && p.at === id) return
  if (p.type === 'slot' && p.at && !contains(S.tree, p.at)) throw new Error(`not on board: ${p.at}`)
  debug('layout', 'place', id, from, p)
  detach(id)

  if (p.type === 'slot') {
    S.tree = insert(S.tree, p.at, p.side, id)
  } else if (p.type === 'float') {
    const base = oldFloat ?? defaultFloatRect()
    S.floats.push({ id, ...clampFloat({ ...base, ...p.rect } as Rect) })
  } else {
    let idx = p.index ?? S.shelf.length
    if (oldShelfIdx >= 0 && oldShelfIdx < idx) idx--
    S.shelf.splice(Math.max(0, Math.min(idx, S.shelf.length)), 0, id)
    t.activity = false
  }

  if (p.type === 'shelf') {
    if (S.active === id) focusNext()
    else render()
  } else if (o.activate === false && S.active !== null) {
    render()
  } else {
    activate(id)
  }
}

export function openTile(kind: Kind, p: Placement, opts: OpenOpts = {}, o: { activate?: boolean } = {}): TileId {
  const t = createTile(kind, opts)
  place(t.id, p, o)
  render()
  mountTile(t).then(() => S.active === t.id && t.surface.focus())
  return t.id
}

// A new tile split from `id` (or, if it isn't slotted, from the active / most recent slotted tile),
// along the longer side: like `tie open` from that tile.
export function besidePlacement(id: TileId | null): Placement {
  const at = [id, S.active, ...S.mru].find((x): x is TileId => !!x && contains(S.tree, x)) ?? null
  const r = at ? S.rects.get(at) : null
  return { type: 'slot', at, side: r && r.h > r.w ? 'b' : 'r' }
}

// A tile's directory right now (terminal: its shell's, fresh read), for new terminals divided from it.
export async function cwdOf(id: TileId | null | undefined): Promise<string | undefined> {
  const t = id ? S.tiles.get(id) : undefined
  return t?.surface.cwd?.()
}

export function closeTile(id: TileId) {
  inTileSpace(id, () => {
    const t = getTile(id)
    debug('layout', 'close', id)
    detach(id)
    disposeTile(t)
    closeTileMenu(id)
    S.mru = S.mru.filter((m) => m !== id)
    // Last tile of its space (board, floats, shelf): the tab closes (TABS.md).
    if (!S.tree && S.floats.length === 0 && S.shelf.length === 0) return dropSpace(S.current)
    if (S.active === id) focusNext()
    else render()
  })
}

export function activate(id: TileId): void {
  const sp = spaceOf(id)
  if (sp && sp.id !== S.current) return withSpace(sp.id, () => activate(id))
  getTile(id)
  // A zoomed tile covers the board: unzoom rather than activate a tile hidden under it.
  if (S.zoomed && S.zoomed !== id && location(id) !== 'shelved') S.zoomed = null
  S.active = id
  getTile(id).pinged = false
  S.mru = [id, ...S.mru.filter((m) => m !== id)]
  const f = S.floats.find((f) => f.id === id)
  if (f && S.floats[S.floats.length - 1] !== f) S.floats = [...S.floats.filter((x) => x !== f), f]
  render()
  // Only steal keyboard focus for the space on screen.
  if (S.current === S.visible) refocus()
}

// Ask for attention without taking focus or changing layout. Ignored for the tile already in
// front of the user (active in the visible tab).
export function setPing(id: TileId, on: boolean) {
  const t = getTile(id)
  const sp = spaceOf(id)
  if (on && sp?.id === S.visible && sp.active === id) return
  t.pinged = on
  render()
}

// Keys go to the active tile, or nowhere if it can't take them (collapsed, not started).
export function refocus() {
  const t = S.active ? S.tiles.get(S.active) : undefined
  if (t && !S.collapsed.has(t.id) && t.surface.focus()) return
  ;(document.activeElement as HTMLElement | null)?.blur()
}

// After close/shelve: most recently used tile still on the board.
export function focusNext() {
  const next = S.mru.find((m) => {
    const l = location(m)
    return l === 'slotted' || l === 'floating'
  })
  if (next) activate(next)
  else {
    S.active = null
    render()
  }
}

export function canCollapse(id: TileId): boolean {
  const l = location(id)
  return l === 'floating' || (l === 'slotted' && parentDir(S.tree, id) !== null)
}

export function toggleCollapse(id: TileId) {
  if (S.collapsed.has(id)) S.collapsed.delete(id)
  else if (canCollapse(id)) S.collapsed.add(id)
  if (S.zoomed === id) S.zoomed = null
  render()
  if (S.active === id && S.current === S.visible) refocus()
}

export function toggleZoom(id: TileId) {
  const l = location(id)
  if (l !== 'slotted' && l !== 'floating') return
  S.zoomed = S.zoomed === id ? null : id
  S.collapsed.delete(id)
  activate(id)
}

export function pin(id: TileId | null) {
  S.pinned = id
  if (id) {
    getTile(id).activity = false
    activate(id)
  } else if (S.active && location(S.active) === 'shelved') focusNext()
  else render()
}

export function setFloatRect(id: TileId, r: Rect) {
  const f = S.floats.find((f) => f.id === id)
  if (!f) return
  Object.assign(f, clampFloat(r))
  render()
}

export function setMeta(id: TileId, meta: { title?: string | null; icon?: string | null }) {
  const t = getTile(id)
  if (meta.title !== undefined) t.customTitle = meta.title || undefined
  if (meta.icon !== undefined) t.customIcon = meta.icon || undefined
  refreshTitle(t)
  render()
}
