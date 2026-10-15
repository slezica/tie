// Files open in viewer tiles (markdown): open + watch, push changes, task toggles, file picker.
// docs/MARKDOWN.md. The renderer names files; main checks them (absolute, existing file, has a
// viewer) and owns every read and write.
import { dialog, type BrowserWindow } from 'electron'
import { stat, realpath, writeFile } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { log } from './env'
import { watchFile, readStable, revision, type Watch } from './watch'
import { viewerFor, noViewer, applyToggle } from '../core/markdown'

export type DocPush = { text: string; rev: string } | { missing: true }

interface Doc {
  path: string // as opened (may be a symlink)
  watch: Watch
}

const docs = new Map<number, Doc>()
let seq = 0

// Which viewer kind opens `path`: absolute, existing regular file, known extension.
export async function fileViewer(path: unknown): Promise<{ kind: 'markdown'; path: string } | { error: string }> {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) return { error: `Bad path: ${String(path)}` }
  const st = await stat(path).catch(() => null)
  if (!st) return { error: `No such file: ${path}` }
  if (!st.isFile()) return { error: `Not a file: ${path}` }
  const kind = viewerFor(path)
  return kind ? { kind, path } : { error: noViewer(path) }
}

// Open + watch. Every later change (or disappearance) is pushed as doc:changed(id, DocPush).
export async function openDoc(path: unknown, push: (id: number, p: DocPush) => void): Promise<{ id: number; text: string; rev: string } | { error: string }> {
  const v = await fileViewer(path)
  if ('error' in v) return v
  let r = await readStable(v.path)
  for (let i = 0; i < 5 && 'error' in r && r.error === 'unstable'; i++) r = await readStable(v.path)
  if ('error' in r) return { error: r.error === 'too large' ? `File too large: ${v.path}` : `Can't read ${v.path} (${r.error})` }
  const id = ++seq
  const rev = revision(r.buf)
  const watch = watchFile(v.path, rev, (e) => {
    if (!docs.has(id)) return
    log('docs', e.type, id, e.type === 'change' ? e.rev : '')
    push(id, e.type === 'change' ? { text: e.buf.toString('utf8'), rev: e.rev } : { missing: true })
  })
  docs.set(id, { path: v.path, watch })
  log('docs', 'open', id, v.path, rev)
  return { id, text: r.buf.toString('utf8'), rev }
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

// SECURITY: a task toggle writes the user's file on behalf of the viewer. Only if the file on disk
// right now is the revision the viewer rendered, and the line still holds the text it showed
// (applyToggle). Otherwise refused, and the viewer gets the current file (re-renders from disk).
// Written in place through the real path: symlinks stay links, the inode stays. Only UTF-8 files
// (the text must round-trip to the same bytes).
export async function toggleTask(id: unknown, line: unknown, expected: unknown, rev: unknown, push: (id: number, p: DocPush) => void): Promise<{ ok: true } | { error: string }> {
  const d = typeof id === 'number' ? docs.get(id) : undefined
  const refuse = (why: string, current?: { text: string; rev: string }) => {
    log('security', 'refused toggleTask', why, d?.path ?? id)
    if (current) push(id as number, current)
    return { error: why }
  }
  if (!d) return refuse('no such doc')
  if (typeof line !== 'number' || typeof expected !== 'string' || typeof rev !== 'string') return refuse('bad args')
  const r = await readStable(d.path)
  if ('error' in r) return refuse(r.error)
  const text = r.buf.toString('utf8')
  const current = { text, rev: revision(r.buf) }
  if (current.rev !== rev) return refuse('stale revision', current)
  if (!Buffer.from(text, 'utf8').equals(r.buf)) return refuse('not utf-8', current)
  const res = applyToggle(text, line, expected)
  if ('error' in res) return refuse(res.error, current)
  const real = await realpath(d.path).catch(() => null)
  if (!real) return refuse('missing')
  try {
    await writeFile(real, res.text)
  } catch (e) {
    return refuse(`write failed: ${(e as Error).message}`, current)
  }
  log('docs', 'toggled', id, line)
  await d.watch.check() // push the new text now, not after the debounce
  return { ok: true }
}

// File picker for the markdown template. Harness instances (TIE_BACKGROUND) never show a dialog:
// they answer with the path set by the dev socket method `pick` (once), else cancel.
let nextPick: string | null = null
export function setNextPick(path: unknown) {
  nextPick = typeof path === 'string' ? path : null
}
export async function pickFile(win: BrowserWindow | null, defaultPath: unknown): Promise<string | null> {
  if (process.env.TIE_BACKGROUND) {
    const p = nextPick
    nextPick = null
    log('docs', 'picker (harness)', p ?? 'cancel')
    return p
  }
  if (!win) return null
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
  })
  return r.canceled ? null : (r.filePaths[0] ?? null)
}
