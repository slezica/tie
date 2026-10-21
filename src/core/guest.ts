// Browser tile (<webview> guests): the pure rules. Which URLs a guest may load, the location bar's
// input → URL, the popup gesture window, download file names. Renderer-safe, unit-tested; read by
// main (src/main/guest.ts) and the browser surface (src/renderer/guest.ts). docs/BROWSER.md.

// SECURITY: every guest runs on this one persistent partition (logins survive restarts), never the
// UI's session: it has the network (the UI's has none) and none of Tie's protocols (tie:,
// tie-content: have no handler there).
export const BROWSER_PARTITION = 'persist:browser'

const scheme = (url: string) => /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1].toLowerCase() ?? ''

// SECURITY: what a guest's frames may navigate to. Main frame: http(s) only (and about:blank, the
// empty tile). Subframes also get the inert local documents pages build frames from (about:,
// data:, blob:). Never file:, Tie's schemes (tie:, tie-content:), chrome:, devtools:, javascript:
// or anything an OS handler would take (mailto:, custom apps): refused in v1.
export function guestNavAllowed(url: string, mainFrame: boolean): boolean {
  if (typeof url !== 'string') return false
  const s = scheme(url)
  if (s === 'http' || s === 'https') {
    try {
      return !!new URL(url).host
    } catch {
      return false
    }
  }
  if (mainFrame) return url === 'about:blank'
  return s === 'about' || s === 'data' || s === 'blob'
}

// Initial src of a <webview> (attach guard) and the browser tile's start URL: http(s) with a host,
// or about:blank. Returns the normalized URL or null.
export function guestSrc(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null
  if (url === 'about:blank') return url
  const s = scheme(url)
  if (s !== 'http' && s !== 'https') return null
  try {
    const u = new URL(url)
    return u.host ? u.href : null
  } catch {
    return null
  }
}

// Location bar input → URL to load, or null (refused). http(s) URLs as typed; a bare host[:port]
// [/path] gets https:// (localhost and IPs too: http only when typed). No search (v1): input with
// spaces, or without a dot / port / localhost, is refused.
export function locationUrl(input: string): string | null {
  const t = input.trim()
  if (!t || /\s/.test(t)) return null
  if (t === 'about:blank') return t
  const s = scheme(t)
  // "localhost:3000" parses as scheme "localhost": a host with a port, not a scheme.
  if (s && !/^[a-z][a-z0-9+.-]*:\d/i.test(t)) return guestSrc(t)
  const candidate = 'https://' + t
  try {
    const u = new URL(candidate)
    const host = u.hostname
    if (!host || !(host.includes('.') || host === 'localhost' || u.port || host.startsWith('['))) return null
    return u.href
  } catch {
    return null
  }
}

// SECURITY: popups never open in Tie (a window would be a guest outside any tile). An http(s) popup
// (window.open, target=_blank) is a link out: the UI asks the user like any other (external.ts);
// anything else is blocked. Electron has no popup blocker of its own (gesture-less window.open
// reaches the handler): the dialog is the blocker, one at a time. No timing heuristics.
export function popupUrl(url: string): string | null {
  const u = guestSrc(url)
  return u && u !== 'about:blank' ? u : null
}

// SECURITY: a download's file name comes from the site. Base name only, no path separators, control
// characters, leading dots (hidden files) or trailing dots/spaces; bounded; never empty.
export function downloadName(suggested: unknown): string {
  let n = typeof suggested === 'string' ? suggested : ''
  n = n.slice(Math.max(n.lastIndexOf('/'), n.lastIndexOf('\\')) + 1)
  n = n.replace(/[\x00-\x1f\x7f:]/g, '_').replace(/^[.\s]+/, '').replace(/[.\s]+$/, '')
  if (n.length > 200) {
    const dot = n.lastIndexOf('.')
    const ext = dot > 0 && n.length - dot <= 16 ? n.slice(dot) : ''
    n = n.slice(0, 200 - ext.length) + ext
  }
  return n || 'download'
}

// First free name: "a.txt", then "a (1).txt", "a (2).txt"... `taken(name)` tells whether one exists.
export function uniqueName(name: string, taken: (n: string) => boolean): string {
  if (!taken(name)) return name
  const dot = name.lastIndexOf('.')
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  for (let i = 1; ; i++) {
    const n = `${stem} (${i})${ext}`
    if (!taken(n)) return n
  }
}

// Page titles are the site's text: shown as text only (textContent), bounded.
export const TITLE_MAX = 200
export function pageTitle(title: unknown): string {
  return typeof title === 'string' ? title.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, TITLE_MAX) : ''
}
