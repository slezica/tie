// Browser tile guests (<webview>): attach guard, guest guards (navigation, redirects, popups,
// downloads, crashes), shortcuts, the browser partition. Pure rules: core/guest.ts.
// docs/BROWSER.md, docs/SECURITY.md.
import { app, session, type Session, type WebContents } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { log } from './env'
import { untrusted } from '../core/log'
import { watchKeys } from './keys'
import { BROWSER_PARTITION, guestNavAllowed, guestSrc, popupUrl, downloadName, uniqueName } from '../core/guest'

const guests = new Set<WebContents>()
// SECURITY: device choosers. Web Bluetooth: Electron picks the first device found unless the event
// is prevented (a page could pair with whatever is nearby after one click). Cancelled here, for
// guests and the UI window alike. USB / HID / serial go through setDevicePermissionHandler
// (harden(): denied).
export function noDeviceChoosers(wc: WebContents) {
  wc.on('select-bluetooth-device', (e, _devices, cb) => {
    e.preventDefault()
    log('security', 'cancelled bluetooth chooser', untrusted(wc.getURL()))
    cb('')
  })
}

// SECURITY: <webview> attach (will-attach-webview on the embedder). Only the UI window's page
// may embed guests (Electron sets up the tag in main frames only; content frames are sandboxed,
// preload-less and out of process). Whatever the tag asked for, the guest gets these prefs, rebuilt
// from nothing: no preload, no Node, sandboxed, isolated, no nested webviews, web security on, the
// browser partition (never the UI's session). Attributes other than src are dropped (Electron's
// internal instanceId kept); src must be http(s) or about:blank.
export function attachGuest(e: Electron.Event, prefs: Electron.WebPreferences, params: Record<string, string>, fromUi: boolean) {
  const src = guestSrc(params.src)
  if (!fromUi || !src) {
    log('security', 'blocked webview', fromUi ? 'src' : 'embedder', untrusted(String(params.src ?? '')))
    return e.preventDefault()
  }
  const asked = Object.keys(prefs).filter((k) => k !== 'offscreen')
  const offscreen = prefs.offscreen // harness (TIE_BACKGROUND): inherited from the window
  for (const k of Object.keys(prefs)) delete (prefs as Record<string, unknown>)[k]
  Object.assign(prefs, {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    nodeIntegrationInWorker: false,
    webviewTag: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    navigateOnDragDrop: false,
    safeDialogs: true,
    partition: BROWSER_PARTITION,
    ...(offscreen ? { offscreen } : {}),
  } satisfies Electron.WebPreferences)
  const dropped = Object.keys(params).filter((k) => k !== 'src' && k !== 'instanceId') // instanceId: Electron's own (the element)
  for (const k of dropped) delete params[k]
  params.src = src
  log('guest', 'attach', untrusted(src), 'prefs rebuilt', untrusted(asked.join(',') || '-'), 'attributes dropped', untrusted(dropped.join(',') || '-'))
}

// SECURITY: every guest webContents (web-contents-created, type webview).
// Main → UI: a guest's popup to confirm (`guest:popup`).
export interface PopupAsk {
  guest: number
  url: string
}
let popup: (p: PopupAsk) => void = () => {}
export function onPopup(fn: (p: PopupAsk) => void) {
  popup = fn
}

export function guardGuest(guest: WebContents) {
  guests.add(guest)
  guest.once('destroyed', () => guests.delete(guest))
  // Navigation: main frame http(s) only (about:blank: the empty tile); subframes also about:,
  // data:, blob:. Never file:, tie:, tie-content:, chrome:, OS handlers (mailto:...).
  let refused = '' // last main-frame URL will-frame-navigate refused (did-start-navigation: no stop)
  guest.on('will-frame-navigate', (e) => {
    if (guestNavAllowed(e.url, e.isMainFrame)) return
    log('security', 'blocked guest navigation', e.isMainFrame ? 'main' : 'subframe', untrusted(e.url))
    if (e.isMainFrame) refused = e.url
    e.preventDefault()
  })
  guest.on('will-redirect', (e) => {
    if (guestNavAllowed(e.url, e.isMainFrame)) return
    log('security', 'blocked guest redirect', untrusted(e.url))
    e.preventDefault()
  })
  // Loads the UI starts (src, location bar, back/forward) skip will-frame-navigate. The UI
  // already checks them (core/guest locationUrl); a refused URL is still stopped here.
  // (did-start-navigation also fires, first, for navigations will-frame-navigate then refuses.)
  guest.on('did-start-navigation', (d) => {
    if (!d.isMainFrame || d.isSameDocument || guestNavAllowed(d.url, true)) return
    // Not inside the event (stopping there crashes Electron).
    setImmediate(() => {
      if (guest.isDestroyed() || refused === d.url) return
      log('security', 'stopped guest load', untrusted(d.url))
      guest.stop()
    })
  })
  // SECURITY: popups never open in Tie (a new window would be a new guest outside any tile). An
  // http(s) popup is handed to the UI as a link out: the user confirms it (external.ts), like links
  // from files and terminals; a script's gesture-less window.open gets the same dialog (Electron
  // has no popup blocker; the UI shows one dialog at a time). Anything else: blocked + logged.
  guest.setWindowOpenHandler((d) => {
    const url = popupUrl(d.url)
    if (url) {
      log('guest', 'popup asks', untrusted(url))
      popup({ guest: guest.id, url })
    } else log('security', 'blocked popup', untrusted(d.url))
    return { action: 'deny' }
  })
  noDeviceChoosers(guest)
  // Shortcuts: the guest's own before-input-event (the window's never sees keys typed in a guest).
  watchKeys(guest)
  guest.on('render-process-gone', (_e, d) => log('guest', 'gone', guest.id, d.reason))
  // Hung page: the UI shows an error and drops the guest; its renderer is killed (a stuck
  // thread never exits by itself). Same-site guests sharing that process crash too.
  guest.on('unresponsive', () => {
    log('guest', 'unresponsive', guest.id)
    if (!guest.hostWebContents?.isDestroyed()) guest.hostWebContents?.send('guest:unresponsive', guest.id)
    guest.forcefullyCrashRenderer()
  })
}

// Downloads: ~/Downloads (dev builds: TIE_DOWNLOADS, set by the harness so tests never touch the
// real folder). Packaged builds never read the variable.
function downloadsDir(): string {
  const dir = !app.isPackaged && process.env.TIE_DOWNLOADS ? process.env.TIE_DOWNLOADS : app.getPath('downloads')
  mkdirSync(dir, { recursive: true })
  return dir
}

// A download the UI should ask the user about (main → UI `guest:download`).
export interface DownloadAsk {
  guest: number // guest webContents id (the tile)
  url: string
  name: string // sanitized file name
  bytes: number // total, or 0 if unknown
}

// SECURITY: a download starts only after the user said yes to it, every time (decision
// 2026-10-21: no input-timer heuristics). `will-download` can't wait for an answer, so the first
// request is refused and the UI asked; on Save, the URL is allowed once and the guest asked to
// download it again. Allowances expire unused.
const allowed = new Map<string, ReturnType<typeof setTimeout>>()
const ALLOW_MS = 60_000
export function allowDownload(url: unknown, guestId: unknown) {
  if (typeof url !== 'string') return
  const g = [...guests].find((x) => x.id === guestId)
  if (!g || g.isDestroyed()) return log('security', 'download allowed for a gone guest', untrusted(url))
  clearTimeout(allowed.get(url))
  allowed.set(url, setTimeout(() => allowed.delete(url), ALLOW_MS))
  log('guest', 'download allowed', untrusted(url))
  g.downloadURL(url)
}

// The browser partition: downloads asked and saved, never opened; Electron's name out of the user
// agent (sites refuse or degrade "Electron" browsers). Permissions: denied (harden, every session).
export function initBrowserSession(ask: (d: DownloadAsk) => void): Session {
  const ses = session.fromPartition(BROWSER_PARTITION)
  ses.setUserAgent(ses.getUserAgent().replace(/ (Electron|Tie)\/\S+/g, ''))
  const reserved = new Set<string>()
  // SECURITY: no save dialog, no opening: the file lands under a sanitized, unique name in the
  // downloads folder and stays there. The site picks neither the folder nor what runs it. And only
  // after the user confirmed this very download (allowDownload).
  ses.on('will-download', (e, item, wc) => {
    const url = item.getURL()
    const t = allowed.get(url)
    if (!t) {
      e.preventDefault()
      log('guest', 'download asks', untrusted(url))
      return ask({ guest: wc.id, url, name: downloadName(item.getFilename()), bytes: Math.max(0, item.getTotalBytes()) })
    }
    clearTimeout(t)
    allowed.delete(url)
    const dir = downloadsDir()
    const name = uniqueName(downloadName(item.getFilename()), (n) => reserved.has(join(dir, n)) || existsSync(join(dir, n)))
    const path = join(dir, name)
    reserved.add(path)
    item.setSavePath(path)
    log('guest', 'download', untrusted(item.getURL()), '→', untrusted(path))
    item.once('done', (_e2, state) => {
      reserved.delete(path)
      log('guest', 'download', state, untrusted(path))
    })
  })
  return ses
}

// SECURITY: the UI's session never downloads (content frames lack allow-downloads; this is the
// second layer).
export function noDownloads(ses: Session) {
  ses.on('will-download', (e, item) => {
    log('security', 'blocked download', untrusted(item.getURL()))
    e.preventDefault()
  })
}

// Dev socket method `guest {action}` (harness): `list`; `crash`, `key`, `click` on guest `id`;
// `proxy {url}`: how the UI's and the browser's sessions reach a URL.
export async function guestMethod(params: unknown, ui: Session | null): Promise<unknown> {
  const p = (params ?? {}) as { action?: string; id?: number; x?: number; y?: number; keyCode?: string; modifiers?: string[]; url?: string }
  if (p.action === 'list') return [...guests].map((g) => ({ id: g.id, url: g.getURL(), partition: g.session.storagePath ?? null, focused: g.isFocused(), crashed: g.isCrashed(), userAgent: g.getUserAgent() }))
  if (p.action === 'proxy') {
    const url = String(p.url)
    return { ui: ui ? await ui.resolveProxy(url) : null, browser: await session.fromPartition(BROWSER_PARTITION).resolveProxy(url) }
  }
  const g = [...guests].find((x) => x.id === p.id)
  if (!g) throw new Error(`no guest ${p.id}`)
  if (p.action === 'crash') return void g.forcefullyCrashRenderer()
  if (p.action === 'key') {
    const mods = (p.modifiers ?? []) as Electron.KeyboardInputEvent['modifiers']
    g.sendInputEvent({ type: 'keyDown', keyCode: String(p.keyCode), modifiers: mods })
    g.sendInputEvent({ type: 'keyUp', keyCode: String(p.keyCode), modifiers: mods })
    return
  }
  if (p.action === 'click') {
    g.sendInputEvent({ type: 'mouseDown', x: Number(p.x), y: Number(p.y), button: 'left', clickCount: 1 })
    g.sendInputEvent({ type: 'mouseUp', x: Number(p.x), y: Number(p.y), button: 'left', clickCount: 1 })
    return
  }
  throw new Error(`guest: unknown action ${p.action}`)
}
