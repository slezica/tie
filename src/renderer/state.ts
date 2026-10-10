// Single source of truth for the space: board tree, floating tiles, shelf.
import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import type { Node, Rect, TileId } from '@core/layout'
import type { TieApi } from '../preload'

declare global {
  interface Window {
    tie: TieApi
  }
}
export const tie = window.tie

// Geometry (px).
export const TOP = 36 // top bar (window drag region)
export const PAD = 6 // board padding
export const GAP = 6 // between slotted tiles
export const TITLE = 30 // title bar height; also collapsed bar thickness
export const SHELF_W = 68
export const MIN = 80 // min slotted tile size along split axis
export const REVEAL = { w: 0.3, h: 0.5 } // max fraction of board
export const PEAK = 8 // reveal ">" peak size

export type Kind = 'terminal'

export interface Tile {
  id: TileId
  kind: Kind
  customTitle?: string
  customIcon?: string
  oscTitle?: string
  proc?: string
  exit: number | null
  activity: boolean
  pty: number | null
  ptySize?: { cols: number; rows: number } // last size sent to the pty
  cwd?: string
  cmd?: string
  el: HTMLElement
  body: HTMLElement
  term: Terminal
  fit: FitAddon
}

export interface Float extends Rect {
  id: TileId // x/y relative to board origin
}

export const S = {
  tiles: new Map<TileId, Tile>(),
  tree: null as Node | null,
  floats: [] as Float[], // z-order: last on top
  shelf: [] as TileId[],
  collapsed: new Set<TileId>(),
  zoomed: null as TileId | null,
  active: null as TileId | null,
  mru: [] as TileId[],
  pinned: null as TileId | null, // shelf item with reveal pinned open
  revealed: null as TileId | null, // shelf item hovered
  cwd: '',
  rects: new Map<TileId, Rect>(), // last rendered rects, window coords
}

let seq = 0
export const newId = () => `t${++seq}`

export type Location = 'slotted' | 'floating' | 'shelved'
export function location(id: TileId): Location | null {
  if (S.shelf.includes(id)) return 'shelved'
  if (S.floats.some((f) => f.id === id)) return 'floating'
  if (S.tiles.has(id)) return 'slotted'
  return null
}

export function boardRect(): Rect {
  const W = window.innerWidth
  const H = window.innerHeight
  return { x: PAD, y: TOP, w: W - SHELF_W - PAD * 2 - GAP, h: H - TOP - PAD } // GAP before shelf, like between tiles
}

export function shelfRect(): Rect {
  const W = window.innerWidth
  return { x: W - SHELF_W - PAD, y: TOP, w: SHELF_W, h: window.innerHeight - TOP - PAD }
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
