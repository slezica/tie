// Files → content kinds: which kind shows a file. By extension first (markdown, image, html); every other
// file by content (sniff: text or hex). Which kinds a file may be opened as on request (templates).
// Pure, renderer-safe, unit-tested. docs/TILES.md "Kinds", docs/VIEWERS.md.
import type { ContentKind } from './policy'

// Kinds that show a local file (policy rows with a file). Probe is not one.
export const FILE_KINDS: readonly ContentKind[] = ['markdown', 'text', 'image', 'hex', 'html']
export const isFileKind = (k: unknown): k is ContentKind => typeof k === 'string' && (FILE_KINDS as readonly string[]).includes(k)

// Kinds decided by extension (lowercase). Everything else: by content (sniffKind).
const BY_EXT: Record<string, ContentKind> = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.avif': 'image',
  '.svg': 'image',
  '.ico': 'image',
  '.bmp': 'image',
  '.html': 'html',
  '.htm': 'html',
}

// '.md' (lowercase), or '' when the name has none (dotfiles count as none).
export function extOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot).toLowerCase() : ''
}

// The kind showing `path` by its extension; null: decided by content (sniffKind).
export function fileKind(path: string): ContentKind | null {
  const ext = extOf(path)
  return Object.hasOwn(BY_EXT, ext) ? BY_EXT[ext] : null
}

// Sniff rule (decided 2026-10-16): the first SNIFF_BYTES are UTF-8 without NUL → text, else binary.
// `size`: the whole file's; when the sample is only a prefix, a multi-byte sequence cut at its end
// still counts as text.
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

// Files without a kind by extension: text or hex, by content.
export const sniffKind = (sample: Uint8Array, size?: number): ContentKind => (sniff(sample, size) === 'text' ? 'text' : 'hex')

// May a file whose own kind is `own` (and whose content sniffs as text or not) be opened as `want`?
// Its own kind; hex for any file (bytes); text for any file that sniffs as text (e.g. markdown
// source). Nothing else: an image tile never gets a text file, and so on.
export function canOpenAs(want: ContentKind, own: ContentKind, textLike: boolean): boolean {
  return want === own || want === 'hex' || (want === 'text' && textLike)
}
