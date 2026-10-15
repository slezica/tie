// Security guards for every webContents. Threat model, research: docs/SECURITY.md.
import { app, shell, ipcMain, protocol, net, type WebContents, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { log } from './env'
import { pathToFileURL } from 'node:url'
import { isShellSender, externalUrl, sameDocument, resolveInside } from '../core/security'
import { CONTENT_SCHEME } from '../core/content'
import { contentFrameAllowed } from './content'

// The shell's own URL (file://.../index.html, or the dev server). Set before the window loads.
let shellUrl = ''
export function setShellUrl(url: string) {
  shellUrl = url
}

export function harden() {
  // Before ready: privileged schemes must be registered early.
  // SECURITY: tie-content (content tiles): `standard` (per-token origins, relative URLs) and
  // `secure` only. Never `bypassCSP`; no `corsEnabled` / `supportFetchAPI` (cross-origin reads:
  // Electron GHSA-v3j7, GHSA-j84w). Content text goes over the frame's port instead.
  protocol.registerSchemesAsPrivileged([
    { scheme: 'tie', privileges: { standard: true, secure: true, supportFetchAPI: true } },
    { scheme: CONTENT_SCHEME, privileges: { standard: true, secure: true } },
  ])
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
  // Subframes: only content tiles' own viewers (nav lock: contentFrameAllowed, content.ts).
  wc.on('will-frame-navigate', (e) => {
    if (e.isMainFrame && sameDocument(e.url, shellUrl)) return
    if (!e.isMainFrame && contentFrameAllowed(e.url, e.frame, wc.mainFrame)) return
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

// SECURITY: the shell is served from tie://app/, never file://. file:// pages get universal file
// access (fuse grantFileProtocolExtraPrivileges, on by default: turned off when packaging), so any
// script in a file:// shell could read every file on disk. tie://app serves only `root`
// (out/renderer) through resolveInside (traversal-safe); other hosts are refused.
export const SHELL_URL = 'tie://app/index.html'
export function serveShell(root: string) {
  protocol.handle('tie', async (req) => {
    const u = new URL(req.url)
    const file = u.host === 'app' ? resolveInside(root, u.pathname) : null
    if (!file) {
      log('security', 'refused', req.url)
      return new Response('not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(file).href).catch(() => new Response('not found', { status: 404 }))
  })
}
