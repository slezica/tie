// Tile kinds. The host (tile.ts) owns the element, title bar and error state; a kind
// supplies a Surface for the tile's body. Registry: one KindSpec per kind (how it opens, its
// shelf template). docs/TILES.md.
import type { TileId } from '@core/layout'
import type { Kind } from '../state'
import { terminalKind } from './terminal'
import { markdownKind } from './markdown'

export interface OpenOpts {
  title?: string
  cwd?: string // start directory
  cmd?: string
  path?: string // file to view (kinds that open 'file')
  hash?: string // anchor to show first (#part)
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
  history?(step: -1 | 1): void // back / forward (cmd+[ / cmd+])
}

export type KindFactory = (host: Host, opts: OpenOpts) => Surface

export interface KindSpec {
  kind: Kind
  factory: KindFactory
  // How it opens: 'bare' (tie open <kind>, template drop), 'file' (with a path only: tie open
  // <path>, drops, template + picker). `cmd+D` on a 'file' kind splits a terminal.
  opens: 'bare' | 'file'
  template?: { label: string; icon: string } // shelf template (drop: open; 'file': picker first)
}

const KINDS = new Map<string, KindSpec>()

// Dev builds add the harness probe (boot).
export function registerKind(spec: KindSpec) {
  KINDS.set(spec.kind, spec)
}

registerKind({ kind: 'terminal', factory: terminalKind, opens: 'bare', template: { label: 'terminal', icon: '' } })
registerKind({ kind: 'markdown', factory: markdownKind, opens: 'file', template: { label: 'markdown', icon: '📝' } })

export const kindSpec = (kind: string): KindSpec | undefined => KINDS.get(kind)
export const needsFile = (kind: string) => kindSpec(kind)?.opens === 'file'
export const templates = () => [...KINDS.values()].filter((k) => k.template)
