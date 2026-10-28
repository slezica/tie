// Single source of truth for the space: board tree, floating tiles, shelf.
import { contains, type Node, type Rect, type TileId } from '@core/layout'
import type { TieApi } from '../preload'
import type { Surface } from './kinds'
import type { ContentKind } from '@core/policy'

declare global {
  interface Window {
    tie: TieApi
  }
}
export const tie = window.tie

// Geometry (px), read from CSS vars in style.css :root (readGeometry, called by render).
export let TOP = 40 // --top-h: top strip: the toolbar, or the system title bar (traffic lights); 0 when toolbar bottom + borderless
export let BOTTOM = 0 // --bottom-h: the toolbar, when at the bottom
export let PAD = 6 // --pad: board edge padding
export let GAP = 6 // --gap: between tiles
export let TITLE = 30 // --title-h: title bar height; also collapsed bar thickness
export let PEAK = 8 // --peak: reveal arrow size
export let SLOT = 28 // --slot: shelf item / template square
export let SLOT_GAP = 2 // --slot-gap: between slots
export const MIN = 80 // min slotted tile size along split axis
export const REVEAL = { w: 0.3, h: 0.5 } // max fraction of board

export function readGeometry() {
  const cs = getComputedStyle(document.documentElement)
  const px = (name: string, fallback: number) => {
    const v = parseFloat(cs.getPropertyValue(name))
    return Number.isFinite(v) ? v : fallback
  }
  TOP = px('--top-h', TOP)
  BOTTOM = px('--bottom-h', BOTTOM)
  PAD = px('--pad', PAD)
  GAP = px('--gap', GAP)
  TITLE = px('--title-h', TITLE)
  PEAK = px('--peak', PEAK)
  SLOT = px('--slot', SLOT)
  SLOT_GAP = px('--slot-gap', SLOT_GAP)
}

// Tile kinds: the terminal (UI realm), the content kinds (policy table, core/policy), the
// browser (<webview> guest, core/guest).
export type Kind = 'terminal' | 'browser' | ContentKind

// Common to every kind; kind state lives behind `surface` (kinds/).
export interface Tile {
  id: TileId
  kind: Kind
  customTitle?: string
  customIcon?: string
  exit: number | null // content ended with this code (terminal: process exit)
  activity: boolean
  pinged: boolean // asked for attention (tie ping); clears when the tile becomes active
  error?: string // tile failed to start; shown instead of content
  el: HTMLElement
  body: HTMLElement
  surface: Surface
}

export interface Float extends Rect {
  id: TileId // x/y relative to board origin
}

// A space = board + shelf (+ per-space focus state). Shown as a tab.
export interface Space {
  id: string
  tree: Node | null
  floats: Float[] // z-order: last on top
  shelf: TileId[]
  collapsed: Set<TileId>
  zoomed: TileId | null
  active: TileId | null
  mru: TileId[]
  pinned: TileId | null // shelf item with reveal pinned open
  revealed: TileId | null // shelf item hovered
  customTitle?: string
  customIcon?: string
}

let spaceSeq = 0
export const newSpace = (): Space => ({
  id: `s${++spaceSeq}`,
  tree: null,
  floats: [],
  shelf: [],
  collapsed: new Set(),
  zoomed: null,
  active: null,
  mru: [],
  pinned: null,
  revealed: null,
})

const first = newSpace()

// Per-space fields (tree, floats, ...) are accessors onto the *current* space: the visible one,
// or another one temporarily during withSpace(). Code mutating S.tree etc. needs no space plumbing.
export const S = {
  tiles: new Map<TileId, Tile>(),
  spaces: [first] as Space[],
  visible: first.id, // the space shown on screen
  current: first.id, // the space ops act on (== visible except inside withSpace)
  cwd: '',
  rects: new Map<TileId, Rect>(), // last rendered rects (visible space), window coords
  get sp(): Space {
    return this.spaces.find((x) => x.id === this.current) ?? this.spaces[0]
  },
  get tree() { return this.sp.tree },
  set tree(v: Node | null) { this.sp.tree = v },
  get floats() { return this.sp.floats },
  set floats(v: Float[]) { this.sp.floats = v },
  get shelf() { return this.sp.shelf },
  set shelf(v: TileId[]) { this.sp.shelf = v },
  get collapsed() { return this.sp.collapsed },
  get zoomed() { return this.sp.zoomed },
  set zoomed(v: TileId | null) { this.sp.zoomed = v },
  get active() { return this.sp.active },
  set active(v: TileId | null) { this.sp.active = v },
  get mru() { return this.sp.mru },
  set mru(v: TileId[]) { this.sp.mru = v },
  get pinned() { return this.sp.pinned },
  set pinned(v: TileId | null) { this.sp.pinned = v },
  get revealed() { return this.sp.revealed },
  set revealed(v: TileId | null) { this.sp.revealed = v },
}

// Run fn with ops acting on another space (e.g. CLI call from a terminal in a background tab).
export function withSpace<T>(spaceId: string, fn: () => T): T {
  const prev = S.current
  const prevVisible = S.visible
  S.current = spaceId
  try {
    return fn()
  } finally {
    // If fn switched tabs, ops now belong to the newly visible space.
    S.current = S.visible !== prevVisible ? S.visible : prev
  }
}

export function spaceOf(id: TileId): Space | null {
  return S.spaces.find((x) => (x.tree && contains(x.tree, id)) || x.floats.some((f) => f.id === id) || x.shelf.includes(id)) ?? null
}

let seq = 0
export const newId = () => `t${++seq}`

export type Location = 'slotted' | 'floating' | 'shelved'
// Where a tile sits within its own space.
export function location(id: TileId): Location | null {
  const sp = spaceOf(id)
  if (!sp) return null
  if (sp.shelf.includes(id)) return 'shelved'
  if (sp.floats.some((f) => f.id === id)) return 'floating'
  return 'slotted'
}

export function boardRect(): Rect {
  const W = window.innerWidth
  const H = window.innerHeight
  const top = Math.max(TOP, PAD)
  return { x: PAD, y: top, w: W - PAD * 2, h: H - top - Math.max(BOTTOM, PAD) }
}

// The shelf strip in the toolbar (its DOM box): drop target, and what reveals open next to.
export function shelfRect(): Rect {
  const r = document.getElementById('shelf')!.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
}

// Size of a shelved tile's reveal; independent of item position so pty size stays stable.
export function revealSize() {
  const b = boardRect()
  return { w: Math.round(b.w * REVEAL.w), h: Math.round(b.h * REVEAL.h) }
}

export function getTile(id: TileId | undefined | null): Tile {
  const t = id ? S.tiles.get(id) : undefined
  if (!t) throw new Error(`no such tile: ${id}`)
  return t
}

export function debug(tag: string, ...args: unknown[]) {
  tie.log(tag, ...args)
}
