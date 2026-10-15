// Security guards for every webContents. Threat model, research: docs/SECURITY.md.
import { app, shell, type WebContents } from 'electron'
import { log } from './env'

// The shell's own URL (file://.../index.html, or the dev server). Set before the window loads.
let shellUrl = ''
export function setShellUrl(url: string) {
  shellUrl = url
}

const noHash = (u: string) => u.split('#')[0]

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
    if (e.isMainFrame && noHash(e.url) === noHash(shellUrl)) return
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

// SECURITY: the only path from content to the OS's URL handlers. Schemes beyond http(s) launch
// arbitrary registered apps (smb:, file:, custom handlers with argument injection): refused.
// Harness instances (TIE_BACKGROUND) record instead of opening.
const EXTERNAL_SCHEMES = new Set(['http:', 'https:'])
export function openExternal(url: unknown) {
  let u: URL | null = null
  try {
    u = new URL(String(url))
  } catch {}
  if (!u || !EXTERNAL_SCHEMES.has(u.protocol)) return log('security', 'refused external', String(url))
  log('security', 'external open', u.href)
  if (!process.env.TIE_BACKGROUND) shell.openExternal(u.href)
}
