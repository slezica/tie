// Runtime spikes (docs/2026-10-16-viewers-and-browser-plan.md, P0). Dev builds only, and only for
// the spikes TIE_SPIKE lists (comma-separated; a scenario sets it with `export const env`). Packaged
// builds never read it. Hooks record facts under the `spike` log tag for dev/scenarios/spike-*.mjs;
// none of this is a design (P3 html / P4 browser build the real thing from the results).
//
// - html: root .html files of a content token served as documents (P3-like CSP), the nav lock lets
//   the token's frame load them (S1, S3).
// - nav: subframe navigation events and window.open details logged (S2, S3).
// - webview: webviewTag on; guests attach with rebuilt prefs; guest events logged (S4, S5).
import { app, type WebContents, type WebFrameMain } from 'electron'
import { extname } from 'node:path'
import { log } from './env'
import { parseContentUrl } from '../core/content'

const SPIKES = new Set(app.isPackaged ? [] : (process.env.TIE_SPIKE ?? '').split(',').filter(Boolean))
export const spike = (name: 'html' | 'nav' | 'webview') => SPIKES.has(name)

// html: what a document file of the root is served as.
const DOC_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
}
// P3-like html CSP: own origin only, inline scripts allowed (local html runs its scripts), no network.
export const SPIKE_HTML_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
export function spikeDocType(file: string): string | null {
  return spike('html') ? (DOC_TYPES[extname(file).toLowerCase()] ?? null) : null
}

// html: the token's frame may load .html files of its root (first frame binds, like viewers).
export function spikeFrameAllowed(url: string, frame: WebFrameMain | null, entry: { frame: number | null } | undefined): boolean {
  if (!spike('html') || !entry || !frame) return false
  const u = parseContentUrl(url)
  if (!u || !u.path.endsWith('.html') || u.path.startsWith('/_tie/')) return false
  entry.frame ??= frame.frameTreeNodeId
  const ok = entry.frame === frame.frameTreeNodeId
  log('spike', 'frame html', ok ? 'allowed' : 'refused', url)
  return ok
}

// nav: what main learns about subframe navigations the guards never see (shell CSP frame-src).
export function spikeNav(wc: WebContents) {
  if (!spike('nav')) return
  wc.on('did-start-navigation', (d) => !d.isMainFrame && log('spike', 'did-start-navigation', d.url))
  wc.on('did-fail-provisional-load', (_e, code, desc, url, main) => !main && log('spike', 'did-fail-provisional-load', code, desc, url))
  wc.on('did-fail-load', (_e, code, desc, url, main) => !main && log('spike', 'did-fail-load', code, desc, url))
  wc.on('did-frame-navigate', (_e, url, code, _t, main) => !main && log('spike', 'did-frame-navigate', url, code))
}
export function spikeWindowOpen(wc: WebContents, d: Electron.HandlerDetails) {
  if (spike('nav') || spike('webview')) log('spike', 'window.open', wc.getType(), JSON.stringify({ ...d, keys: Object.keys(d) }))
}

// webview: guests attach with prefs rebuilt (no preload, sandbox, isolation, one partition); main
// watches their input, popups, crashes.
const lastInput = new Map<number, number>()
let lastGuest: WebContents | null = null
export function spikeAttach(e: Electron.Event, prefs: Electron.WebPreferences, params: Record<string, string>): boolean {
  if (!spike('webview')) return false
  for (const k of Object.keys(prefs)) delete (prefs as Record<string, unknown>)[k]
  Object.assign(prefs, { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'persist:browser' })
  delete params.preload
  log('spike', 'webview attach', params.src, params.partition ?? '')
  void e
  return true
}
export function spikeGuest(guest: WebContents) {
  if (!spike('webview')) return
  lastGuest = guest
  log('spike', 'guest created', guest.id, guest.session.storagePath ?? '(memory)')
  guest.on('before-input-event', (_e, i) => log('spike', 'guest before-input-event', i.type, i.key))
  guest.on('input-event', (_e, i) => {
    lastInput.set(guest.id, Date.now())
    if (i.type !== 'mouseMove') log('spike', 'guest input-event', i.type)
  })
  guest.on('render-process-gone', (_e, d) => log('spike', 'guest render-process-gone', d.reason))
  guest.on('unresponsive', () => log('spike', 'guest unresponsive'))
  guest.on('focus', () => log('spike', 'guest focus'))
  guest.on('blur', () => log('spike', 'guest blur'))
  guest.setWindowOpenHandler((d) => {
    const t = lastInput.get(guest.id)
    log('spike', 'guest window.open', d.url, d.disposition, 'since input', t ? Date.now() - t : 'never', 'keys', Object.keys(d).join(','))
    return { action: 'deny' }
  })
}

// Dev socket method `spike {action}` (index.ts devMethods).
export function spikeMethod(params: unknown): unknown {
  const a = (params as { action?: string } | null)?.action
  const g = lastGuest && !lastGuest.isDestroyed() ? lastGuest : null
  if (a === 'guest') return g && { id: g.id, url: g.getURL(), type: g.getType(), partition: g.session.storagePath ?? null, focused: g.isFocused() }
  if (a === 'crash-guest') return void g?.forcefullyCrashRenderer()
  if (a === 'guest-key') return void g?.sendInputEvent({ type: 'keyDown', keyCode: 'K' })
  if (a === 'guest-click') {
    const { x, y } = params as { x: number; y: number }
    g?.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
    g?.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
    return
  }
  throw new Error(`spike: unknown action ${a}`)
}
