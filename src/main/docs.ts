// Files open in viewer tiles: open + watch, push changes, file picker. Read-only: no path here
// writes a file. The renderer names files; main checks them (absolute, existing regular file, its
// kind: core/kinds, by extension or content; size cap) and owns every read. Payload (text, bytes or
// nothing) and size cap per kind: policy table (core/policy). docs/TILES.md "File view".
import { dialog, type BrowserWindow } from 'electron'
import { open, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { log } from './env'
import { untrusted } from '../core/log'
import { watchFile, readStable, revision, type Watch } from './watch'
import { fileKind, sniff, sniffKind, canOpenAs, isFileKind, SNIFF_BYTES } from '../core/kinds'
import { policyOf, type ContentKind, type ContentPolicy } from '../core/policy'

// What a viewer gets from the file (policy payload): text, bytes, or nothing (loads it by URL).
export type Body = { text?: string; bytes?: Uint8Array }
export type DocPush = ({ rev: string } & Body) | { missing: true }

interface Doc {
  path: string // as opened (may be a symlink)
  watch: Watch
}

const docs = new Map<number, Doc>()
let seq = 0

const MB = 1024 * 1024
const tooLarge = (path: string, p: ContentPolicy) => `File too large: ${path} (max ${p.maxBytes / MB} MB)`

async function head(path: string): Promise<Uint8Array> {
  const f = await open(path, 'r')
  try {
    const buf = new Uint8Array(SNIFF_BYTES)
    const { bytesRead } = await f.read(buf, 0, SNIFF_BYTES, 0)
    return buf.subarray(0, bytesRead)
  } finally {
    await f.close()
  }
}

// SECURITY: the renderer (or a drop, or the CLI) names the file; main decides what it is. Absolute,
// existing regular file; kind by extension, else by content (text or hex); `want` (a template's
// kind) only where canOpenAs allows it; size within the kind's cap.
export async function fileViewer(path: unknown, want?: unknown): Promise<{ kind: ContentKind; path: string } | { error: string }> {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) return { error: `Bad path: ${String(path)}` }
  if (want !== undefined && !isFileKind(want)) return { error: `Not a file kind: ${String(want)}` }
  const st = await stat(path).catch(() => null)
  if (!st) return { error: `No such file: ${path}` }
  if (!st.isFile()) return { error: `Not a file: ${path}` }
  let kind = fileKind(path)
  if (!kind || (want && want !== kind)) {
    const sample = await head(path).catch(() => null)
    if (!sample) return { error: `Can't read ${path}` }
    const textLike = sniff(sample, st.size) === 'text'
    kind ??= sniffKind(sample, st.size)
    if (want && !canOpenAs(want, kind, textLike)) return { error: `Can't open as ${want}: ${path}` }
    if (want) kind = want
  }
  const p = policyOf(kind)!
  if (p.maxBytes && st.size > p.maxBytes) return { error: tooLarge(path, p) }
  return { kind, path }
}

const bodyOf = (p: ContentPolicy, buf: Buffer): Body => (p.payload === 'text' ? { text: buf.toString('utf8') } : p.payload === 'bytes' ? { bytes: buf } : {})

// Open + watch, as `want` (the tile's kind; default: the file's own). Every later change (or
// disappearance) is pushed as doc:changed(id, DocPush).
export async function openDoc(path: unknown, want: unknown, push: (id: number, p: DocPush) => void): Promise<({ id: number; kind: ContentKind; rev: string } & Body) | { error: string }> {
  const v = await fileViewer(path, want ?? undefined)
  if ('error' in v) return v
  const p = policyOf(v.kind)!
  if (p.page !== 'viewer') return { error: `Not a viewer kind: ${v.kind}` } // documents: served by the protocol
  let r = await readStable(v.path, p.maxBytes)
  for (let i = 0; i < 5 && 'error' in r && r.error === 'unstable'; i++) r = await readStable(v.path, p.maxBytes)
  if ('error' in r) return { error: r.error === 'too large' ? tooLarge(v.path, p) : `Can't read ${v.path} (${r.error})` }
  const id = ++seq
  const rev = revision(r.buf)
  const watch = watchFile(
    v.path,
    rev,
    (e) => {
      if (!docs.has(id)) return
      log('docs', e.type, id, e.type === 'change' ? e.rev : '')
      push(id, e.type === 'change' ? { rev: e.rev, ...bodyOf(p, e.buf) } : { missing: true })
    },
    { maxBytes: p.maxBytes },
  )
  docs.set(id, { path: v.path, watch })
  log('docs', 'open', id, v.kind, untrusted(v.path), rev)
  return { id, kind: v.kind, rev, ...bodyOf(p, r.buf) }
}

export function closeDoc(id: unknown) {
  const d = typeof id === 'number' ? docs.get(id) : undefined
  if (!d) return
  d.watch.close()
  docs.delete(id as number)
  log('docs', 'close', id)
}

// Shell reloaded: its tiles are gone.
export function clearDocs() {
  for (const d of docs.values()) d.watch.close()
  docs.clear()
}

// File picker for the file template (any file; the kind is decided after). Harness instances
// (TIE_BACKGROUND) never show a dialog: they answer with the path set by the dev socket method
// `pick` (once), else cancel.
let nextPick: string | null = null
export function setNextPick(path: unknown) {
  nextPick = typeof path === 'string' ? path : null
}
export async function pickFile(win: BrowserWindow | null, defaultPath: unknown): Promise<string | null> {
  if (process.env.TIE_BACKGROUND) {
    const p = nextPick
    nextPick = null
    log('docs', 'picker (harness)', untrusted(p ?? 'cancel'))
    return p
  }
  if (!win) return null
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined })
  return r.canceled ? null : (r.filePaths[0] ?? null)
}
