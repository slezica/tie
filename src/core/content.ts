// Pure checks for the content protocol (tie-content://<token>/...). Unit-tested. Main only
// (node:path). docs/TILES.md, docs/SECURITY.md.
import { resolve, sep } from 'node:path'

export const CONTENT_SCHEME = 'tie-content'
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

// SECURITY: /_tie/ serves only the tile kind's own viewer page and script (built by Tie), by exact
// name. Anything else under /_tie/ is refused, and root files never shadow it (contentFile).
export function viewerFile(kind: string, path: string): string | null {
  if (!path.startsWith(VIEWER_DIR)) return null
  const name = path.slice(VIEWER_DIR.length)
  return name === `${kind}.html` || name === `${kind}.js` ? name : null
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

// SECURITY: content documents load nothing by default. Scripts: only the viewer's own, by a nonce
// minted per response (root files can never run as scripts, even with an injected <script>).
// Images: only from the tile's own token (no remote: tracking, LAN requests). No frames, forms,
// <base>, plugins, workers, connections.
export function contentCsp(nonce: string, token: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    `img-src ${CONTENT_SCHEME}://${token}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
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
