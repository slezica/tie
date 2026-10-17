// Browser tile guests (<webview>): attach guard, guest guards (navigation, redirects, popups,
// downloads, crashes), shortcuts, the browser partition. Pure rules: core/guest.ts.
// docs/BROWSER.md, docs/SECURITY.md.
import { app, session, type Session, type WebContents } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { log } from './env'
import { openExternal } from './security'
import { watchKeys } from './keys'
import { BROWSER_PARTITION, guestNavAllowed, guestSrc, popupVerdict, GESTURE_INPUTS, downloadName, uniqueName } from '../core/guest'

const guests = new Set<WebContents>()

// SECURITY: <webview> attach (will-attach-webview on the embedder). Only the shell window's page
// may embed guests (Electron sets up the tag in main frames only; content frames are sandboxed,
// preload-less and out of process). Whatever the tag asked for, the guest gets these prefs, rebuilt
// from nothing: no preload, no Node, sandboxed, isolated, no nested webviews, web security on, the
// browser partition (never the shell's session). Attributes other than src are dropped (Electron's
// internal instanceId kept); src must be http(s) or about:blank.
export function attachGuest(e: Electron.Event, prefs: Electron.WebPreferences, params: Record<string, string>, fromShell: boolean) {
  const src = guestSrc(params.src)
  if (!fromShell || !src) {
    log('security', 'blocked webview', fromShell ? 'src' : 'embedder', String(params.src ?? ''))
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
  log('guest', 'attach', src, 'prefs rebuilt', asked.join(',') || '-', 'attributes dropped', dropped.join(',') || '-')
}

// SECURITY: every guest webContents (web-contents-created, type webview).
export function guardGuest(guest: WebContents) {
  guests.add(guest)
  guest.once('destroyed', () => guests.delete(guest))
  // Navigation: main frame http(s) only (about:blank: the empty tile); subframes also about:,
  // data:, blob:. Never file:, tie:, tie-content:, chrome:, OS handlers (mailto:...).
  let refused = '' // last main-frame URL will-frame-navigate refused (did-start-navigation: no stop)
  guest.on('will-frame-navigate', (e) => {
    if (guestNavAllowed(e.url, e.isMainFrame)) return
    log('security', 'blocked guest navigation', e.isMainFrame ? 'main' : 'subframe', e.url)
    if (e.isMainFrame) refused = e.url
    e.preventDefault()
  })
  guest.on('will-redirect', (e) => {
    if (guestNavAllowed(e.url, e.isMainFrame)) return
    log('security', 'blocked guest redirect', e.url)
    e.preventDefault()
  })
  // Loads the shell starts (src, location bar, back/forward) skip will-frame-navigate. The shell
  // already checks them (core/guest locationUrl); a refused URL is still stopped here.
  // (did-start-navigation also fires, first, for navigations will-frame-navigate then refuses.)
  guest.on('did-start-navigation', (d) => {
    if (!d.isMainFrame || d.isSameDocument || guestNavAllowed(d.url, true)) return
    // Not inside the event (stopping there crashes Electron).
    setImmediate(() => {
      if (guest.isDestroyed() || refused === d.url) return
      log('security', 'stopped guest load', d.url)
      guest.stop()
    })
  })
  // Popups never open in Tie (a new window would be a new guest outside any tile). http(s) popups
  // go to the system browser only right after real input reached this guest (mouse button, key:
  // main sees it before the page does); scripts alone get nothing.
  let lastInput = 0
  guest.on('input-event', (_e, i) => {
    if (GESTURE_INPUTS.has(i.type)) lastInput = Date.now()
  })
  guest.setWindowOpenHandler((d) => {
    const since = lastInput ? Date.now() - lastInput : null
    if (popupVerdict(d.url, since) === 'external') openExternal(d.url)
    else log('security', 'blocked popup', d.url, 'since input', since ?? 'never')
    return { action: 'deny' }
  })
  // Shortcuts: the guest's own before-input-event (the window's never sees keys typed in a guest).
  watchKeys(guest)
  guest.on('render-process-gone', (_e, d) => log('guest', 'gone', guest.id, d.reason))
  // Hung page: the shell shows an error and drops the guest; its renderer is killed (a stuck
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

// The browser partition: downloads saved, never opened; Electron's name out of the user agent
// (sites refuse or degrade "Electron" browsers). Permissions: denied (harden, every session).
export function initBrowserSession(): Session {
  const ses = session.fromPartition(BROWSER_PARTITION)
  ses.setUserAgent(ses.getUserAgent().replace(/ (Electron|Tie)\/\S+/g, ''))
  const reserved = new Set<string>()
  // SECURITY: no save dialog, no opening: the file lands under a sanitized, unique name in the
  // downloads folder and stays there. The site picks neither the folder nor what runs it.
  ses.on('will-download', (_e, item) => {
    const dir = downloadsDir()
    const name = uniqueName(downloadName(item.getFilename()), (n) => reserved.has(join(dir, n)) || existsSync(join(dir, n)))
    const path = join(dir, name)
    reserved.add(path)
    item.setSavePath(path)
    log('guest', 'download', item.getURL(), '→', path)
    item.once('done', (_e2, state) => {
      reserved.delete(path)
      log('guest', 'download', state, path)
    })
  })
  return ses
}

// SECURITY: the shell's session never downloads (content frames lack allow-downloads; this is the
// second layer).
export function noDownloads(ses: Session) {
  ses.on('will-download', (e, item) => {
    log('security', 'blocked download', item.getURL())
    e.preventDefault()
  })
}

// Dev socket method `guest {action}` (harness): `list`; `crash`, `key`, `click` on guest `id`;
// `proxy {url}`: how the shell's and the browser's sessions reach a URL.
export async function guestMethod(params: unknown, shell: Session | null): Promise<unknown> {
  const p = (params ?? {}) as { action?: string; id?: number; x?: number; y?: number; keyCode?: string; modifiers?: string[]; url?: string }
  if (p.action === 'list') return [...guests].map((g) => ({ id: g.id, url: g.getURL(), partition: g.session.storagePath ?? null, focused: g.isFocused(), crashed: g.isCrashed(), userAgent: g.getUserAgent() }))
  if (p.action === 'proxy') {
    const url = String(p.url)
    return { shell: shell ? await shell.resolveProxy(url) : null, browser: await session.fromPartition(BROWSER_PARTITION).resolveProxy(url) }
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
