// Space operations. Every mutation of S goes through here, then render().
import { insert, insertGroup, remove, swapLeaves, replaceLeaf, parentDir, contains, type Rect, type Side, type TileId } from '@core/layout'
import { S, squashed, location, boardRect, layoutOpts, getTile, debug, spaceOf, withSpace, type Kind, type Space, type Tile } from './state'
import { createTile, mountTile, disposeTile, refreshTitle } from './tile'
import type { OpenOpts } from './kinds'
import { render } from './render'
import { closeTileMenu } from './menu'

export type Placement =
  | { type: 'slot'; at: TileId | null; side: Side }
  | { type: 'float'; rect?: Partial<Rect> } // board-relative
  | { type: 'shelf'; index?: number }

export type SlotPlacement = Extract<Placement, { type: 'slot' }>

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
    sp.selected.delete(id) // leaving the shelf (or closing) leaves the selection
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
// has it (empty board). A shelf selection counts as having it (it ends on activation).
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
  } else if (o.activate === false && (S.active !== null || S.selected.size)) {
    render()
  } else {
    activate(id)
  }
}

// Exchange two tiles' locations within one space: slot, float rect or shelf index (any pair). Each
// tile keeps its own state (collapse, zoom) where its new place allows it. The active tile stays
// active; moved to the shelf: focusNext (as `place`).
export function swap(a: TileId, b: TileId) {
  const sa = spaceOf(a)
  if (a === b || !sa || sa !== spaceOf(b)) return debug('layout', 'swap refused', a, b)
  inTileSpace(a, () => {
    debug('layout', 'swap', a, location(a), b, location(b))
    const other = (id: TileId) => (id === a ? b : id === b ? a : id)
    S.tree = swapLeaves(S.tree, a, b)
    S.floats = S.floats.map((f) => (f.id === a || f.id === b ? { ...f, id: other(f.id) } : f))
    S.shelf = S.shelf.map(other)
    for (const id of [a, b]) {
      if (location(id) === 'shelved') {
        S.collapsed.delete(id)
        if (S.zoomed === id) S.zoomed = null
        getTile(id).activity = false
      } else {
        if (S.collapsed.has(id) && !canCollapse(id)) S.collapsed.delete(id)
        if (S.pinned === id) S.pinned = null
        if (S.revealed === id) S.revealed = null
        S.selected.delete(id)
      }
    }
    if ((S.active === a || S.active === b) && location(S.active) === 'shelved') focusNext()
    else render()
  })
}

// `tie replace` (CLI.md): `id` (waiting on the shelf) takes `old`'s exact place: its leaf,
// float rect and z-order, or shelf index, with its state there (active, zoomed, collapsed, pinned,
// revealed); not its custom title / icon. Then `old` closes (scripted: no question). `old` gone (the
// user closed it) or not in `id`'s tab: nothing, `id` stays where it is. `focus`: `id` takes input
// even if `old` didn't have it (shelved: pinned, as `tie focus`).
export function replaceTile(old: TileId, id: TileId, o: { focus?: boolean } = {}) {
  const sp = spaceOf(old)
  if (!sp || old === id || !S.tiles.has(id) || spaceOf(id) !== sp) return debug('layout', 'replace refused', old, id, sp?.id, spaceOf(id)?.id)
  inTileSpace(old, () => {
    debug('layout', 'replace', old, location(old), '->', id)
    const active = S.active === old
    detach(id)
    S.tree = replaceLeaf(S.tree, old, id)
    S.floats = S.floats.map((f) => (f.id === old ? { ...f, id } : f))
    S.shelf = S.shelf.map((x) => (x === old ? id : x))
    if (S.collapsed.has(old)) S.collapsed.add(id)
    if (S.zoomed === old) S.zoomed = id
    if (S.pinned === old) S.pinned = id
    if (S.revealed === old) S.revealed = id
    S.mru = S.mru.filter((m) => m !== id).map((m) => (m === old ? id : m))
    if (active) S.active = id
    closeTile(old) // out of every place already: drops it, keeps the rest
    if (!active && !o.focus) return
    if (location(id) === 'shelved' && S.pinned !== id) pin(id)
    else activate(id)
  })
}

// The tile a new one opens from (DIRECTORIES.md): the tile it splits / displaces, else the active
// tile of the target space (S.current: withSpace). Null: none (a tile from nothing: the app cwd).
export function contextOf(p?: Placement | { type: 'displace'; with: TileId }): TileId | null {
  if (p?.type === 'displace') return S.tiles.has(p.with) ? p.with : null
  if (p?.type === 'slot' && p.at && S.tiles.has(p.at)) return p.at
  return S.active && S.tiles.has(S.active) ? S.active : null
}

// Stored cwd of the context tile, else the app cwd (synchronous; callers wanting a fresh read
// pass `opts.cwd` from `cwdOf`).
const contextCwd = (ctx: TileId | null) => (ctx && S.tiles.get(ctx)?.cwd) || S.cwd

// A tile done mounting takes the focus if still active, unless a modal (panel, dialog: e.g. the
// startup settings dialog) holds it meanwhile: its close refocuses.
const focusMounted = (t: Tile) => S.active === t.id && !document.querySelector('.settings, .dialog-backdrop') && t.surface.focus()

// `opts.cwd`: the new tile's cwd; absent: its context tile's (contextOf).
export function openTile(kind: Kind, p: Placement, opts: OpenOpts = {}, o: { activate?: boolean } = {}): TileId {
  const t = createTile(kind, { ...opts, cwd: opts.cwd || contextCwd(contextOf(p)) })
  place(t.id, p, o)
  render()
  mountTile(t).then(() => focusMounted(t))
  return t.id
}

// A new tile takes slotted `old`'s exact leaf; `old` moves to the end of the shelf (just shelved:
// not revealed). The new tile is active, like other tiles the user opens (INPUT.md "Drop targets":
// a template or file dropped on a tile's center). `old` no longer slotted: nothing, null.
export function displaceTile(old: TileId, kind: Kind, opts: OpenOpts = {}): TileId | null {
  if (!contains(S.tree, old)) return debug('layout', 'displace refused', old), null
  const t = createTile(kind, { ...opts, cwd: opts.cwd || contextCwd(old) })
  place(t.id, { type: 'shelf' })
  swap(t.id, old) // exchanges shelf ↔ slot: old takes the new tile's (last) shelf index
  activate(t.id)
  mountTile(t).then(() => focusMounted(t))
  return t.id
}

// A new tile split from `id` (or, if it isn't slotted, from the active / most recent slotted tile),
// along the longer side: like `tie add` from that tile.
export function besidePlacement(id: TileId | null): SlotPlacement {
  const at = [id, S.active, ...S.mru].find((x): x is TileId => !!x && contains(S.tree, x)) ?? null
  const r = at ? S.rects.get(at) : null
  return { type: 'slot', at, side: r && r.h > r.w ? 'b' : 'r' }
}

// A tile's cwd right now, for tiles opened from it: terminal: its shell's (fresh read, not the
// poll); others: the stored one. No tile: undefined (openTile falls back).
export async function cwdOf(id: TileId | null | undefined): Promise<string | undefined> {
  const t = id ? S.tiles.get(id) : undefined
  if (!t) return undefined
  return (await t.surface.cwdNow?.()) || t.cwd
}

// The tile's cwd changed (terminal: the shell's `cd`): title, tab title (tile-meta).
export function setCwd(id: TileId, dir: string) {
  const t = getTile(id)
  if (!dir || t.cwd === dir) return
  t.cwd = dir
  refreshTitle(t)
}

// A space emptied by closing its last tile closes too, unless it is the only one (tabs.ts owns
// spaces: it registers the handler, TABS.md).
let onEmptySpace: ((spaceId: string) => void) | null = null
export const setEmptySpaceHandler = (fn: (spaceId: string) => void) => (onEmptySpace = fn)

// The space has no tiles left: it closes, unless it is the only one.
function dropIfEmpty(sp: Space) {
  if (!sp.tree && sp.floats.length === 0 && sp.shelf.length === 0 && S.spaces.length > 1 && S.spaces.includes(sp)) onEmptySpace?.(sp.id)
}

export function closeTile(id: TileId) {
  inTileSpace(id, () => {
    const t = getTile(id)
    debug('layout', 'close', id)
    detach(id)
    disposeTile(t)
    closeTileMenu(id)
    S.mru = S.mru.filter((m) => m !== id)
    if (S.active === id) focusNext()
    else render()
    dropIfEmpty(S.sp)
  })
}

// Move a tile into another space (a drop onto its tab): there beside the active / recent slotted
// tile (`besidePlacement`), active in that space (keys follow only if it is the visible one: the
// caller switches first, tabs.ts `moveToTab`). The space it left: focusNext if it was active there;
// emptied, it closes (as closeTile). Same space: a shelved tile comes back to the board the same
// way; a board tile stays put. `activate: false` (CLI without --focus): as `place`.
export function moveToSpace(id: TileId, spaceId: string, o: { activate?: boolean } = {}) {
  const from = spaceOf(id)
  const to = S.spaces.find((x) => x.id === spaceId)
  if (!from || !to) return debug('layout', 'move to space refused', id, spaceId)
  if (from === to) {
    if (location(id) === 'shelved') withSpace(to.id, () => place(id, besidePlacement(null), o))
    return
  }
  debug('layout', 'move to space', id, from.id, '->', to.id)
  detach(id)
  getTile(id).activity = false
  withSpace(from.id, () => {
    S.mru = S.mru.filter((m) => m !== id)
    if (S.active === id) focusNext()
  })
  withSpace(to.id, () => place(id, besidePlacement(null), o))
  dropIfEmpty(from)
}

// `focus: false`: the user clicked into a field of the tile's own chrome (nav bar location); the
// mousedown focuses it, `refocus` would hand the keys to the content instead.
export function activate(id: TileId, o: { focus?: boolean } = {}): void {
  const sp = spaceOf(id)
  if (sp && sp.id !== S.current) return withSpace(sp.id, () => activate(id, o))
  getTile(id)
  S.selected.clear() // a selection means nothing active (SHELF.md "Selection")
  // Zoom ends when a tile it squashed (slotted zoom) or covers (floating zoom: the board) becomes
  // active. Floats stay above a slotted zoom: activating one keeps it.
  if (S.zoomed && S.zoomed !== id && (squashed(id) || (location(S.zoomed) === 'floating' && location(id) !== 'shelved'))) S.zoomed = null
  S.active = id
  getTile(id).pinged = false
  S.mru = [id, ...S.mru.filter((m) => m !== id)]
  const f = S.floats.find((f) => f.id === id)
  if (f && S.floats[S.floats.length - 1] !== f) S.floats = [...S.floats.filter((x) => x !== f), f]
  render()
  // Only steal keyboard focus for the space on screen.
  if (S.current === S.visible && o.focus !== false) refocus()
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

// Shelf selection (SHELF.md "Selection"), current space. Selecting: nothing active (keys go
// nowhere), a hover reveal goes; the pin stays (unfocused). The clicked tile is never shown.
export function toggleSelected(id: TileId) {
  if (location(id) !== 'shelved' || spaceOf(id)?.id !== S.current) return
  if (S.selected.has(id)) S.selected.delete(id)
  else S.selected.add(id)
  debug('shelf', 'selection', [...S.selected])
  if (!S.selected.size) return focusNext() // toggled out the last one: back to work, as Escape
  S.revealed = null
  S.active = null
  render()
  if (S.current === S.visible) refocus() // nothing active: blur
}

// `restore`: nothing active afterwards → the most recent board tile (Escape, shortcuts); a click
// leaves it to what was clicked.
export function clearSelection(o: { restore?: boolean } = {}) {
  if (!S.selected.size) return
  debug('shelf', 'selection cleared')
  S.selected.clear()
  if (o.restore && !S.active) focusNext()
  else render()
}

// The selection in shelf order (every group action's order).
export const selection = (): TileId[] => S.shelf.filter((id) => S.selected.has(id))

// Tiles onto the board as a group (`insertGroup`, LAYOUT.md "Group insertion"): the area one tile
// would take at `p`, split evenly along its longer side, in order. The first ends active. Every
// group landing goes through here (cmd+S, Move to tab, drag), so a group lands the same way.
export function placeGroup(ids: TileId[], p: SlotPlacement) {
  ids = ids.filter((id) => S.tiles.has(id) && id !== p.at)
  if (!ids.length) return render()
  if (p.at && !contains(S.tree, p.at)) return debug('layout', 'place group refused', p.at)
  debug('layout', 'place group', ids, p)
  for (const id of ids) detach(id)
  S.tree = insertGroup(S.tree, p.at, p.side, ids, boardRect(), layoutOpts())
  activate(ids[0])
}

// Tiles float as a group at `rects` (board-relative, one each, in order); the first ends on top,
// active.
export function floatGroup(ids: TileId[], rects: Rect[]) {
  ids = ids.filter((id) => S.tiles.has(id))
  if (!ids.length) return render()
  debug('layout', 'float group', ids)
  for (const id of ids) detach(id)
  for (let i = ids.length - 1; i >= 0; i--) S.floats.push({ id: ids[i], ...clampFloat(rects[i] ?? defaultFloatRect()) })
  activate(ids[0])
}

// Shelved tiles reordered as a block: at `index` among the other shelved tiles, in order. Keys back
// to the recent board tile (a shelved tile is not shown by a reorder).
export function shelveGroup(ids: TileId[], index: number) {
  ids = ids.filter((id) => location(id) === 'shelved' && spaceOf(id)?.id === S.current)
  S.selected.clear()
  if (!ids.length) return render()
  debug('layout', 'shelve group', ids, index)
  const rest = S.shelf.filter((id) => !ids.includes(id))
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, ...ids)
  S.shelf = rest
  if (!S.active) focusNext()
  else render()
}

// cmd+S / group menu: shelved tiles of the current space back to the board, beside the recent board
// tile (besidePlacement), in order.
export function unshelveGroup(ids: TileId[]) {
  ids = ids.filter((id) => location(id) === 'shelved' && spaceOf(id)?.id === S.current)
  S.selected.clear()
  debug('layout', 'unshelve group', ids)
  if (!ids.length) return render()
  placeGroup(ids, besidePlacement(null))
}

// Group menu "Move N to tab": as moveToSpace for each, placed as a group (placeGroup) in that space.
export function moveGroupToSpace(ids: TileId[], spaceId: string) {
  const to = S.spaces.find((x) => x.id === spaceId)
  if (!to) return debug('layout', 'move group refused', spaceId)
  ids = ids.filter((id) => S.tiles.has(id))
  const froms = new Set<Space>()
  for (const id of ids) {
    const from = spaceOf(id)
    if (from) from.selected.clear(), froms.add(from)
  }
  debug('layout', 'move group to space', ids, '->', to.id)
  for (const id of ids) {
    const from = spaceOf(id)
    if (from === to) continue // already here (shelved): placeGroup brings it to the board
    detach(id)
    getTile(id).activity = false
    if (from) withSpace(from.id, () => {
      S.mru = S.mru.filter((m) => m !== id)
      if (S.active === id) focusNext()
    })
  }
  withSpace(to.id, () => placeGroup(ids, besidePlacement(null)))
  for (const from of froms) if (from !== to) dropIfEmpty(from)
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
