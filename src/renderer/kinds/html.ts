// Html kind: a local .html file is the page, shown static (decision 2026-10-21): its own scripts
// never run; the document CSP lets only Tie's bootstrap run (per-response nonce). Isolated: own
// content frame on its own token origin (sandbox allow-scripts allow-same-origin), no network, nav
// lock within its folder, storage in memory only (the UI's session). Main injects the bootstrap
// (src/viewers/html-bootstrap.ts): handshake, pong, link hovers, clicks and window.open → requests,
// and a count of scripts the CSP blocked (the title-bar tag "Scripts blocked"). Here: routing those
// requests, history (host-driven and the page's own navigations, reported by main), live reload on
// folder changes, nav bar. docs/VIEWERS.md "Html".
import { tie, debug, spaceOf, withSpace, type Kind } from '../state'
import type { Glyph } from '../icons'
import { untrusted } from '@core/log'
import { frameSurface, type FrameSpec } from '../frame'
import { openTile, besidePlacement } from '../ops'
import { infoDialog } from '../dialog'
import { nameOf } from '../fileview'
import { contains } from '@core/roots'
import { resolveRoot } from '../roots'
import { tildePath } from '../tabs'
import { openExternal, confirmFile } from '../external'
import { classifyLink } from '@core/links'
import type { Host, OpenOpts, Surface } from '.'

const ICON: Glyph = 'html'
const RELOAD_MS = 100 // folder change → reload (main already debounced)
const NEW_TILE_MS = 1000 // at most one tile opened per this, per html tile (a page can hold many links)

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/')

export function htmlKind(host: Host, opts: OpenOpts): Surface {
  let path = opts.path ?? '' // page shown (absolute)
  let root = '' // the frame's root (DIRECTORIES.md); set at mount
  const history = { list: [] as string[], index: -1 }
  let ready = false
  let reloads = 0
  let lastNewTile = 0
  let reloadTimer: ReturnType<typeof setTimeout> | null = null
  let blocked = 0 // scripts the CSP refused on the page shown (bootstrap `blocked` reports)

  const inRoot = (p: string) => contains(root, p)
  const rel = (p: string) => p.slice(root === '/' ? 1 : root.length + 1)
  const loading = () => {
    ready = false
    blocked = 0
  }

  const spec: FrameSpec = {
    viewer: 'html',
    root, // set at mount, before the frame mounts
    page: '',
    title: 'html',
    icon: ICON,
    handlers: {
      followLink: (r) => void follow(r.href, r.newTile),
      hover: (r) => host.hint(r.href ? target(r.href) : null),
      blocked: (r) => {
        if (r.n === blocked) return
        blocked = r.n
        host.changed()
      },
    },
    onReady: () => {
      ready = true
      host.changed()
    },
    // The page navigated itself (a link it handled, a meta refresh...): within the root only (nav
    // lock). The location follows; a new history entry.
    onNavigate: (page) => {
      const abs = (root === '/' ? '/' : root + '/') + page
      loading()
      if (abs === path) return
      path = abs
      history.list.splice(++history.index, Infinity, abs)
      debug('html', 'navigated', host.id, untrusted(abs))
      host.changed()
    },
    // Live: anything in the folder changed → reload the page (the bootstrap keeps the scroll).
    onChanged: () => {
      if (reloadTimer) clearTimeout(reloadTimer)
      reloadTimer = setTimeout(() => {
        if (!host.alive()) return
        reloads++
        loading()
        frame.load(rel(path))
        host.activity()
      }, RELOAD_MS)
    },
  }
  const frame = frameSurface(host, spec)

  // Show `abs` in this tile: inside the root → the frame navigates (nav lock: documents of its
  // root); outside → a new token, root by the rule again (`/` asks, Stop = stay here).
  async function go(abs: string, how: 'push' | 'back' | 'forward', hash = '') {
    const v = await tie.doc.viewer(abs, 'html') // main: exists, regular file, an html document
    if (!host.alive()) return
    if ('error' in v) return void infoDialog("Can't open link", v.error)
    const next = inRoot(abs) ? root : await resolveRoot(host.cwd(), abs, root)
    if (!host.alive() || next === null) return
    if (how === 'push') history.list.splice(++history.index, Infinity, abs)
    else history.index += how === 'back' ? -1 : 1
    path = abs
    loading()
    debug('html', 'go', host.id, how, untrusted(abs))
    if (next === root) frame.load(rel(abs) + hash)
    else {
      root = next
      await frame.setRoot(root, rel(abs))
    }
    host.changed()
  }

  // A link as the page wrote it → where it leads (classifyLink), after resolving root-absolute "/x"
  // (the folder's) and own-origin URLs to paths.
  function resolve(href: string) {
    let h = href.trim()
    const origin = frame.origin()
    if (origin && h.toLowerCase().startsWith(origin + '/')) h = h.slice(origin.length)
    if (h.startsWith('/') && !h.startsWith('//')) h = (root === '/' ? '' : root) + h
    return classifyLink(h, path)
  }

  // Link strip text for a hovered href: what following it would do.
  function target(href: string): string {
    const l = resolve(href)
    if (l.type === 'web') return l.url
    if (l.type === 'file') return l.path + l.hash
    if (l.type === 'anchor') return l.hash
    return `Blocked link: ${href.trim()}`
  }

  // SECURITY: requests come from the page's realm (the bootstrap; page scripts never run, but the
  // bootstrap acts on the page's links): treated as hostile anyway. Hrefs resolve against the page;
  // then classifyLink: http(s) → only after the user confirms the full URL; html files → this tile;
  // other files or new-tile requests → beside, in their kind (main checks), at most one per second;
  // everything else refused.
  async function follow(href: string, newTile: boolean) {
    const l = resolve(href)
    if (l.type === 'refused') return debug('security', 'refused link', host.id, l.why, untrusted(href))
    if (l.type === 'anchor') return newTile ? undefined : frame.load(rel(path) + l.hash)
    if (l.type === 'web') return openExternal(l.url, nameOf(path))
    // Outside this page's folder: the user confirms the path first (same tile or beside alike).
    if (!inRoot(l.path) && !(await confirmFile(l.path, nameOf(path)))) return
    if (!host.alive()) return
    if (!newTile && l.kind === 'html') return go(l.path, 'push', l.hash)
    const now = Date.now()
    if (now - lastNewTile < NEW_TILE_MS) return debug('security', 'new tile throttled', host.id, untrusted(l.path))
    lastNewTile = now
    const v = await tie.doc.viewer(l.path)
    if (!host.alive()) return
    if ('error' in v) return void infoDialog("Can't open link", v.error)
    const sp = spaceOf(host.id)
    const open = () => openTile(v.kind as Kind, besidePlacement(host.id), { path: v.path, hash: l.hash, cwd: host.cwd() })
    debug('html', 'open beside', host.id, v.kind, untrusted(v.path))
    sp ? withSpace(sp.id, open) : open()
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
      const rt = await resolveRoot(host.cwd(), path, null, opts.root)
      if (!host.alive()) return
      if (rt === null) return host.error('Stopped: not shown with / as its root')
      spec.root = root = rt
      spec.page = rel(path)
      history.list = [path]
      history.index = 0
      host.changed()
      await frame.mount()
    },
    dispose: () => {
      if (reloadTimer) clearTimeout(reloadTimer)
      frame.dispose()
    },
    title: () => tildePath(path), // full path, `~` for home
    icon: () => ICON,
    // The page had scripts; Tie didn't run them. A tag, not a switch: html tiles are static by
    // design (dynamic pages: serve them and open a browser tile).
    pills: [
      {
        label: () => (blocked ? 'Scripts blocked' : ''),
        title: () => `This page has scripts (${blocked} blocked). Tie shows html files static. For a dynamic page, run a server and open it in a browser tile.`,
        on: () => false,
        color: 'red',
      },
    ],
    nav: {
      state: () => ({ location: path, back: history.index > 0, forward: history.index < history.list.length - 1, editable: false }),
      back: () => step(-1),
      forward: () => step(1),
      reload: () => {
        loading()
        frame.load(rel(path))
      },
    },
    info: () => {
      const o = frame.origin()
      return { page: { path, root, url: o && `${o}/${encodePath(rel(path))}`, ready, reloads, blocked, history: { index: history.index, length: history.list.length } } }
    },
  }
}
