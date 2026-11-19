// Links in file views: where a link written in a document leads. Pure, renderer-safe,
// unit-tested. Used by every file kind (fileview.ts). docs/TILES.md "File view".
import { fileKind } from './kinds'
import type { ContentKind } from './policy'

export type Link =
  | { type: 'anchor'; hash: string } // same page
  | { type: 'web'; url: string } // system browser (main re-checks)
  | { type: 'file'; path: string; hash: string; kind: ContentKind | null } // local file; kind by extension (null: decided by content, main)
  | { type: 'refused'; why: string }

// SECURITY: link hrefs come from untrusted documents. Only three kinds lead anywhere: in-page
// anchors, http(s) (main re-checks), and relative/absolute paths (no scheme, no host) resolved
// against the current file. Everything else (file:, javascript:, custom schemes, //host) is
// refused. The result is a decoded absolute path; main re-validates before opening it.
export function classifyLink(href: unknown, from: string): Link {
  if (typeof href !== 'string' || !href.trim()) return { type: 'refused', why: 'empty' }
  const h = href.trim()
  if (h.startsWith('#')) return { type: 'anchor', hash: h }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(h)?.[1].toLowerCase()
  if (scheme) {
    if (scheme !== 'http' && scheme !== 'https') return { type: 'refused', why: `scheme ${scheme}` }
    try {
      const u = new URL(h)
      return u.host ? { type: 'web', url: u.href } : { type: 'refused', why: 'no host' }
    } catch {
      return { type: 'refused', why: 'bad url' }
    }
  }
  if (h.startsWith('//') || h.startsWith('\\')) return { type: 'refused', why: 'host' }
  let path: string
  let hash: string
  try {
    const base = 'file://' + from.split('/').map(encodeURIComponent).join('/')
    const u = new URL(h, base)
    if (u.protocol !== 'file:' || u.host) return { type: 'refused', why: 'host' }
    path = decodeURIComponent(u.pathname)
    hash = u.hash
  } catch {
    return { type: 'refused', why: 'bad path' }
  }
  if (path.includes('\0')) return { type: 'refused', why: 'nul' }
  return { type: 'file', path, hash, kind: fileKind(path) }
}

// SECURITY: how the "Open in browser?" dialog shows a link: the site address (bold) apart from the
// rest, both taken from the parsed URL main will open, never by slicing the raw string
// ("https://good.com@evil.com/" would show evil.com followed by a tail naming good.com). `user`:
// text before an "@" in the address, a common disguise; shown with a warning.
export interface ExternalParts {
  origin: string
  tail: string
  user: string
}
export function externalParts(url: unknown): ExternalParts | null {
  // Same rule as main's `externalUrl` (core/security.ts, not loadable in the renderer): http(s) only.
  if (typeof url !== 'string') return null
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  return { origin: u.origin, tail: u.pathname + u.search + u.hash, user: u.username + (u.password ? ':' + u.password : '') }
}
