// Content protocol: tie-content://<token>/ serves one content tile (sandboxed frame, opaque origin).
// Token → root registry, viewer files, root files. docs/TILES.md, docs/SECURITY.md.
import { app, protocol, type WebFrameMain } from 'electron'
import { randomBytes } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { realpathSync, statSync } from 'node:fs'
import { extname, isAbsolute, join } from 'node:path'
import { log } from './env'
import { CONTENT_SCHEME, routeContent, isInside, contentCsp, viewerUrl, parseContentUrl } from '../core/content'

interface Entry {
  root: string // real path
  kind: string // viewer name
  frame: number | null // frameTreeNodeId of the one frame that may show it (bound on first load)
}

const entries = new Map<string, Entry>()

// Kinds with a viewer (out/viewers/<kind>.html|js). The probe is a harness kind: dev builds only.
const VIEWERS = new Set(app.isPackaged ? ['markdown'] : ['markdown', 'probe'])
const viewersDir = join(import.meta.dirname, '../viewers')

const TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
}

// SECURITY: the shell (trusted) names the root; still checked: absolute, existing directory, real
// path (symlinked roots resolve once, here). Returns the frame URL, never file paths.
export function openContent(root: unknown, kind: unknown): { token: string; url: string } | { error: string } {
  if (typeof kind !== 'string' || !VIEWERS.has(kind)) return { error: `unknown kind: ${String(kind)}` }
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
  entries.set(token, { root: real, kind, frame: null })
  log('content', 'open', kind, token.slice(0, 8), real)
  return { token, url: viewerUrl(token, kind) }
}

export function closeContent(token: unknown) {
  if (typeof token === 'string' && entries.delete(token)) log('content', 'close', token.slice(0, 8))
}

// SECURITY: a content frame that stopped answering (frame.ts watchdog) keeps spinning in its
// renderer even after the shell removes it (a stuck thread never handles the shutdown). Kill its
// process, but only if that process holds nothing else: never the shell's, never one shared with
// another frame. Then forget the token.
export function killContent(token: unknown, shell: WebFrameMain | null) {
  const e = typeof token === 'string' ? entries.get(token) : undefined
  if (e && e.frame !== null && shell) {
    const frames = shell.framesInSubtree
    const f = frames.find((x) => x.frameTreeNodeId === e.frame)
    const pid = f?.osProcessId
    if (f && pid && pid !== shell.osProcessId && pid !== process.pid && frames.every((x) => x === f || x.osProcessId !== pid)) {
      try {
        process.kill(pid, 'SIGKILL')
        log('content', 'killed', (token as string).slice(0, 8), pid)
      } catch {}
    } else log('content', 'not killed (shared or gone)', (token as string).slice(0, 8), pid)
  }
  closeContent(token)
}

// Shell reloaded: its content tiles are gone.
export function clearContent() {
  entries.clear()
}

// SECURITY: frame nav lock (with will-frame-navigate, security.ts). A subframe may load only the
// exact viewer URL of a registered token, as a direct child of the shell, and each token binds to
// the first frame that loads it: content can't navigate itself elsewhere (meta refresh, location,
// links, drops) or into another tile's viewer. So the shell's port handshake (targetOrigin '*' to
// an opaque origin) always reaches the tile's own viewer.
export function contentFrameAllowed(url: string, frame: WebFrameMain | null, shellFrame: WebFrameMain): boolean {
  const u = parseContentUrl(url)
  const e = u && entries.get(u.token)
  if (!u || !e || url !== viewerUrl(u.token, e.kind) || !frame || frame.parent !== shellFrame) return false
  e.frame ??= frame.frameTreeNodeId
  return e.frame === frame.frameTreeNodeId
}

const refuse = (url: string, why: string) => {
  log('security', 'refused content', why, url)
  return new Response('not found', { status: 404 })
}

// SECURITY: content responses never sniff, never cache; root files are inert if ever opened as a
// document (CSP sandbox, nothing loads). Viewer pages get contentCsp with a fresh nonce each time.
// Files are read here (no net.fetch: no redirects, no file:// URL handling).
const HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }

export function serveContent() {
  protocol.handle(CONTENT_SCHEME, async (req) => {
    if (req.method !== 'GET') return refuse(req.url, 'method')
    const r = routeContent(req.url, (t) => entries.get(t))
    if (!r) return refuse(req.url, 'route')
    const token = parseContentUrl(req.url)!.token
    if ('viewer' in r) {
      const body = await readFile(join(viewersDir, r.viewer)).catch(() => null)
      if (!body) return refuse(req.url, 'viewer missing')
      if (r.viewer.endsWith('.js')) return new Response(body, { headers: { ...HEADERS, 'Content-Type': 'text/javascript; charset=utf-8' } })
      const nonce = randomBytes(16).toString('base64')
      const html = body.toString('utf8').replaceAll('%NONCE%', nonce)
      return new Response(html, { headers: { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': contentCsp(nonce, token) } })
    }
    // SECURITY: symlinks inside the root may point anywhere: the real path must stay inside too.
    const real = await realpath(r.file).catch(() => null)
    if (!real || !isInside(r.entry.root, real)) return refuse(req.url, 'outside root')
    const st = await stat(real).catch(() => null)
    if (!st?.isFile()) return refuse(req.url, 'not a file')
    const body = await readFile(real).catch(() => null)
    if (!body) return refuse(req.url, 'unreadable')
    const type = TYPES[extname(real).toLowerCase()] ?? 'application/octet-stream'
    return new Response(body, { headers: { ...HEADERS, 'Content-Type': type, 'Content-Security-Policy': "default-src 'none'; sandbox" } })
  })
}
