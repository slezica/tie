// Html kind: a local .html file is the page. Its scripts run (decision 2026-10-16), isolated: own
// content frame on its own token origin (sandbox allow-scripts allow-same-origin), document CSP (no
// network), nav lock within its folder, storage in memory only (the shell's session). Main injects the bootstrap
// (src/viewers/html-bootstrap.ts): handshake, pong, link clicks and window.open → followLink.
// Here: routing those requests, history (host-driven and the page's own navigations, reported by
// main), live reload on folder changes, nav bar. docs/VIEWERS.md "Html".
import { tie, debug, spaceOf, withSpace, type Kind } from '../state'
import { frameSurface } from '../frame'
import { openTile, besidePlacement } from '../ops'
import { infoDialog, confirmDialog } from '../dialog'
import { dirOf } from '../fileview'
import { classifyLink } from '@core/links'
import { pageTitle } from '@core/guest'
import type { Host, OpenOpts, Surface } from '.'

const ICON = '🌐'
const RELOAD_MS = 100 // folder change → reload (main already debounced)
const NEW_TILE_MS = 1000 // at most one tile opened per this, per html tile (scripts can call window.open)
const CONFIRM_ARM_MS = 600 // the confirm dialog's Open button is disabled this long after it appears
const LONG_LINK = 200 // characters after the site address that make a link "long" (data riding on it)

const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1)
const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/')

export function htmlKind(host: Host, opts: OpenOpts): Surface {
  let path = opts.path ?? '' // page shown (absolute)
  let root = dirOf(path) // frame's folder (token)
  const history = { list: [] as string[], index: -1 }
  let ready = false
  let reloads = 0
  let asking = false // confirm dialog open: further external requests dropped
  let lastNewTile = 0
  let reloadTimer: ReturnType<typeof setTimeout> | null = null
  let docTitle = '' // the page's <title> (bootstrap request): untrusted text, bounded

  const inRoot = (p: string) => p.startsWith(root === '/' ? '/' : root + '/')
  const rel = (p: string) => p.slice(root === '/' ? 1 : root.length + 1)

  const frame = frameSurface(host, {
    viewer: 'html',
    root,
    page: rel(path),
    title: 'html',
    icon: ICON,
    handlers: {
      followLink: (r) => void follow(r.href, r.newTile),
      // SECURITY: the page's own text (any script can set it): plain text, control characters out,
      // bounded; shown only via textContent (title bar, shelf, tabs) and in tie list.
      title: (r) => {
        const t = pageTitle(r.text)
        if (t === docTitle) return
        docTitle = t
        host.changed()
      },
    },
    onReady: () => {
      ready = true
      host.changed()
    },
    // The page navigated itself (a link it handled, a script, a form...): within the root only (nav
    // lock). The location follows; a new history entry.
    onNavigate: (page) => {
      const abs = (root === '/' ? '/' : root + '/') + page
      ready = false
      if (abs === path) return
      path = abs
      history.list.splice(++history.index, Infinity, abs)
      debug('html', 'navigated', host.id, abs)
      host.changed()
    },
    // Live: anything in the folder changed → reload the page (the bootstrap keeps the scroll).
    onChanged: () => {
      if (reloadTimer) clearTimeout(reloadTimer)
      reloadTimer = setTimeout(() => {
        if (!host.alive()) return
        reloads++
        ready = false
        frame.load(rel(path))
        host.activity()
      }, RELOAD_MS)
    },
  })

  // Show `abs` in this tile: same folder → the frame navigates (nav lock: documents of its root);
  // elsewhere → a new token for that folder.
  async function go(abs: string, how: 'push' | 'back' | 'forward', hash = '') {
    const v = await tie.doc.viewer(abs, 'html') // main: exists, regular file, an html document
    if (!host.alive()) return
    if ('error' in v) return void infoDialog("Can't open link", v.error)
    if (how === 'push') history.list.splice(++history.index, Infinity, abs)
    else history.index += how === 'back' ? -1 : 1
    path = abs
    ready = false
    debug('html', 'go', host.id, how, abs)
    if (inRoot(abs)) frame.load(rel(abs) + hash)
    else {
      root = dirOf(abs)
      await frame.setRoot(root, rel(abs))
    }
    host.changed()
  }

  // SECURITY: requests come from the page's realm (bootstrap or any page script): hostile. Hrefs
  // resolve against the page (root-absolute "/x" = the folder's, own-origin URLs too); then
  // classifyLink: http(s) → only after the user confirms the full URL (scripts can fire this
  // without a click: the dialog closes that exfiltration path); html files → this tile; other files
  // or new-tile requests → beside, in their kind (main checks), at most one per second; everything
  // else refused.
  async function follow(href: string, newTile: boolean) {
    let h = href.trim()
    const origin = frame.origin()
    if (origin && h.toLowerCase().startsWith(origin + '/')) h = h.slice(origin.length)
    if (h.startsWith('/') && !h.startsWith('//')) h = (root === '/' ? '' : root) + h
    const l = classifyLink(h, path)
    if (l.type === 'refused') return debug('security', 'refused link', host.id, l.why, href)
    if (l.type === 'anchor') return newTile ? undefined : frame.load(rel(path) + l.hash)
    if (l.type === 'web') return askExternal(l.url)
    if (!newTile && l.kind === 'html') return go(l.path, 'push', l.hash)
    const now = Date.now()
    if (now - lastNewTile < NEW_TILE_MS) return debug('security', 'new tile throttled', host.id, l.path)
    lastNewTile = now
    const v = await tie.doc.viewer(l.path)
    if (!host.alive()) return
    if ('error' in v) return void infoDialog("Can't open link", v.error)
    const sp = spaceOf(host.id)
    const open = () => openTile(v.kind as Kind, besidePlacement(host.id), { path: v.path, hash: l.hash })
    debug('html', 'open beside', host.id, v.kind, v.path)
    sp ? withSpace(sp.id, open) : open()
  }

  // SECURITY: the page asked for the web (link, target=_blank, window.open). Never without the user:
  // a dialog showing the full URL (site address emphasized; a long tail is called out: the only way
  // data leaves a page is a link the user opens), Cancel focused (Enter cancels), Open disabled for
  // a moment (no click-through). One at a time; requests while it is open are dropped.
  async function askExternal(url: string) {
    if (asking) return debug('security', 'external request dropped (dialog open)', host.id, url)
    asking = true
    const p = (text: string, cls = '') => Object.assign(document.createElement('p'), { textContent: text, className: cls })
    const origin = new URL(url).origin
    const shown = p('', 'url')
    shown.append(Object.assign(document.createElement('b'), { className: 'host', textContent: origin }), url.slice(origin.length))
    const body = [p(`${nameOf(path)} wants to open:`), shown]
    const tail = url.length - origin.length
    if (tail > LONG_LINK) body.push(p(`Long link: ${tail} characters after the site address. The page can read files under ${root}; a link you open is the only way it can send anything out.`, 'warn'))
    const ok = await confirmDialog({ cls: 'external-open', title: 'Open in browser?', body, confirm: 'Open', arm: CONFIRM_ARM_MS })
    asking = false
    debug('html', ok ? 'external confirmed' : 'external cancelled', host.id, url)
    if (ok && host.alive()) tie.openExternal(url)
  }

  function step(d: -1 | 1) {
    const i = history.index + d
    if (i < 0 || i >= history.list.length) return
    void go(history.list[i], d < 0 ? 'back' : 'forward')
  }

  return {
    ...frame,
    mount: async () => {
      if (!opts.path) return host.error('No file to show')
      const v = await tie.doc.viewer(opts.path, 'html')
      if (!host.alive()) return
      if ('error' in v) return host.error(v.error)
      history.list = [path]
      history.index = 0
      host.changed()
      await frame.mount()
    },
    dispose: () => {
      if (reloadTimer) clearTimeout(reloadTimer)
      frame.dispose()
    },
    title: () => docTitle || nameOf(path),
    icon: () => ICON,
    dir: () => root,
    cwd: async () => root,
    nav: {
      state: () => ({ location: path, back: history.index > 0, forward: history.index < history.list.length - 1, editable: false }),
      back: () => step(-1),
      forward: () => step(1),
      reload: () => {
        ready = false
        frame.load(rel(path))
      },
    },
    info: () => {
      const o = frame.origin()
      return { page: { path, url: o && `${o}/${encodePath(rel(path))}`, ready, reloads, history: { index: history.index, length: history.list.length } } }
    },
  }
}
