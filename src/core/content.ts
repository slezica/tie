// Pure checks for the content protocol (tie-content://<token>/...). Unit-tested. Main only
// (node:path). docs/TILES.md, docs/SECURITY.md.
import { resolve, sep } from 'node:path'
import { CONTENT_SCHEME, policyOf } from './policy'

export { CONTENT_SCHEME }
const VIEWER_DIR = '/_tie/'

// SECURITY: a token is the content tile's origin host and its only credential: 128 random bits,
// lowercase hex (standard schemes lowercase hosts).
export function isToken(t: unknown): t is string {
  return typeof t === 'string' && /^[0-9a-f]{32}$/.test(t)
}

// `tie-content://<token>/<path>` → parts, or null (other scheme, bad token, port, credentials).
export function parseContentUrl(url: string): { token: string; path: string } | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== `${CONTENT_SCHEME}:` || u.port || u.username || u.password || !isToken(u.hostname)) return null
  return { token: u.hostname, path: u.pathname }
}

// The page a content tile's frame loads: the kind's viewer, served by Tie (not from the root).
export function viewerUrl(token: string, kind: string): string {
  return `${CONTENT_SCHEME}://${token}${VIEWER_DIR}${kind}.html`
}

// Documents (html kind): pages a frame may show, by name.
export const isDocument = (path: string) => /\.html?$/i.test(path)

// The URL of a document (path relative to the root, as on disk) on a token: each segment encoded.
export function documentUrl(token: string, page: string): string {
  return `${CONTENT_SCHEME}://${token}/${page.split('/').map(encodeURIComponent).join('/')}`
}

// SECURITY: the nav rule (policy table): what a content frame of `kind` on `token` may load.
// 'viewer-exact': the kind's viewer page, exactly. 'within-root': an .html/.htm document of the
// token's own root (never /_tie/, never another token; main re-checks the file when serving it).
// Unknown kinds: nothing.
export function navAllowed(kind: string, token: string, url: string): boolean {
  const p = policyOf(kind)
  if (!p) return false
  if (p.nav === 'viewer-exact') return url === viewerUrl(token, kind)
  const u = parseContentUrl(url)
  return !!u && u.token === token && !u.path.startsWith(VIEWER_DIR) && u.path !== '/' && isDocument(u.path)
}

// SECURITY: /_tie/ serves only the tile kind's own viewer page and script (built by Tie), plus the
// kind's listed assets (policy table), by exact name. Anything else under /_tie/ is refused, and
// root files never shadow it (contentFile). Kinds without a policy row get nothing.
export function viewerFile(kind: string, path: string): string | null {
  const p = policyOf(kind)
  if (!p || p.page !== 'viewer' || !path.startsWith(VIEWER_DIR)) return null
  const name = path.slice(VIEWER_DIR.length)
  return name === `${kind}.html` || name === `${kind}.js` || p.assets.includes(name) ? name : null
}

// SECURITY: maps a URL path to a file strictly inside `root`, or null. Decodes once; refuses
// leftover `%` (double encoding), backslashes, NUL; checks containment after resolving. The root
// itself is refused (no index, no listing), and so is /_tie/ (viewer files). Symlinks: the caller
// re-checks with real paths (isInside).
export function contentFile(root: string, urlPath: string): string | null {
  let p: string
  try {
    p = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  if (/[%\\\0]/.test(p)) return null
  if (p === VIEWER_DIR.slice(0, -1) || p.startsWith(VIEWER_DIR)) return null
  const base = resolve(root)
  const file = resolve(base, '.' + (p.startsWith('/') ? p : '/' + p))
  return isInside(base, file) ? file : null
}

// Strict descendant (never the root itself, never a sibling sharing the prefix).
export function isInside(root: string, file: string): boolean {
  return file.startsWith(root.endsWith(sep) ? root : root + sep) && file.length > root.length + 1
}

// SECURITY: what a content request may read: the tile kind's viewer files, else a file inside its
// root. Unknown tokens (closed tiles, guesses) get nothing. The caller re-checks real paths.
export function routeContent<E extends { root: string; kind: string }>(
  url: string,
  lookup: (token: string) => E | undefined,
): { viewer: string; entry: E } | { file: string; entry: E } | null {
  const u = parseContentUrl(url)
  const entry = u && lookup(u.token)
  if (!u || !entry) return null
  const viewer = viewerFile(entry.kind, u.path)
  if (viewer) return { viewer, entry }
  const file = contentFile(entry.root, u.path)
  return file ? { file, entry } : null
}

// Where the bootstrap goes in an html document (`text`: the bytes as latin1, so offsets are byte
// offsets): right after <head ...>, else after <html ...>, else after the doctype, else at the
// start. First in <head>: it runs before any script of the page. Not a security boundary (page
// scripts share its realm); a misplaced bootstrap only breaks that page's handshake.
export function bootstrapAt(text: string): number {
  for (const re of [/<head(?:\s[^>]*)?>/i, /<html(?:\s[^>]*)?>/i, /<!doctype[^>]*>/i]) {
    const m = re.exec(text)
    if (m) return m.index + m[0].length
  }
  return text.charCodeAt(0) === 0xef && text.charCodeAt(1) === 0xbb && text.charCodeAt(2) === 0xbf ? 3 : 0 // after a UTF-8 BOM
}

// The document's declared charset (<meta charset> or http-equiv, first 1024 bytes), for the
// Content-Type header (the bootstrap may push the declaration past the parser's prescan). Only
// plain labels; default utf-8.
export function htmlCharset(text: string): string {
  const head = text.slice(0, 1024)
  const m = /<meta[^>]+charset\s*=\s*["']?\s*([a-z0-9_.:-]{1,40})/i.exec(head)
  return m ? m[1].toLowerCase() : 'utf-8'
}
