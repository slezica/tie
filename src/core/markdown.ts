// Markdown files: which files have a viewer, link targets, task toggles. Pure, renderer-safe,
// unit-tested. docs/MARKDOWN.md.

export const MARKDOWN_EXTS = ['.md', '.markdown']

// '.md' (lowercase), or '' when the name has none (dotfiles count as none).
export function extOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot).toLowerCase() : ''
}

export function viewerFor(path: string): 'markdown' | null {
  return MARKDOWN_EXTS.includes(extOf(path)) ? 'markdown' : null
}

export function noViewer(path: string): string {
  const ext = extOf(path)
  return ext ? `No viewer for ${ext}` : `No viewer for "${path.slice(path.lastIndexOf('/') + 1)}"`
}

export type Link =
  | { type: 'anchor'; hash: string } // same page
  | { type: 'external'; url: string } // system browser
  | { type: 'markdown'; path: string; hash: string } // in Tie
  | { type: 'file'; path: string } // other local file: no viewer yet
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
      return u.host ? { type: 'external', url: u.href } : { type: 'refused', why: 'no host' }
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
  return viewerFor(path) ? { type: 'markdown', path, hash } : { type: 'file', path }
}

// A list item (`-`, `*`, `+`, `1.`, `1)`; maybe in a blockquote) starting with a task box.
const TASK = /^(\s*(?:>\s*)*(?:[-*+]|\d{1,9}[.)])\s+\[)([ xX])(\](?:\s|$))/

export function toggleTaskLine(line: string): string | null {
  const m = TASK.exec(line)
  if (!m) return null
  return m[1] + (m[2] === ' ' ? 'x' : ' ') + line.slice(m[1].length + 1)
}

// SECURITY: a toggle from the viewer names the line and the text it saw there. It applies only if
// that line still holds exactly that text and is a task item: never a write to a line the viewer
// didn't show (the file may have changed since). Lines split on \n (a \r stays in the line).
export function applyToggle(text: string, line: number, expected: string): { text: string } | { error: string } {
  const lines = text.split('\n')
  if (!Number.isInteger(line) || line < 0 || line >= lines.length) return { error: 'no such line' }
  if (lines[line] !== expected) return { error: 'line changed' }
  const toggled = toggleTaskLine(lines[line])
  if (toggled === null) return { error: 'not a task' }
  lines[line] = toggled
  return { text: lines.join('\n') }
}
