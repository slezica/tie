// Links in file views: where a link written in a document leads. Pure, renderer-safe,
// unit-tested. Used by every file kind (fileview.ts). docs/TILES.md "File view".
import { fileKind } from './kinds'
import type { ContentKind } from './policy'

export type Link =
  | { type: 'anchor'; hash: string } // same page
  | { type: 'web'; url: string } // system browser (main re-checks)
  | { type: 'file'; path: string; hash: string; kind: ContentKind | null } // local file; kind null: no viewer
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
