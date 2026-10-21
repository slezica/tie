// Browser tile (<webview> guests): the pure rules. Which URLs a guest may load, the location bar's
// input → URL, the popup gesture window, download file names. Renderer-safe, unit-tested; read by
// main (src/main/guest.ts) and the browser surface (src/renderer/guest.ts). docs/BROWSER.md.

// SECURITY: every guest runs on this one persistent partition (logins survive restarts), never the
// UI's session: it has the network (the UI's has none) and none of Tie's protocols (tie:,
// tie-content: have no handler there).
export const BROWSER_PARTITION = 'persist:browser'

// A popup (window.open, target=_blank) goes to the system browser only this soon after real input
// (mouse button, key) reached that guest; else it is blocked (scripts can't open windows alone).
export const POPUP_INPUT_MS = 1000

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

// SECURITY: popups never open in Tie. A gesture-backed http(s) popup goes to the system browser;
// anything else is blocked. `sinceInput`: ms since real input reached that guest (null: never).
export function popupVerdict(url: string, sinceInput: number | null): 'external' | 'blocked' {
  if (!guestSrc(url) || url === 'about:blank') return 'blocked'
  return sinceInput !== null && sinceInput >= 0 && sinceInput <= POPUP_INPUT_MS ? 'external' : 'blocked'
}

// SECURITY: a download saves a file the site chose (name sanitized) into the downloads folder with
// no dialog. Only after real input reached that guest (within this window: pages often start a
// download a few seconds after the click that asked for it); a script alone plants nothing.
export const DOWNLOAD_INPUT_MS = 10_000
export function downloadVerdict(sinceInput: number | null): 'saved' | 'blocked' {
  return sinceInput !== null && sinceInput >= 0 && sinceInput <= DOWNLOAD_INPUT_MS ? 'saved' : 'blocked'
}

// Input events (Electron's input-event types) that count as the user acting in a guest.
export const GESTURE_INPUTS: ReadonlySet<string> = new Set(['mouseDown', 'mouseUp', 'keyDown', 'rawKeyDown', 'char', 'touchStart', 'touchEnd', 'gestureTap'])

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
