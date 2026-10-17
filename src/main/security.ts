// Security guards for every webContents. Threat model, research: docs/SECURITY.md.
import { app, shell, ipcMain, protocol, net, type Session, type WebContents, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { log } from './env'
import { pathToFileURL } from 'node:url'
import { isShellSender, externalUrl, sameDocument, resolveInside } from '../core/security'
import { CONTENT_SCHEME } from '../core/content'
import { contentFrameAllowed } from './content'
import { spike, spikeNav, spikeWindowOpen, spikeAttach, spikeGuest } from './spike'

// The shell's own URL (file://.../index.html, or the dev server). Set before the window loads.
let shellUrl = ''
export function setShellUrl(url: string) {
  shellUrl = url
}

export function harden() {
  // Before ready: privileged schemes must be registered early.
  // SECURITY: tie-content (content tiles): `standard` (per-token origins, relative URLs), `secure`,
  // `supportFetchAPI` (html documents fetch files of their own folder, same origin). Never
  // `bypassCSP`, never `corsEnabled` (cross-origin reads: Electron GHSA-v3j7, GHSA-j84w): another
  // token's files stay unreadable, and opaque viewer frames still can't fetch (sec-html).
  protocol.registerSchemesAsPrivileged([
    { scheme: 'tie', privileges: { standard: true, secure: true, supportFetchAPI: true } },
    { scheme: CONTENT_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
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
  // Spike (dev, TIE_SPIKE=webview): guests navigate http(s) only; their popups: spikeGuest.
  if (spike('webview') && wc.getType() === 'webview') {
    wc.on('will-frame-navigate', (e) => {
      const ok = /^https?:/.test(e.url)
      log('spike', 'guest will-frame-navigate', e.isMainFrame ? 'main' : 'subframe', ok ? 'allowed' : 'blocked', e.url)
      if (!ok) e.preventDefault()
    })
    return
  }
  spikeNav(wc)
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
  wc.setWindowOpenHandler((d) => {
    spikeWindowOpen(wc, d)
    log('security', 'blocked window.open', d.url)
    return { action: 'deny' }
  })
  // SECURITY: no <webview> guests until a tile kind needs one (then: no preload, own partition).
  wc.on('will-attach-webview', (e, prefs, params) => {
    if (spikeAttach(e, prefs, params)) return
    log('security', 'blocked webview')
    e.preventDefault()
  })
  wc.on('did-attach-webview', (_e, guest) => spikeGuest(guest))
}

// SECURITY: the shell window runs on its own in-memory session (SHELL_PARTITION: no `persist:`
// prefix): whatever content stores (html pages: localStorage, IndexedDB, Cache Storage under their
// token origins) lives in memory only and is gone when Tie quits. Chromium's data removal skips
// custom schemes, so clearing on close isn't possible; never writing is (sec-storage). Protocols
// (tie, tie-content), the no-network guard and permissions all apply to this session.
export const SHELL_PARTITION = 'tie-shell'

// SECURITY: the shell's session (the shell and every content frame) needs no network: Tie's own
// pages come from tie:// and tie-content://, which no proxy touches. CSPs keep content off the
// network, but WebRTC isn't covered by any CSP directive Chromium enforces (STUN over UDP, TURN over
// TCP reached local probes from an html page: sec-html). So: WebRTC may not use UDP unless
// proxied, and everything proxied (loopback included) goes to a closed local port: no connection
// leaves. External links go through the OS (openExternal), not this session. The browser tile (P4)
// gets its own partition.
// Dev server mode (`tie-dev run --hot`): the shell itself loads from the dev server, so exactly
// that host:port is exempt (dev builds only; every other loopback address stays dead).
export const DEAD_PROXY = '127.0.0.1:1'
export async function noNetwork(ses: Session, devServer?: string) {
  const exempt = devServer ? new URL(devServer).host : ''
  await ses.setProxy({ mode: 'fixed_servers', proxyRules: `http=${DEAD_PROXY};https=${DEAD_PROXY};socks=${DEAD_PROXY}`, proxyBypassRules: `<-loopback>;${exempt}` })
}
export function noWebRtcUdp(wc: WebContents) {
  wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
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
export function serveShell(ses: Session, root: string) {
  ses.protocol.handle('tie', async (req) => {
    const u = new URL(req.url)
    const file = u.host === 'app' ? resolveInside(root, u.pathname) : null
    if (!file) {
      log('security', 'refused', req.url)
      return new Response('not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(file).href).catch(() => new Response('not found', { status: 404 }))
  })
}
