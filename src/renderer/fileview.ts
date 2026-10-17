// File view: a tile showing a local file in a Tie viewer (content frame). Shared by every file
// kind: the kind gives its name and icon, nothing else. Main reads and watches the file (docs.ts)
// and pushes changes; the viewer (src/viewers/<kind>.ts) renders it. Here: the doc's lifecycle
// (open, live changes, missing → frozen, close), history and folder (token) switching, link
// routing, title / dir / cwd, activity, the theme message. docs/TILES.md "File view".
import { S, tie, debug, spaceOf, withSpace, type Kind } from './state'
import { frameSurface } from './frame'
import { appearance, fontStack } from './appearance'
import { theme } from './themes'
import { openTile, besidePlacement } from './ops'
import { infoDialog } from './dialog'
import { classifyLink } from '@core/links'
import type { Host, OpenOpts, Surface } from './kinds'

type Push = { text: string; rev: string } | { missing: true }
interface Doc {
  id: number
  path: string
  text: string
  rev: string
  missing: boolean
}

// Doc changes from main, by doc id.
const byDoc = new Map<number, (p: Push) => void>()
export function initFileViews() {
  tie.doc.onChange((id, p) => byDoc.get(id)?.(p))
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
  return { type: 'theme', dark: t.dark, vars }
}

export interface FileKindSpec {
  kind: Kind // content kind: viewer name, policy row, debug tag
  icon: string
}

export function fileView(host: Host, opts: OpenOpts, spec: FileKindSpec): Surface {
  const { kind } = spec
  let doc: Doc | null = null
  let root = dirOf(opts.path ?? '/')
  const history = { list: [] as string[], index: -1 }
  // How the next render positions itself: keep (live change), top (new page), restore (back/forward).
  let view: { scroll: 'keep' | 'top' | 'restore'; hash: string } = { scroll: 'top', hash: opts.hash ?? '' }
  let seq = 0 // latest navigation wins

  const sendDoc = () => {
    if (!doc) return
    frame.post({ type: 'doc', key: doc.path, text: doc.text, rev: doc.rev, scroll: view.scroll, hash: view.hash })
    view = { scroll: 'keep', hash: '' }
  }

  const setDoc = (r: { id: number; text: string; rev: string }, path: string) => {
    if (doc) {
      byDoc.delete(doc.id)
      tie.doc.close(doc.id)
    }
    const d: Doc = { ...r, path, missing: false }
    doc = d
    byDoc.set(d.id, (p) => {
      if ('missing' in p) {
        d.missing = true // last render stays (frozen); watching continues
        return
      }
      d.text = p.text
      d.rev = p.rev
      d.missing = false
      sendDoc()
      host.activity()
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
      followLink: (r) => follow(r.href, r.newTile),
    },
  })

  // Open `path` in this tile. Another directory: the frame reloads with a root (token) for it.
  async function go(path: string, how: 'push' | 'back' | 'forward', hash = '') {
    const n = ++seq
    const r = await tie.doc.open(path)
    if (!host.alive() || n !== seq) return void ('id' in r && tie.doc.close(r.id))
    if ('error' in r) return void infoDialog("Can't open link", r.error)
    setDoc(r, path)
    if (how === 'push') history.list.splice(++history.index, Infinity, path)
    else history.index += how === 'back' ? -1 : 1
    view = { scroll: how === 'push' ? 'top' : 'restore', hash }
    host.changed()
    debug(kind, 'go', host.id, how, path)
    if (dirOf(path) !== root) {
      root = dirOf(path)
      await frame.setRoot(root) // onReady sends the doc
    } else sendDoc()
  }

  // SECURITY: hrefs come from the document. classifyLink allows anchors, http(s) (main re-checks)
  // and local files (main re-checks: absolute, existing, has a kind). Files of this kind open here
  // (cmd: a new tile beside); other files are ignored for now (no viewer, or another kind: P5);
  // everything else refused.
  function follow(href: string, newTile: boolean) {
    if (!doc) return
    const l = classifyLink(href, doc.path)
    if (l.type === 'web') return tie.openExternal(l.url)
    if (l.type === 'anchor') return frame.post({ type: 'scroll', hash: l.hash })
    if (l.type === 'refused') return debug('security', 'refused link', host.id, l.why, href)
    if (l.kind !== kind) return debug(kind, l.kind ? `ignored link (${l.kind})` : 'ignored link (no viewer)', host.id, l.path)
    if (newTile) {
      const sp = spaceOf(host.id)
      const open = () => openTile(kind, besidePlacement(host.id), { path: l.path, hash: l.hash })
      return void (sp ? withSpace(sp.id, open) : open())
    }
    if (l.path === doc.path) return frame.post({ type: 'scroll', hash: l.hash })
    void go(l.path, 'push', l.hash)
  }

  const path = () => doc?.path ?? opts.path

  return {
    ...frame,
    mount: async () => {
      if (!opts.path) return host.error('No file to show')
      const r = await tie.doc.open(opts.path)
      if (!host.alive()) return void ('id' in r && tie.doc.close(r.id))
      if ('error' in r) return host.error(r.error)
      setDoc(r, opts.path)
      history.list = [opts.path]
      history.index = 0
      host.changed()
      await frame.mount()
    },
    dispose: () => {
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
    history: (step) => {
      const i = history.index + step
      if (i < 0 || i >= history.list.length) return
      void go(history.list[i], step < 0 ? 'back' : 'forward')
    },
    info: () => ({ doc: doc && { path: doc.path, rev: doc.rev, missing: doc.missing, history: { index: history.index, length: history.list.length } } }),
  }
}
