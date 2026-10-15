// Tile kinds. The host (tile.ts) owns the element, title bar and error state; a kind supplies a
// Surface for the tile's body. docs/TILES.md.
import type { TileId } from '@core/layout'
import type { Kind } from '../state'
import { terminalKind } from './terminal'

export interface OpenOpts {
  title?: string
  cwd?: string // start directory
  cmd?: string
}

// What the host offers a kind.
export interface Host {
  id: TileId
  body: HTMLElement // the kind's area; sized by the host
  alive(): boolean // still open: async work re-checks before touching the tile
  changed(): void // automatic title / icon / dir changed
  activity(): void // new output (marks shelved tiles)
  exit(code: number): void // content ended: status shown in the title bar
  error(message: string): void // failed to start: message replaces the content
  close(): void
}

export interface Surface {
  mount(): Promise<void> // element placed and sized: start the content
  resize(): void // body size changed
  dispose(): void
  focus(): boolean // keys to this tile; false if it can't take them yet
  title(): string // automatic title
  icon(): string // automatic icon ('' = kind glyph)
  dir?(): string | undefined // directory for tab titles (last known)
  cwd?(): Promise<string | undefined> // directory now, for tiles split from this one
  paste?(text: string): void
  drop?(data: DataTransfer): void
  appearance?(): void // theme / font settings changed
  info?(): Record<string, unknown> // extra fields for `tie list --json`
}

export type KindFactory = (host: Host, opts: OpenOpts) => Surface

const KINDS: Partial<Record<Kind, KindFactory>> = { terminal: terminalKind }

// Dev builds add the harness probe (boot).
export function registerKind(kind: Kind, factory: KindFactory) {
  KINDS[kind] = factory
}

export function kindFactory(kind: string): KindFactory | undefined {
  return Object.hasOwn(KINDS, kind) ? KINDS[kind as Kind] : undefined
}
