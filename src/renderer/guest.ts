// Browser tile: a <webview> guest showing the remote web in the tile's body. The guest is its own
// webContents on the browser partition (main/guest.ts rebuilds its prefs at attach: no preload, no
// Node, sandboxed; guards its navigation, popups, downloads; matches shortcuts in its own
// before-input-event). No channel to the UI: no requests, no window.tie. Here: the element
// (never re-parented, like every tile body), title from the page, nav bar (editable location:
// core/guest locationUrl), focus, crash / hang → host error. docs/BROWSER.md.
import { tie, debug } from './state'
import { infoDialog, confirmDialog } from './dialog'
import { guestSrc, locationUrl, pageTitle, BROWSER_PARTITION } from '@core/guest'
import type { Host, OpenOpts, Surface } from './kinds'

const ICON = '🧭'

type Webview = Electron.WebviewTag

// Main's reports by guest webContents id (initGuests): a hung page; a download to confirm.
const byGuest = new Map<number, () => void>()
const titleOf = new Map<number, () => string>()
let askingDownload = false
export function initGuests() {
  tie.guest.onUnresponsive((id) => byGuest.get(id)?.())
  // SECURITY: a site started a download: nothing is saved until the user says so, here (one dialog
  // at a time; requests while it is open are dropped). Name sanitized by main, shown as text.
  tie.guest.onDownload(async (d) => {
    if (askingDownload) return debug('security', 'download request dropped (dialog open)', d.url)
    askingDownload = true
    try {
      const p = (text: string, cls = '') => Object.assign(document.createElement('p'), { textContent: text, className: cls })
      const from = titleOf.get(d.guest)?.() ?? 'A browser tile'
      const size = d.bytes ? ` (${d.bytes < 1024 * 1024 ? `${Math.ceil(d.bytes / 1024)} KB` : `${(d.bytes / 1024 / 1024).toFixed(1)} MB`})` : ''
      const ok = await confirmDialog({ cls: 'save-download', title: 'Save file?', body: [p(`${from} wants to save:`), p(`${d.name}${size}`, 'url'), p(`from ${hostOf(d.url) || d.url}`)], confirm: 'Save', arm: 600 })
      debug('guest', ok ? 'download confirmed' : 'download cancelled', d.url)
      if (ok) tie.guest.download(d.url, d.guest)
    } finally {
      askingDownload = false
    }
  })
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

export function browserKind(host: Host, opts: OpenOpts): Surface {
  const start = guestSrc(opts.url ?? 'about:blank') ?? 'about:blank'
  let wv: Webview | null = null
  let ready = false // dom-ready seen: webview methods usable
  let url = start // committed main-frame URL (or the one being loaded)
  let title = ''
  let loading = false
  let gid: number | null = null // guest webContents id
  let dead = false

  // Webview methods throw before dom-ready (and after a crash): the tile just does nothing then.
  const call = <T>(fn: (w: Webview) => T, fallback: T): T => {
    if (!wv || !ready || dead) return fallback
    try {
      return fn(wv)
    } catch {
      return fallback
    }
  }
  const changed = () => host.alive() && host.changed()

  // SECURITY: a crashed or hung page is the site failing: the guest goes away (main kills a hung
  // renderer), the failure stays visible, nothing restarts it. The user reopens the tile.
  const fail = (message: string, why: string) => {
    if (dead || !host.alive()) return
    dead = true
    if (gid !== null) (byGuest.delete(gid), titleOf.delete(gid))
    wv?.remove()
    wv = null
    debug('guest', why, host.id)
    host.error(message)
  }

  // Location field of this tile's nav bar (the empty tile focuses it).
  const locationField = () => host.body.parentElement?.querySelector<HTMLInputElement>('.navbar .location') ?? null

  const load = (u: string) => {
    url = u
    title = ''
    if (!wv || dead) return
    if (ready) wv.loadURL(u).catch(() => {}) // failures show in the guest (Chromium's error page)
    else wv.src = u
    changed()
  }

  return {
    mount: async () => {
      const el = document.createElement('webview') as Webview
      el.className = 'guest'
      // Main rebuilds prefs and drops every attribute but src at attach (guest.ts attachGuest).
      el.setAttribute('partition', BROWSER_PARTITION)
      el.setAttribute('src', start)
      el.addEventListener('dom-ready', () => {
        ready = true
        if (gid === null) {
          gid = el.getWebContentsId()
          byGuest.set(gid, () => fail('Page stopped responding', 'unresponsive'))
          titleOf.set(gid, () => `${hostOf(url) || 'A browser tile'} (${host.id})`)
        }
        changed()
      })
      el.addEventListener('did-navigate', (e) => {
        url = e.url
        title = ''
        changed()
      })
      el.addEventListener('did-navigate-in-page', (e) => {
        if (!e.isMainFrame) return
        url = e.url
        changed()
      })
      el.addEventListener('page-title-updated', (e) => {
        title = pageTitle(e.title)
        changed()
      })
      el.addEventListener('update-target-url', (e) => host.alive() && host.hint(e.url || null)) // hovered link (site text, shown as text)
      el.addEventListener('did-start-loading', () => ((loading = true), changed()))
      el.addEventListener('did-stop-loading', () => ((loading = false), changed()))
      el.addEventListener('did-fail-load', (e) => e.isMainFrame && e.errorCode !== -3 && debug('guest', 'load failed', host.id, e.errorCode, e.validatedURL))
      el.addEventListener('render-process-gone', (e) => fail('Page crashed', `crashed (${e.details?.reason ?? '?'})`))
      wv = el
      host.body.appendChild(el)
      debug('guest', 'mount', host.id, start)
    },
    resize: () => {}, // fills the body (CSS)
    dispose: () => {
      dead = true
      if (gid !== null) (byGuest.delete(gid), titleOf.delete(gid))
      wv?.remove()
      wv = null
    },
    // Keys to the page; an empty tile (nothing loaded yet) to its location field.
    focus: () => {
      if (!wv || dead) return false
      const loc = url === 'about:blank' ? locationField() : null
      if (loc) {
        loc.focus()
        loc.select()
      } else wv.focus()
      return true
    },
    title: () => title || hostOf(url) || 'browser',
    icon: () => ICON,
    nav: {
      state: () => ({
        location: url === 'about:blank' ? '' : url,
        back: call((w) => w.canGoBack(), false),
        forward: call((w) => w.canGoForward(), false),
        editable: true,
      }),
      back: () => call((w) => w.goBack(), undefined),
      forward: () => call((w) => w.goForward(), undefined),
      reload: () => call((w) => w.reload(), undefined),
      // SECURITY: typed input → http(s) only (bare host → https://), no search, no other scheme.
      // Main stops anything else too (guest.ts).
      go: (input) => {
        const u = locationUrl(input)
        if (!u) {
          debug('guest', 'refused location', host.id, input)
          return void infoDialog("Can't open", `Not a web address: ${input.trim()}\nhttp(s) addresses only (no search).`)
        }
        load(u)
      },
    },
    info: () => ({ web: { url, title, loading, ready, guest: gid, back: call((w) => w.canGoBack(), false), forward: call((w) => w.canGoForward(), false) } }),
  }
}
