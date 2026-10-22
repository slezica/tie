// Tile kinds. The host (tile.ts) owns the element, title bar, nav bar and error state; a kind
// supplies a Surface for the tile's body. Registry: one KindSpec per kind (how it opens, its
// shelf template). docs/TILES.md.
import type { TileId } from '@core/layout'
import type { Kind } from '../state'
import type { Nav } from '../nav'
import type { Glyph } from '../icons'
import { terminalKind } from './terminal'
import { fileView } from '../fileview'
import { htmlKind } from './html'
import { browserKind } from '../guest'

export interface OpenOpts {
  title?: string
  cwd?: string // start directory
  cmd?: string
  path?: string // file to view (kinds that open 'file')
  url?: string // page to load (kinds that open 'url': http(s), checked by the kind)
  hash?: string // anchor to show first (#part)
}

// What the host offers a kind.
export interface Host {
  id: TileId
  body: HTMLElement // the kind's area; sized by the host
  alive(): boolean // still open: async work re-checks before touching the tile
  changed(): void // automatic title / icon / dir / navigation changed
  activity(): void // new output (marks shelved tiles)
  exit(code: number): void // content ended: status shown in the title bar
  error(message: string): void // failed to start: message replaces the content
  close(): void
  hint(text: string | null): void // link strip at the tile's bottom-left (hovered link's real target); null hides
}

export interface Surface {
  mount(): Promise<void> // element placed and sized: start the content
  resize(): void // body size changed
  dispose(): void
  focus(): boolean // keys to this tile; false if it can't take them yet
  title(): string // automatic title
  tip?(): string // title tooltip (e.g. full path when the title is its basename)
  icon(): Glyph // automatic icon (built-in glyph; custom icons are the host's)
  dir?(): string | undefined // directory for tab titles (last known)
  cwd?(): Promise<string | undefined> // directory now, for tiles split from this one
  paste?(text: string): void
  drop?(data: DataTransfer): void
  appearance?(): void // theme / font settings changed
  info?(): Record<string, unknown> // extra fields for `tie list --json`
  nav?: Nav // navigates: the host shows the nav bar (nav.ts); keys cmd+[ / ] / R / L
  pill?: Pill // a state the kind shows in its title bar (html: "Scripts blocked"); a toggle if it has one
}

// Title-bar pill: a labelled toggle for one per-tile state (tile.ts renders it, `changed()` refreshes it).
export interface Pill {
  label(): string
  title(): string // tooltip
  on(): boolean // highlighted
  toggle?(): void // clickable
}

export type KindFactory = (host: Host, opts: OpenOpts) => Surface

export interface KindSpec {
  kind: Kind
  factory: KindFactory
  // How it opens: 'bare' (tie open <kind>, its template), 'file' (with a path only: tie open
  // <path>, drops, the file template), 'url' (an optional URL: tie open <url>, tie open <kind>
  // [url], its template). `cmd+D` on a kind that isn't 'bare' splits a terminal.
  opens: 'bare' | 'file' | 'url'
}

// Shelf templates (decision 2026-10-17): a terminal; a file (picker: any file, its kind decided as
// for tie open: extension, else content); a browser (empty, location focused). Not one per kind.
export interface Template {
  id: 'terminal' | 'file' | 'browser'
  label: string
  icon: Glyph
}
export const TEMPLATES: readonly Template[] = [
  { id: 'terminal', label: 'terminal', icon: 'terminal' },
  { id: 'file', label: 'file', icon: 'folder' },
  { id: 'browser', label: 'browser', icon: 'browser' },
]

const KINDS = new Map<string, KindSpec>()

// Dev builds add the harness probe (boot).
export function registerKind(spec: KindSpec) {
  KINDS.set(spec.kind, spec)
}

// File kinds: the file view (fileview.ts) + the kind's viewer (src/viewers/<kind>.ts). One line each.
const fileKind = (kind: Kind, icon: Glyph): KindSpec => ({ kind, factory: (host, opts) => fileView(host, opts, { kind, icon }), opens: 'file' })

registerKind({ kind: 'terminal', factory: terminalKind, opens: 'bare' })
registerKind(fileKind('markdown', 'markdown')) // docs/MARKDOWN.md
registerKind(fileKind('text', 'text')) // docs/VIEWERS.md
registerKind(fileKind('image', 'image'))
registerKind(fileKind('hex', 'hex'))
registerKind({ kind: 'html', factory: htmlKind, opens: 'file' }) // docs/VIEWERS.md
registerKind({ kind: 'browser', factory: browserKind, opens: 'url' }) // docs/BROWSER.md

export const kindSpec = (kind: string): KindSpec | undefined => KINDS.get(kind)
export const needsFile = (kind: string) => kindSpec(kind)?.opens === 'file'
