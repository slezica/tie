// Files → content kinds: which kind shows a file (by extension), and the sniff rule for files
// without one (text or binary). Pure, renderer-safe, unit-tested. docs/TILES.md "Kinds".
import type { ContentKind } from './policy'

// Kinds that show a local file, by lowercase extension.
const BY_EXT: Record<string, ContentKind> = {
  '.md': 'markdown',
  '.markdown': 'markdown',
}

// '.md' (lowercase), or '' when the name has none (dotfiles count as none).
export function extOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot).toLowerCase() : ''
}

// The kind showing `path`, by extension; null: no viewer (yet; P2 routes those by sniff).
export function fileKind(path: string): ContentKind | null {
  const ext = extOf(path)
  return Object.hasOwn(BY_EXT, ext) ? BY_EXT[ext] : null
}

// Extensions of a kind (file picker filters).
export function extsOf(kind: string): string[] {
  return Object.keys(BY_EXT).filter((e) => BY_EXT[e] === kind)
}

export function noViewer(path: string): string {
  const ext = extOf(path)
  return ext ? `No viewer for ${ext}` : `No viewer for "${path.slice(path.lastIndexOf('/') + 1)}"`
}

// Sniff rule for files without a kind (decided 2026-10-16; routed in P2): the first SNIFF_BYTES
// are UTF-8 without NUL → text, else binary. `size`: the whole file's; when the sample is only a
// prefix, a multi-byte sequence cut at its end still counts as text.
export const SNIFF_BYTES = 8192
export function sniff(sample: Uint8Array, size = sample.length): 'text' | 'binary' {
  const head = sample.subarray(0, SNIFF_BYTES)
  if (head.includes(0)) return 'binary'
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(head, { stream: head.length < size })
    return 'text'
  } catch {
    return 'binary'
  }
}
