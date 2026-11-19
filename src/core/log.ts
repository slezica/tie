// Log line formatting shared by main (`log()`, env.ts) and the UI (`debug()` → IPC → main).
// SECURITY: log lines are read by humans and by agents. Text that didn't come from Tie's code
// (URLs and hrefs from pages, sites, documents, terminal output; file names; request bodies;
// socket params; settings strings) is wrapped as <untrusted>…</untrusted> and escaped (control
// characters, newlines, `<`, `>` → \uXXXX), so it can't forge lines, close its own tag, or carry
// terminal escapes into a reader. Wrap such values with `untrusted(v)` at the call site; everything
// else is logged as is.
export interface Untrusted {
  readonly untrusted: unknown
}
export const untrusted = (v: unknown): Untrusted => ({ untrusted: v })
export const isUntrusted = (v: unknown): v is Untrusted => typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).length === 1 && 'untrusted' in v

export const UNTRUSTED_OPEN = '<untrusted>'
export const UNTRUSTED_CLOSE = '</untrusted>'

const text = (v: unknown): string => (typeof v === 'string' ? v : (JSON.stringify(v) ?? String(v)))

// SECURITY: characters that reorder the text around them when shown (bidi marks, embeddings, overrides,
// isolates): a name or URL carrying them reads differently from what it is ("photo\u202egpj.exe").
// Source text for a character class.
export const BIDI = '\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069'

// Printable and tag-safe: control characters (C0, DEL, C1), line/paragraph separators, bidi controls
// (a value can't reorder its line in a terminal or editor), `<`, `>` and backslash-u escaped as \uXXXX
// (backslash-u so the escaping itself can't be forged).
const UNSAFE = new RegExp(`[\\x00-\\x1f\\x7f-\\x9f\\u2028\\u2029${BIDI}<>]|\\\\u`, 'g')
export function escapeUntrusted(v: unknown): string {
  return text(v).replace(UNSAFE, (c) => (c === '\\u' ? '\\u005cu' : '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')))
}

// One log argument → its text in the line.
export function formatArg(a: unknown): string {
  if (isUntrusted(a)) return UNTRUSTED_OPEN + escapeUntrusted(a.untrusted) + UNTRUSTED_CLOSE
  return text(a)
}

// The line as a human reads it: markers removed, escapes undone (harness assertions, log viewers).
export function plainLog(line: string): string {
  return line.replaceAll(UNTRUSTED_OPEN, '').replaceAll(UNTRUSTED_CLOSE, '').replace(/\\u([0-9a-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}
