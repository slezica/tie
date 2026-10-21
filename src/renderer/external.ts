// Links out to the system browser: the one path from any tile (html page, file view, terminal) to
// `tie.openExternal` (main: http(s) only). docs/TILES.md "Links out".
// SECURITY: content picks the URL; the user confirms it (setting `confirmExternal`, default on): a
// dialog with the full URL, the site address in bold, a long tail (data riding on the link) called
// out, Cancel focused (Enter cancels), Open disabled for a moment (no click-through). One dialog at
// a time, app-wide: requests while one is open are dropped. Off: opened directly, logged.
import { tie, debug } from './state'
import { untrusted } from '@core/log'
import { confirmDialog } from './dialog'
import { prefs } from './prefs'

const CONFIRM_ARM_MS = 600 // Open disabled this long after the dialog appears
const LONG_LINK = 200 // characters after the site address that make a link "long"

let asking = false

// SECURITY: a document links to a file outside its own folder (`../../.ssh/id_rsa`, `/etc/hosts`):
// shown to the user only after they confirm the full path (decision 2026-10-21: same shape as links
// out; files under the document's folder open without asking). One dialog at a time, app-wide.
export async function confirmFile(path: string, from: string): Promise<boolean> {
  if (asking) {
    debug('security', 'file request dropped (dialog open)', untrusted(from), untrusted(path))
    return false
  }
  asking = true
  try {
    const p = (text: string, cls = '') => Object.assign(document.createElement('p'), { textContent: text, className: cls })
    const ok = await confirmDialog({ cls: 'open-file', title: 'Open file?', body: [p(`${from} links to a file outside its folder:`), p(path, 'url')], confirm: 'Open', arm: CONFIRM_ARM_MS })
    debug('external', ok ? 'file confirmed' : 'file cancelled', untrusted(from), untrusted(path))
    return ok
  } finally {
    asking = false
  }
}

// `from`: who asks, for the dialog's first line ("report.html wants to open:"). `note`: an extra
// line shown for long links (html: the folder the page can read).
export async function openExternal(url: string, from: string, note?: string) {
  if (!prefs.confirmExternal) {
    debug('external', 'open (no confirm)', untrusted(from), untrusted(url))
    return tie.openExternal(url)
  }
  if (asking) return debug('security', 'external request dropped (dialog open)', untrusted(from), untrusted(url))
  asking = true
  try {
    const p = (text: string, cls = '') => Object.assign(document.createElement('p'), { textContent: text, className: cls })
    let origin = ''
    try {
      origin = new URL(url).origin
    } catch {}
    const shown = p('', 'url')
    shown.append(Object.assign(document.createElement('b'), { className: 'host', textContent: origin }), url.slice(origin.length))
    const body = [p(`${from} wants to open:`), shown]
    const tail = url.length - origin.length
    if (tail > LONG_LINK) body.push(p(`Long link: ${tail} characters after the site address.${note ? ' ' + note : ''}`, 'warn'))
    const ok = await confirmDialog({ cls: 'external-open', title: 'Open in browser?', body, confirm: 'Open', arm: CONFIRM_ARM_MS })
    debug('external', ok ? 'confirmed' : 'cancelled', untrusted(from), untrusted(url))
    if (ok) tie.openExternal(url)
  } finally {
    asking = false
  }
}
