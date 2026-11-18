// Pure slot-tree logic: no DOM, no Electron. Unit-tested in layout.test.ts.

export type TileId = string

// 'row' = children side by side (horizontal split), 'col' = children stacked.
export type Dir = 'row' | 'col'
export type Side = 'l' | 'r' | 't' | 'b'

export interface Leaf {
  type: 'leaf'
  id: TileId
  donor?: TileId // the tile it took its space from (insert); gets it back on remove
}

export interface Split {
  type: 'split'
  dir: Dir
  children: Node[]
  sizes: number[] // fractions, sum 1
}

export type Node = Leaf | Split

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const leaf = (id: TileId): Leaf => ({ type: 'leaf', id })

export function leaves(node: Node | null): TileId[] {
  if (!node) return []
  if (node.type === 'leaf') return [node.id]
  return node.children.flatMap(leaves)
}

export function contains(node: Node | null, id: TileId): boolean {
  return leaves(node).includes(id)
}

export const sideDir = (side: Side): Dir => (side === 'l' || side === 'r' ? 'row' : 'col')
const sideBefore = (side: Side) => side === 'l' || side === 't'

// Collapse single-child splits and merge nested same-direction splits.
export function normalize(node: Node): Node {
  if (node.type === 'leaf') return node
  const children: Node[] = []
  const sizes: number[] = []
  node.children.forEach((c, i) => {
    const n = normalize(c)
    if (n.type === 'split' && n.dir === node.dir) {
      n.children.forEach((cc, j) => {
        children.push(cc)
        sizes.push(node.sizes[i] * n.sizes[j])
      })
    } else {
      children.push(n)
      sizes.push(node.sizes[i])
    }
  })
  if (children.length === 1) return children[0]
  const total = sizes.reduce((a, b) => a + b, 0)
  return { type: 'split', dir: node.dir, children, sizes: sizes.map((s) => s / total) }
}

// Insert newId next to targetId on given side; the new tile takes half the target's space and
// remembers the target as its donor.
export function insert(root: Node | null, targetId: TileId | null, side: Side, newId: TileId): Node {
  if (!root) return leaf(newId)
  if (!targetId || !contains(root, targetId)) targetId = leaves(root)[0]
  const dir = sideDir(side)
  const before = sideBefore(side)
  const added: Leaf = { type: 'leaf', id: newId, donor: targetId }

  const visit = (node: Node): Node => {
    if (node.type === 'leaf') {
      if (node.id !== targetId) return node
      const pair = before ? [added, node] : [node, added]
      return { type: 'split', dir, children: pair, sizes: [0.5, 0.5] }
    }
    const idx = node.children.findIndex((c) => c.type === 'leaf' && c.id === targetId)
    if (idx >= 0 && node.dir === dir) {
      const children = [...node.children]
      const sizes = [...node.sizes]
      const half = sizes[idx] / 2
      sizes[idx] = half
      const at = before ? idx : idx + 1
      children.splice(at, 0, added)
      sizes.splice(at, 0, half)
      return { ...node, children, sizes }
    }
    return { ...node, children: node.children.map(visit) }
  }
  return normalize(visit(root))
}

// Remove a leaf. Its space goes back to its donor (the sibling subtree now holding it), so split
// then close restores the sizes; no donor among the siblings: to all siblings proportionally.
export function remove(root: Node | null, id: TileId): Node | null {
  if (!root || !contains(root, id)) return root // unchanged trees keep their identity
  if (root.type === 'leaf') return root.id === id ? null : root
  const children: Node[] = []
  const sizes: number[] = []
  let freed = 0
  let donor: TileId | undefined
  root.children.forEach((c, i) => {
    const n = remove(c, id)
    if (n) {
      children.push(n)
      sizes.push(root.sizes[i])
    } else if (c.type === 'leaf') {
      freed = root.sizes[i]
      donor = c.donor
    }
  })
  if (children.length === 0) return null
  const back = donor === undefined ? -1 : children.findIndex((c) => contains(c, donor!))
  if (back >= 0) sizes[back] += freed
  const total = sizes.reduce((a, b) => a + b, 0)
  return normalize({ ...root, children, sizes: sizes.map((s) => s / total) })
}

// Move an existing leaf next to another (remove + insert).
export function move(root: Node | null, id: TileId, targetId: TileId, side: Side): Node | null {
  if (id === targetId) return root
  return insert(remove(root, id), targetId, side, id)
}

// Exchange two tile ids in the tree: each takes the other's leaf (size, place, donor links follow
// the position). Only one present: that leaf takes the other id (a tile coming in from a float or
// the shelf). Neither, or a === b: unchanged.
export function swapLeaves(root: Node | null, a: TileId, b: TileId): Node | null {
  if (!root || a === b || (!contains(root, a) && !contains(root, b))) return root
  const other = (id: TileId) => (id === a ? b : id === b ? a : id)
  const visit = (node: Node): Node => {
    if (node.type === 'split') return { ...node, children: node.children.map(visit), sizes: [...node.sizes] }
    const out: Leaf = { type: 'leaf', id: other(node.id) }
    if (node.donor !== undefined) out.donor = other(node.donor)
    return out
  }
  return normalize(visit(root))
}

// Put tile b in a's leaf (size, place, donor kept; leaves that had a as donor now point at b).
// b already in the tree: removed first. a absent: unchanged.
export function replaceLeaf(root: Node | null, a: TileId, b: TileId): Node | null {
  if (!root || a === b || !contains(root, a)) return root
  const base = contains(root, b) ? remove(root, b)! : root
  const visit = (node: Node): Node => {
    if (node.type === 'split') return { ...node, children: node.children.map(visit), sizes: [...node.sizes] }
    const out: Leaf = { type: 'leaf', id: node.id === a ? b : node.id }
    if (node.donor !== undefined) out.donor = node.donor === a ? b : node.donor
    return out
  }
  return normalize(visit(base))
}

// Parent split direction of a leaf, or null if root/absent.
export function parentDir(root: Node | null, id: TileId): Dir | null {
  if (!root || root.type === 'leaf') return null
  for (const c of root.children) {
    if (c.type === 'leaf' && c.id === id) return root.dir
    const d = parentDir(c, id)
    if (d) return d
  }
  return null
}

// Drop zones on a slotted tile (INPUT.md "Drop targets"): a centered rectangle, CENTER_ZONE of the
// tile's width and of its height, is 'center' (swap / displace); around it four edge bands
// (trapezoids), the nearest edge wins. Normalized coords, so the bands follow the diagonals
// whatever the tile's aspect.
export const CENTER_ZONE = 0.25

export function dropZone(rect: Rect, px: number, py: number): Side | 'center' {
  const side = nearestEdge(rect, px, py)
  return edgeDistance(rect, px, py)[side] > (1 - CENTER_ZONE) / 2 ? 'center' : side
}

// The nearest edge of a tile (normalized, as dropZone's bands), with no center zone: group drops.
export function nearestEdge(rect: Rect, px: number, py: number): Side {
  const d = edgeDistance(rect, px, py)
  return (Object.keys(d) as Side[]).reduce((a, b) => (d[b] < d[a] ? b : a))
}

function edgeDistance(rect: Rect, px: number, py: number): Record<Side, number> {
  const nx = (px - rect.x) / rect.w
  const ny = (py - rect.y) / rect.h
  return { l: nx, r: 1 - nx, t: ny, b: 1 - ny }
}

// Shelf hover reveal: kept open while the pointer is over its item, the reveal, or the band
// between them (the gap, spanning both along the other axis), so the pointer can travel from the
// item into the reveal whichever side it opens on (SHELF.md). `slack`: px of tolerance around each.
export function inRevealZone(px: number, py: number, item: Rect, reveal: Rect, slack = 2): boolean {
  const inside = (r: Rect) => px >= r.x - slack && px <= r.x + r.w + slack && py >= r.y - slack && py <= r.y + r.h + slack
  const band = gapBetween(item, reveal)
  return inside(item) || inside(reveal) || (band !== null && inside(band))
}

// The gap between two separated rects, spanning both along the other axis: side by side → a vertical
// band; one above the other → a horizontal band. Overlapping rects: none.
function gapBetween(a: Rect, b: Rect): Rect | null {
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x + a.w, b.x + b.w)
  const y0 = Math.min(a.y, b.y)
  const y1 = Math.max(a.y + a.h, b.y + b.h)
  const left = Math.min(a.x + a.w, b.x + b.w) // inner edges
  const right = Math.max(a.x, b.x)
  const top = Math.min(a.y + a.h, b.y + b.h)
  const bottom = Math.max(a.y, b.y)
  if (left <= right) return { x: left, y: y0, w: right - left, h: y1 - y0 }
  if (top <= bottom) return { x: x0, y: top, w: x1 - x0, h: bottom - top }
  return null
}

export interface LayoutOptions {
  gap: number // px between siblings
  bar: number // px thickness of a collapsed tile
  collapsed: Set<TileId>
  zoomed?: TileId | null // a leaf of the tree: it takes the board, the rest squashed to bars (LAYOUT.md "Zoom")
}

export interface TileRect extends Rect {
  collapsed: 'none' | 'horizontal' | 'vertical'
}

export interface Border {
  path: number[] // path of indices from root to the split
  index: number // border between children[index] and children[index+1]
  dir: Dir
  rect: Rect // hit area, spans the gap
  length: number // px corresponding to a size fraction of 1
}

export interface Layout {
  tiles: Map<TileId, TileRect>
  borders: Border[]
}

const isCollapsedLeaf = (n: Node, o: LayoutOptions) => n.type === 'leaf' && o.collapsed.has(n.id)

export function compute(root: Node | null, area: Rect, o: LayoutOptions): Layout {
  const out: Layout = { tiles: new Map(), borders: [] }
  if (!root) return out
  if (o.zoomed && contains(root, o.zoomed)) return zoomLayout(root, area, o, o.zoomed)

  const walk = (node: Node, r: Rect, path: number[], collapse: TileRect['collapsed']) => {
    if (node.type === 'leaf') {
      out.tiles.set(node.id, { ...r, collapsed: collapse })
      return
    }
    const along = node.dir === 'row' ? r.w : r.h
    const n = node.children.length
    const avail = along - o.gap * (n - 1)
    // Collapsed leaves take fixed bar thickness; if all are collapsed, the last one expands.
    let collapsedFlags = node.children.map((c) => isCollapsedLeaf(c, o))
    if (collapsedFlags.every(Boolean)) collapsedFlags = collapsedFlags.map((f, i) => (i === n - 1 ? false : f))
    const fixed = collapsedFlags.filter(Boolean).length * o.bar
    const flexTotal = node.sizes.reduce((a, s, i) => (collapsedFlags[i] ? a : a + s), 0)
    const flexAvail = Math.max(0, avail - fixed)

    let pos = node.dir === 'row' ? r.x : r.y
    node.children.forEach((child, i) => {
      const len = collapsedFlags[i] ? o.bar : (node.sizes[i] / flexTotal) * flexAvail
      const cr: Rect = node.dir === 'row' ? { x: pos, y: r.y, w: len, h: r.h } : { x: r.x, y: pos, w: r.w, h: len }
      const cc: TileRect['collapsed'] = collapsedFlags[i] ? (node.dir === 'row' ? 'vertical' : 'horizontal') : 'none'
      walk(child, cr, [...path, i], cc)
      pos += len
      if (i < n - 1 && !collapsedFlags[i] && !collapsedFlags[i + 1]) {
        const br: Rect = node.dir === 'row' ? { x: pos, y: r.y, w: o.gap, h: r.h } : { x: r.x, y: pos, w: r.w, h: o.gap }
        out.borders.push({ path, index: i, dir: node.dir, rect: br, length: flexAvail / (flexTotal || 1) })
      }
      if (i < n - 1) pos += o.gap
    })
  }
  walk(root, area, [], 'none')
  return out
}

// Zoom: at each split on the way down to the zoomed leaf, every other child shrinks to one bar; a
// squashed subtree shows its leaves as collapsed bars sharing that bar's length equally (document
// order). No borders. The user's own collapse set doesn't matter here (and isn't touched).
function zoomLayout(root: Node, area: Rect, o: LayoutOptions, zoomed: TileId): Layout {
  const out: Layout = { tiles: new Map(), borders: [] }
  const squash = (node: Node, r: Rect, dir: Dir) => {
    const ids = leaves(node)
    const len = Math.max(0, ((dir === 'row' ? r.h : r.w) - o.gap * (ids.length - 1)) / ids.length)
    ids.forEach((id, i) => {
      const at = i * (len + o.gap)
      out.tiles.set(id, dir === 'row' ? { x: r.x, y: r.y + at, w: r.w, h: len, collapsed: 'vertical' } : { x: r.x + at, y: r.y, w: len, h: r.h, collapsed: 'horizontal' })
    })
  }
  const walk = (node: Node, r: Rect) => {
    if (node.type === 'leaf') return void out.tiles.set(node.id, { ...r, collapsed: 'none' })
    const n = node.children.length
    const rest = Math.max(0, (node.dir === 'row' ? r.w : r.h) - (o.gap + o.bar) * (n - 1))
    let pos = node.dir === 'row' ? r.x : r.y
    for (const child of node.children) {
      const on = contains(child, zoomed)
      const len = on ? rest : o.bar
      const cr: Rect = node.dir === 'row' ? { x: pos, y: r.y, w: len, h: r.h } : { x: r.x, y: pos, w: r.w, h: len }
      if (on) walk(child, cr)
      else squash(child, cr, node.dir)
      pos += len + o.gap
    }
  }
  walk(root, area)
  return out
}

function splitAt(root: Node, path: number[]): Split | null {
  let node: Node = root
  for (const i of path) {
    if (node.type !== 'split') return null
    node = node.children[i]
  }
  return node.type === 'split' ? node : null
}

// Move the border between children[index] and [index+1] by deltaPx, respecting minPx.
export function resize(root: Node, path: number[], index: number, deltaPx: number, lengthPx: number, minPx: number): Node {
  const clone: Node = structuredClone(root)
  const split = splitAt(clone, path)
  if (!split || lengthPx <= 0) return root
  const s = split.sizes
  const pair = s[index] + s[index + 1]
  const min = Math.min(minPx / lengthPx, pair / 2)
  const a = Math.min(Math.max(s[index] + deltaPx / lengthPx, min), pair - min)
  s[index] = a
  s[index + 1] = pair - a
  return clone
}

// Equal sizes for every child of the split at path (border double-click).
export function equalize(root: Node, path: number[]): Node {
  const clone: Node = structuredClone(root)
  const split = splitAt(clone, path)
  if (!split) return root
  split.sizes = split.children.map(() => 1 / split.children.length)
  return clone
}

// Insert leaves `ids` as a group (LAYOUT.md "Group insertion"): they take the area a single insert
// of one tile at (`at`, `side`) would take (`insert`), split evenly along that area's longer side
// (wide: side by side, in order left to right; tall: stacked, top to bottom). The area depends on
// the layout, so it is measured: the single insert laid out in `board` with `o` (pass the options
// the board renders with). Empty tree: the group fills `board`. Every leaf's donor is the target
// (`at`): closing the whole group, in any order, gives the target its space back; one of a nested
// group shares its space with the rest of the group (remove: donor not a sibling). `ids` already
// in the tree are moved. N = 1: exactly `insert`.
export function insertGroup(root: Node | null, at: TileId | null, side: Side, ids: TileId[], board: Rect, o: LayoutOptions): Node | null {
  if (!ids.length) return root
  for (const id of ids) root = remove(root, id)
  const one = insert(root, at, side, ids[0])
  if (ids.length === 1) return one
  const area = compute(one, board, { ...o, zoomed: null, collapsed: new Set([...o.collapsed].filter((c) => c !== ids[0])) }).tiles.get(ids[0])!
  const dir: Dir = area.w >= area.h ? 'row' : 'col'
  const first = leafOf(one, ids[0])!
  const group: Split = {
    type: 'split',
    dir,
    children: ids.map((id): Leaf => (first.donor === undefined ? leaf(id) : { type: 'leaf', id, donor: first.donor })),
    sizes: ids.map(() => 1 / ids.length),
  }
  const visit = (node: Node): Node => (node.type === 'leaf' ? (node.id === ids[0] ? group : node) : { ...node, children: node.children.map(visit) })
  return normalize(visit(one))
}

function leafOf(node: Node, id: TileId): Leaf | null {
  if (node.type === 'leaf') return node.id === id ? node : null
  for (const c of node.children) {
    const l = leafOf(c, id)
    if (l) return l
  }
  return null
}
