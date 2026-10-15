// Security guards for every webContents. Threat model, research: docs/SECURITY.md.
import { app, shell, ipcMain, type WebContents, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { log } from './env'
import { isShellSender, externalUrl, sameDocument } from '../core/security'

// The shell's own URL (file://.../index.html, or the dev server). Set before the window loads.
let shellUrl = ''
export function setShellUrl(url: string) {
  shellUrl = url
}

export function harden() {
  app.on('web-contents-created', (_e, wc) => guard(wc))
  // SECURITY: Electron grants every permission by default (notifications, clipboard read, camera,
  // mic, geolocation, external protocol launch...). The shell needs none; content tiles get none.
  // Every session, including partitions created later for content.
  app.on('session-created', (s) => {
    s.setPermissionRequestHandler((_wc, permission, cb) => {
      log('security', 'denied permission', permission)
      cb(false)
    })
    s.setPermissionCheckHandler(() => false)
    s.setDevicePermissionHandler(() => false)
  })
}

function guard(wc: WebContents) {
  // SECURITY: the preload (`window.tie`, can spawn ptys) attaches to the main frame whatever URL it
  // shows. Any navigation away from the shell hands that power to foreign content. Only reloads of
  // the shell itself (dev HMR) pass; links, location changes, meta refresh, forms are refused.
  // `will-frame-navigate` covers the main frame and subframes; redirects are checked separately.
  wc.on('will-frame-navigate', (e) => {
    if (e.isMainFrame && sameDocument(e.url, shellUrl)) return
    log('security', 'blocked navigation', e.isMainFrame ? 'main' : 'subframe', e.url)
    e.preventDefault()
  })
  wc.on('will-redirect', (e) => {
    log('security', 'blocked redirect', e.url)
    e.preventDefault()
  })
  // SECURITY: new windows inherit the opener's webPreferences, preload included. Never open any.
  wc.setWindowOpenHandler(({ url }) => {
    log('security', 'blocked window.open', url)
    return { action: 'deny' }
  })
  // SECURITY: no <webview> guests until a tile kind needs one (then: no preload, own partition).
  wc.on('will-attach-webview', (e) => {
    log('security', 'blocked webview')
    e.preventDefault()
  })
}

// SECURITY: the only path from content to the OS's URL handlers (scheme check: externalUrl).
// Harness instances (TIE_BACKGROUND) record instead of opening.
export function openExternal(url: unknown) {
  const href = externalUrl(url)
  if (!href) return log('security', 'refused external', String(url))
  log('security', 'external open', href)
  if (!process.env.TIE_BACKGROUND) shell.openExternal(href)
}

// SECURITY: every IPC channel goes through here: handlers run only for the shell's main frame in
// the shell window. Register channels with `ipc.on` / `ipc.handle`, never `ipcMain` directly.
type Handler<E> = (e: E, ...args: any[]) => unknown
export function shellIpc(win: () => BrowserWindow | null) {
  const trusted = (e: IpcMainEvent | IpcMainInvokeEvent) => {
    const w = win()
    const f = e.senderFrame
    const ok = !!w && e.sender === w.webContents && isShellSender(f && { url: f.url, parent: f.parent }, shellUrl)
    if (!ok) log('security', 'rejected ipc from', f?.url ?? '(gone)')
    return ok
  }
  return {
    on: (channel: string, fn: Handler<IpcMainEvent>) => ipcMain.on(channel, (e, ...a) => void (trusted(e) && fn(e, ...a))),
    handle: (channel: string, fn: Handler<IpcMainInvokeEvent>) =>
      ipcMain.handle(channel, (e, ...a) => (trusted(e) ? fn(e, ...a) : Promise.reject(new Error('untrusted sender')))),
  }
}
