// Content protocol: tie-content://<token>/ serves one content tile (sandboxed frame; viewers on an
// opaque origin, html documents on the token's own). Token → root registry, viewer files, root
// files, html documents (CSP + bootstrap), folder watch and navigation reports for documents.
// docs/TILES.md, docs/VIEWERS.md "Html", docs/SECURITY.md.
import { app, webFrameMain, type Session, type WebContents, type WebFrameMain } from 'electron'
import { randomBytes } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { realpathSync, statSync, readFileSync, createReadStream, watch, type FSWatcher } from 'node:fs'
import { Readable } from 'node:stream'
import { extname, isAbsolute, join } from 'node:path'
import { log } from './env'
import { untrusted } from '../core/log'
import { CONTENT_SCHEME, routeContent, isInside, viewerUrl, parseContentUrl, navAllowed, contentFile, documentUrl, isDocument, bootstrapAt, htmlCharset } from '../core/content'
import { policyOf, viewerKinds, contentCsp, documentCsp } from '../core/policy'

interface Entry {
  root: string // real path
  kind: string // viewer name
  frame: number | null // frameTreeNodeId of the one frame that may show it (bound on first load)
  watcher?: FSWatcher // documents: the root folder (live reload)
}

// Main → UI pushes (index.ts sets it): document navigations, failed navigations, folder changes.
type Send = (channel: string, ...args: unknown[]) => void
let send: Send = () => {}

const entries = new Map<string, Entry>()

// Kinds with a viewer (out/viewers/<kind>.html|js), from the policy table. Dev-only rows (probe,
// the harness kind) only in dev builds.
const VIEWERS = new Set<string>(viewerKinds(!app.isPackaged))
const viewersDir = join(import.meta.dirname, '../viewers')

const TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.bmp': 'image/bmp',
  '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
}
// Files of an html document's folder (scripts, styles, data, fonts, media). Anything else:
// application/octet-stream (never sniffed).
const DOC_TYPES: Record<string, string> = {
  ...TYPES,
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.map': 'application/json', '.wasm': 'application/wasm', '.xml': 'application/xml',
  '.csv': 'text/csv; charset=utf-8', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
}

const isDocKind = (kind: string) => policyOf(kind)?.page === 'document'

// SECURITY: the UI (trusted) names the root; still checked: absolute, existing directory, real
// path (symlinked roots resolve once, here). Document kinds also name the page: a document inside
// the root. Returns the frame URL, never file paths.
export function openContent(root: unknown, kind: unknown, page?: unknown): { token: string; url: string } | { error: string } {
  if (typeof kind !== 'string' || !(VIEWERS.has(kind) || isDocKind(kind))) return { error: `unknown kind: ${String(kind)}` }
  let real: string
  try {
    if (typeof root !== 'string' || !isAbsolute(root)) throw new Error()
    real = realpathSync(root)
    if (!statSync(real).isDirectory()) throw new Error()
  } catch {
    return { error: `Directory not found: ${String(root)}` }
  }
  // All-digit hosts canonicalize as IPv4 (≈3e-7 odds): mint until the URL keeps the token.
  let token: string
  do token = randomBytes(16).toString('hex')
  while (parseContentUrl(viewerUrl(token, kind))?.token !== token)
  if (isDocKind(kind)) {
    if (typeof page !== 'string' || !isDocument(page) || !contentFile(real, '/' + page.split('/').map(encodeURIComponent).join('/'))) return { error: `Not a page in ${real}: ${String(page)}` }
  }
  entries.set(token, { root: real, kind, frame: null })
  if (isDocKind(kind)) watchRoot(token)
  log('content', 'open', kind, token.slice(0, 8), untrusted(real))
  return { token, url: isDocKind(kind) ? documentUrl(token, page as string) : viewerUrl(token, kind) }
}

// Documents: any change in the root folder (non-recursive) → `content:changed` (debounced); the
// tile reloads its page.
function watchRoot(token: string) {
  const e = entries.get(token)!
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    e.watcher = watch(e.root, { persistent: false }, () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => entries.has(token) && send('content:changed', token), 150)
    })
    e.watcher.on('error', () => e.watcher?.close())
  } catch {
    log('content', 'watch failed', token.slice(0, 8), untrusted(e.root))
  }
}

// A document's storage (localStorage, IndexedDB, ...) lives under its token origin in the UI's
// in-memory session (security.ts UI_PARTITION): never on disk, gone at quit; unreachable after
// close (no frame gets that token again).
function forget(_token: string, e: Entry) {
  e.watcher?.close()
}

export function closeContent(token: unknown) {
  const e = typeof token === 'string' ? entries.get(token) : undefined
  if (!e) return
  entries.delete(token as string)
  forget(token as string, e)
  log('content', 'close', (token as string).slice(0, 8))
}

// SECURITY: a content frame that stopped answering (frame.ts watchdog) keeps spinning in its
// renderer even after the UI removes it (a stuck thread never handles the shutdown). Kill its
// process, but only if that process holds nothing else: never the UI's, never one shared with
// another frame. Then forget the token.
export function killContent(token: unknown, ui: WebFrameMain | null) {
  const e = typeof token === 'string' ? entries.get(token) : undefined
  if (e && e.frame !== null && ui) {
    const frames = ui.framesInSubtree
    const f = frames.find((x) => x.frameTreeNodeId === e.frame)
    const pid = f?.osProcessId
    if (f && pid && pid !== ui.osProcessId && pid !== process.pid && frames.every((x) => x === f || x.osProcessId !== pid)) {
      try {
        process.kill(pid, 'SIGKILL')
        log('content', 'killed', (token as string).slice(0, 8), pid)
      } catch {}
    } else log('content', 'not killed (shared or gone)', (token as string).slice(0, 8), pid)
  }
  closeContent(token)
}

// UI reloaded: its content tiles are gone.
export function clearContent() {
  for (const [token, e] of entries) forget(token, e)
  entries.clear()
}

// Document frames navigate themselves (links the page handled, scripts, the host's src changes).
// Main sees every committed navigation of a frame bound to a document token: reported to the UI
// (`content:navigated`, URL path), which follows it (location, history). A navigation that fails
// (the UI CSP refuses http(s), file:, other schemes: the frame would end on an error page) is
// reported too (`content:navfailed`): the tile reloads its page. Aborted ones (-3: the nav lock
// cancelled it) leave the frame where it was: nothing to do.
export function initContent(wc: WebContents, push: Send) {
  send = push
  const docOf = (procId: number, routingId: number) => {
    const f = webFrameMain.fromId(procId, routingId)
    if (!f || f.parent !== wc.mainFrame) return null
    for (const [token, e] of entries) if (e.frame === f.frameTreeNodeId && isDocKind(e.kind)) return token
    return null
  }
  wc.on('did-frame-navigate', (_e, url, _code, _status, isMain, procId, routingId) => {
    if (isMain) return
    const u = parseContentUrl(url)
    const token = docOf(procId, routingId)
    if (u && token && u.token === token) send('content:navigated', token, u.path)
  })
  wc.on('did-fail-provisional-load', (_e, code, desc, url, isMain, procId, routingId) => {
    if (isMain || code === -3) return
    const token = docOf(procId, routingId)
    if (!token) return
    log('security', 'document navigation failed', token.slice(0, 8), code, desc, untrusted(url))
    send('content:navfailed', token)
  })
}

// SECURITY: frame nav lock (with will-frame-navigate, security.ts). A subframe may load only what
// its kind's nav rule allows (policy table; 'viewer-exact': the exact viewer URL) of a registered
// token, as a direct child of the UI, and each token binds to the first frame that loads it:
// content can't navigate itself elsewhere (meta refresh, location, links, drops) or into another
// tile's viewer. So the UI's port handshake (targetOrigin '*' to an opaque origin) always
// reaches the tile's own viewer.
export function contentFrameAllowed(url: string, frame: WebFrameMain | null, uiFrame: WebFrameMain): boolean {
  const u = parseContentUrl(url)
  const e = u && entries.get(u.token)
  if (!u || !e || !frame || frame.parent !== uiFrame) return false
  if (!navAllowed(e.kind, u.token, url)) return false
  e.frame ??= frame.frameTreeNodeId
  return e.frame === frame.frameTreeNodeId
}

const refuse = (url: string, why: string) => {
  log('security', 'refused content', why, untrusted(url))
  return new Response('not found', { status: 404 })
}

// SECURITY: content responses never sniff, never cache; root files are inert if ever opened as a
// document (CSP sandbox, nothing loads). Viewer pages get contentCsp with a fresh nonce each time.
// Document tokens (html): every file gets documentCsp; .html/.htm files
// get the bootstrap first in <head>. Files are read here (no net.fetch: no redirects, no file://
// URL handling).
const HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }

// The bootstrap (out/viewers/html-bootstrap.js), read once. Refused if it could end its <script>.
let bootstrapJs: string | null = null
function bootstrap(): string | null {
  if (bootstrapJs === null) {
    try {
      const js = readFileSync(join(viewersDir, 'html-bootstrap.js'), 'utf8')
      bootstrapJs = /<\/script|<!--/i.test(js) || /[^\x00-\x7f]/.test(js) ? '' : js
    } catch {
      bootstrapJs = ''
    }
  }
  return bootstrapJs || null
}

// An html document with the bootstrap injected (bytes, as stored, plus the script, carrying the
// response nonce: the CSP lets only it run).
function withBootstrap(body: Buffer, nonce: string): { body: Buffer; charset: string } | null {
  const js = bootstrap()
  if (!js) return null
  const text = body.toString('latin1') // byte offsets = string offsets
  const at = bootstrapAt(text)
  const tag = Buffer.from(`<script nonce="${nonce}">${js}</script>`, 'latin1')
  return { body: Buffer.concat([body.subarray(0, at), tag, body.subarray(at)]), charset: htmlCharset(text) }
}

export function serveContent(ses: Session) {
  ses.protocol.handle(CONTENT_SCHEME, async (req) => {
    if (req.method !== 'GET') return refuse(req.url, 'method')
    const r = routeContent(req.url, (t) => entries.get(t))
    if (!r) return refuse(req.url, 'route')
    const token = parseContentUrl(req.url)!.token
    if ('viewer' in r) {
      const body = await readFile(join(viewersDir, r.viewer)).catch(() => null)
      if (!body) return refuse(req.url, 'viewer missing')
      log('content', 'viewer', r.viewer, token.slice(0, 8))
      if (r.viewer.endsWith('.js')) return new Response(body, { headers: { ...HEADERS, 'Content-Type': 'text/javascript; charset=utf-8' } })
      const nonce = randomBytes(16).toString('base64')
      const html = body.toString('utf8').replaceAll('%NONCE%', nonce)
      return new Response(html, { headers: { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': contentCsp(policyOf(r.entry.kind)!, nonce, token) } })
    }
    // SECURITY: symlinks inside the root may point anywhere: the real path must stay inside too.
    const real = await realpath(r.file).catch(() => null)
    if (!real || !isInside(r.entry.root, real)) return refuse(req.url, 'outside root')
    const st = await stat(real).catch(() => null)
    if (!st?.isFile()) return refuse(req.url, 'not a file')
    const doc = isDocKind(r.entry.kind)
    if (doc && isDocument(real)) {
      // Documents are read whole (the bootstrap goes into them): bounded by the kind's cap, like the
      // page the tile opened (a page can't make main load a huge .html of its folder).
      const cap = policyOf(r.entry.kind)!.maxBytes
      if (cap && st.size > cap) return refuse(req.url, 'document too large')
      const body = await readFile(real).catch(() => null)
      if (!body) return refuse(req.url, 'unreadable')
      const nonce = randomBytes(16).toString('base64')
      const page = withBootstrap(body, nonce)
      if (!page) return refuse(req.url, 'bootstrap missing')
      return new Response(new Uint8Array(page.body), { headers: { ...HEADERS, 'Content-Type': `text/html; charset=${page.charset}`, 'Content-Security-Policy': documentCsp(nonce) } })
    }
    // SECURITY: every other root file (images, scripts, data, media) is streamed, never read into
    // memory whole: content choosing a multi-GB file of its folder (<img>, fetch, <video>) costs
    // main nothing but a stream.
    const body = streamFile(real)
    if (!body) return refuse(req.url, 'unreadable')
    const headers = { ...HEADERS, 'Content-Length': String(st.size) }
    if (doc) return new Response(body, { headers: { ...headers, 'Content-Type': DOC_TYPES[extname(real).toLowerCase()] ?? 'application/octet-stream', 'Content-Security-Policy': documentCsp(randomBytes(16).toString('base64')) } })
    const type = TYPES[extname(real).toLowerCase()] ?? 'application/octet-stream'
    return new Response(body, { headers: { ...headers, 'Content-Type': type, 'Content-Security-Policy': "default-src 'none'; sandbox" } })
  })
}

// A file as a web stream for a protocol Response (errors end the stream; the frame sees a failed load).
function streamFile(path: string): ReadableStream<Uint8Array> | null {
  try {
    const s = createReadStream(path)
    s.on('error', (e) => log('content', 'stream error', untrusted(path), String(e)))
    return Readable.toWeb(s) as ReadableStream<Uint8Array>
  } catch {
    return null
  }
}
