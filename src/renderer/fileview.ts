// File view: a tile showing a local file in a Tie viewer (content frame). Shared by every file
// kind (markdown, text, image, hex): the kind gives its name and icon, nothing else. Main reads and
// watches the file (docs.ts) and pushes changes; the viewer (src/viewers/<kind>.ts) renders it.
// What the viewer gets from the file is the kind's payload (policy table): text, bytes
// (transferred), or nothing (it loads `src` from its own token). Here: the doc's lifecycle
// (open, live changes, missing → frozen, close), navigation (history, reload; the host's nav bar)
// and folder (token) switching, link routing, title / dir / cwd, activity, the theme message.
// docs/TILES.md "File view".
import { S, tie, debug, spaceOf, withSpace, type Kind } from './state'
import type { Glyph } from './icons'
import { untrusted } from '@core/log'
import { frameSurface } from './frame'
import { appearance, fontStack } from './appearance'
import { theme } from './themes'
import { openTile, besidePlacement } from './ops'
import { infoDialog } from './dialog'
import { openExternal, confirmFile } from './external'
import { classifyLink } from '@core/links'
import type { Host, OpenOpts, Surface } from './kinds'
import type { DocBody } from '../preload'

type Push = ({ rev: string } & DocBody) | { missing: true }
interface Doc extends DocBody {
  id: number
  path: string
  rev: string
  missing: boolean
}

// Doc changes from main, by doc id.
const byDoc = new Map<number, (p: Push) => void>()
export function initFileViews() {
  tie.doc.onChange((id, p) => byDoc.get(id)?.(p))
}

// File view tiles by id (dev: a rebuilt viewer reloads its frames, `reloadViewers`).
const viewerTiles = new Map<string, { kind: string; reload: () => void }>()
export function reloadViewers(kind: string) {
  for (const v of viewerTiles.values()) if (v.kind === kind) v.reload()
}

export const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/')) || '/'
const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1)

// Theme for viewers: base colors, ANSI palette (code), fonts. Set as CSS custom properties there
// (runtime.ts; CSSOM: the frame's CSP blocks style attributes).
export function themeMessage() {
  const a = appearance()
  const t = theme(a.theme)
  const p = t.palette
  const vars: Record<string, string> = {
    '--bg': p.background,
    '--fg': p.foreground,
    '--accent': t.accent,
    '--font': getComputedStyle(document.documentElement).getPropertyValue('--ui-font').trim() || 'system-ui, sans-serif',
    '--mono': fontStack(a.fontFamily),
    '--size': `${a.fontSize}px`,
  }
  p.ansi.forEach((c, i) => (vars[`--a${i}`] = c))
  // Code tokens (highlight.ts): --code-<token>, -style, -weight; absent → ANSI fallbacks there.
  for (const [k, c] of Object.entries(t.code ?? {})) {
    vars[`--code-${k}`] = c.color
    vars[`--code-${k}-style`] = c.italic ? 'italic' : 'normal'
    vars[`--code-${k}-weight`] = c.bold ? '600' : '400'
  }
  return { type: 'theme', dark: t.dark, vars }
}

export interface FileKindSpec {
  kind: Kind // content kind: viewer name, policy row, debug tag
  icon: Glyph
}

export function fileView(host: Host, opts: OpenOpts, spec: FileKindSpec): Surface {
  const { kind } = spec
  let doc: Doc | null = null
  let root = dirOf(opts.path ?? '/')
  const history = { list: [] as string[], index: -1 }
  // How the next render positions itself: keep (live change), top (new page), restore (back/forward,
  // reload).
  let view: { scroll: 'keep' | 'top' | 'restore'; hash: string; y?: number } = { scroll: 'top', hash: opts.hash ?? '' }
  let lastY = 0 // the viewer's last reported scroll (restored after a viewer reload)
  let seq = 0 // latest navigation wins

  // To the viewer: the doc (key = path), its revision, `src` (the file's URL path on the frame's
  // token: root = its directory), and the payload. Bytes go as a transferred copy (the tile keeps its
  // own for the next handshake).
  const sendDoc = () => {
    if (!doc) return
    const msg = { type: 'doc', key: doc.path, rev: doc.rev, src: '/' + encodeURIComponent(nameOf(doc.path)), scroll: view.scroll, hash: view.hash, y: view.y }
    if (doc.bytes) {
      const bytes = doc.bytes.slice()
      frame.post({ ...msg, bytes }, [bytes.buffer])
    } else frame.post({ ...msg, text: doc.text })
    view = { scroll: 'keep', hash: '' }
  }

  const setDoc = (r: { id: number; rev: string } & DocBody, path: string) => {
    if (doc) {
      byDoc.delete(doc.id)
      tie.doc.close(doc.id)
    }
    const d: Doc = { ...r, path, missing: false }
    doc = d
    byDoc.set(d.id, (p) => {
      if ('missing' in p) {
        d.missing = true // last render stays (frozen); watching continues
        return void host.changed() // the Missing pill
      }
      const was = d.missing
      d.text = p.text
      d.bytes = p.bytes
      d.rev = p.rev
      d.missing = false
      sendDoc()
      host.activity()
      if (was) host.changed()
    })
  }

  const frame = frameSurface(host, {
    viewer: kind,
    root,
    title: kind,
    icon: spec.icon,
    onReady: () => {
      frame.post(themeMessage())
      sendDoc()
    },
    handlers: {
      followLink: (r) => void follow(r.href, r.newTile),
      hover: (r) => host.hint(r.href && doc ? target(r.href) : null),
      scrolled: (r) => (lastY = r.y),
    },
  })

  // The viewer was rebuilt (dev): reload the frame, same root, scroll restored (onReady resends
  // theme + doc).
  viewerTiles.set(host.id, { kind, reload: () => void (doc && ((view = { scroll: 'restore', hash: '', y: lastY }), frame.setRoot(root))) })

  // Open `path` in this tile. Another directory: the frame reloads with a root (token) for it.
  async function go(path: string, how: 'push' | 'back' | 'forward' | 'reload', hash = '') {
    const n = ++seq
    const r = await tie.doc.open(path, kind)
    if (!host.alive() || n !== seq) return void ('id' in r && tie.doc.close(r.id))
    if ('error' in r) return void infoDialog(how === 'reload' ? "Can't reload" : "Can't open link", r.error)
    setDoc(r, path)
    if (how === 'push') history.list.splice(++history.index, Infinity, path)
    else if (how !== 'reload') history.index += how === 'back' ? -1 : 1
    view = { scroll: how === 'push' ? 'top' : 'restore', hash }
    host.changed()
    debug(kind, 'go', host.id, how, untrusted(path))
    if (dirOf(path) !== root) {
      root = dirOf(path)
      await frame.setRoot(root) // onReady sends the doc
    } else sendDoc()
  }

  // Link strip text for a hovered href: what following it would do.
  function target(href: string): string {
    const l = classifyLink(href, doc!.path)
    if (l.type === 'web') return l.url
    if (l.type === 'file') return l.path + l.hash
    if (l.type === 'anchor') return l.hash
    return `Blocked link: ${href.trim()}`
  }

  // SECURITY: hrefs come from the document. classifyLink allows anchors, http(s) (the user confirms,
  // main re-checks) and local files (main re-checks: absolute, existing, its kind). Files of this
  // kind (by extension) open here (cmd: a new tile beside); files of another kind (or decided by
  // content) open beside, in their kind (main decides); everything else refused.
  async function follow(href: string, newTile: boolean) {
    if (!doc) return
    const l = classifyLink(href, doc.path)
    if (l.type === 'web') return void openExternal(l.url, nameOf(doc.path))
    if (l.type === 'anchor') return frame.post({ type: 'scroll', hash: l.hash })
    if (l.type === 'refused') return debug('security', 'refused link', host.id, l.why, untrusted(href))
    // Outside this file's folder: the user confirms the path first (same tile or beside alike).
    if (!(root === '/' || l.path.startsWith(root + '/')) && !(await confirmFile(l.path, nameOf(doc.path)))) return
    if (!host.alive() || !doc) return
    if (l.kind !== kind) return void beside(l.path, l.hash)
    if (newTile) {
      const sp = spaceOf(host.id)
      const open = () => openTile(kind, besidePlacement(host.id), { path: l.path, hash: l.hash })
      return void (sp ? withSpace(sp.id, open) : open())
    }
    if (l.path === doc.path) return frame.post({ type: 'scroll', hash: l.hash })
    void go(l.path, 'push', l.hash)
  }

  // A file of another kind: a new tile beside this one, in the kind main decides (extension, else
  // content); not openable → dialog.
  async function beside(path: string, hash: string) {
    const v = await tie.doc.viewer(path)
    if (!host.alive()) return
    if ('error' in v) return void infoDialog("Can't open link", v.error)
    debug(kind, 'open beside', host.id, v.kind, untrusted(v.path))
    const sp = spaceOf(host.id)
    const open = () => openTile(v.kind as Kind, besidePlacement(host.id), { path: v.path, hash })
    sp ? withSpace(sp.id, open) : open()
  }

  const path = () => doc?.path ?? opts.path

  function step(d: -1 | 1) {
    const i = history.index + d
    if (i < 0 || i >= history.list.length) return
    void go(history.list[i], d < 0 ? 'back' : 'forward')
  }

  return {
    ...frame,
    mount: async () => {
      if (!opts.path) return host.error('No file to show')
      const r = await tie.doc.open(opts.path, kind)
      if (!host.alive()) return void ('id' in r && tie.doc.close(r.id))
      if ('error' in r) return host.error(r.error)
      setDoc(r, opts.path)
      history.list = [opts.path]
      history.index = 0
      host.changed()
      await frame.mount()
    },
    dispose: () => {
      viewerTiles.delete(host.id)
      frame.dispose()
      if (doc) {
        byDoc.delete(doc.id)
        tie.doc.close(doc.id)
      }
    },
    title: () => nameOf(path() ?? kind),
    icon: () => spec.icon,
    dir: () => dirOf(path() ?? S.cwd),
    cwd: async () => dirOf(path() ?? S.cwd),
    appearance: () => frame.post(themeMessage()),
    // Path shown, not editable (links navigate). Reload: read the file again, render it as a page
    // (scroll kept).
    nav: {
      state: () => ({ location: path() ?? '', back: history.index > 0, forward: history.index < history.list.length - 1, editable: false }),
      back: () => step(-1),
      forward: () => step(1),
      reload: () => void (doc && go(doc.path, 'reload')),
    },
    // The file is gone: the last render stays (frozen) until it comes back.
    pills: [
      {
        label: () => (doc?.missing ? 'Missing' : ''),
        title: () => 'The file was deleted or moved. Showing its last render; it updates if the file comes back.',
        on: () => false,
        color: 'red',
      },
    ],
    info: () => ({ doc: doc && { path: doc.path, rev: doc.rev, missing: doc.missing, history: { index: history.index, length: history.list.length } } }),
  }
}
