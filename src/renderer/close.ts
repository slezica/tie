// Closing on the user's request (⌘W, title-bar ×, tab ×, ⌘⇧W): immediate unless something would be
// lost. A busy terminal (Surface.busy: TERMINALS.md "Busy") asks first; a browser page's
// beforeunload asks (Surface.unload: BROWSER.md). Scripted closes (`tie close`, shell exit) call
// closeTile directly. docs/INPUT.md, docs/TABS.md.
import type { TileId } from '@core/layout'
import { S, spaceOf, type Space } from './state'
import { closeTile } from './ops'
import { closeTab, tabTitle } from './tabs'
import { confirmDialog } from './dialog'
import { displayTitle } from './tile'

export interface Running {
  id: TileId
  title: string
  what: string // command, or "running" when unknown
}

const para = (text: string, cls = '') => Object.assign(document.createElement('p'), { textContent: text, className: cls })

export function runningList(items: Running[]): HTMLElement {
  const ul = document.createElement('ul')
  ul.className = 'running'
  for (const r of items) ul.append(Object.assign(document.createElement('li'), { textContent: r.title === r.what ? r.title : `${r.title} — ${r.what}` }))
  return ul
}

// Busy tiles among `ids`, asked now (in order).
export async function runningIn(ids: TileId[]): Promise<Running[]> {
  const all = await Promise.all(
    ids.map(async (id) => {
      const t = S.tiles.get(id)
      const b = t && t.exit === null ? await t.surface.busy?.() : null
      return b && t && S.tiles.has(id) ? { id, title: displayTitle(t), what: b.what ?? 'running' } : null
    }),
  )
  return all.filter((r): r is Running => !!r)
}

// Every tile of a space: board, floats, shelf.
export const tilesOf = (sp: Space): TileId[] => [...S.tiles.keys()].filter((id) => spaceOf(id) === sp)

// Pages that object to unloading (beforeunload) ask, one by one; false = the user kept one. Each
// page that goes closes its tile at once (its guest may be gone already): a later Stay keeps the rest.
export async function unloadAll(ids: TileId[]): Promise<boolean> {
  for (const id of ids) {
    const t = S.tiles.get(id)
    if (!t?.surface.unload) continue
    if (!(await t.surface.unload())) return false
    if (S.tiles.has(id)) closeTile(id)
  }
  return true
}

// One close question at a time (a second ⌘W / click while one is asked: ignored).
let asking = false
async function once(fn: () => Promise<void>) {
  if (asking) return
  asking = true
  try {
    await fn()
  } finally {
    asking = false
  }
}

export function requestCloseTile(id: TileId): Promise<void> {
  return once(async () => {
    const t = S.tiles.get(id)
    if (!t) return
    const [busy] = await runningIn([id])
    if (busy) {
      const ok = await confirmDialog({
        cls: 'close-busy',
        title: `Close ${displayTitle(t)}?`,
        body: [para(busy.what === 'running' ? 'A process is running.' : `${busy.what} is running.`)],
        confirm: 'Close',
        focus: 'confirm',
      })
      if (!ok) return
    }
    if (!S.tiles.has(id) || !(await unloadAll([id]))) return
    if (S.tiles.has(id)) closeTile(id)
  })
}

// Tab with all its tiles. Busy ones listed first; empty or idle: at once.
export function requestCloseTab(id = S.visible): Promise<void> {
  return once(async () => {
    const sp = S.spaces.find((x) => x.id === id)
    if (!sp) return
    const running = await runningIn(tilesOf(sp))
    if (running.length) {
      const ok = await confirmDialog({
        cls: 'close-busy',
        title: `Close tab ${tabTitle(sp)}?`,
        body: [para('Currently running:'), runningList(running)],
        confirm: 'Close tab',
        focus: 'confirm',
      })
      if (!ok) return
    }
    if (!S.spaces.includes(sp) || !(await unloadAll(tilesOf(sp)))) return
    closeTab(id)
  })
}
