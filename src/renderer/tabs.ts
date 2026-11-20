// Tabs: one per space, the tab list in its bar (scrolls when they don't fit).
import { S, newSpace, spaceOf, debug, type Space } from './state'
import { render } from './render'
import { activate, openTile, closeTile, moveToSpace, moveGroupToSpace, setEmptySpaceHandler } from './ops'
import { showMetaMenu } from './menu'
import { requestCloseTab } from './close'
import { iconHtml } from './icons'
import { ICON } from './icons'
import { track } from './drag'
import { verticalComponent } from './bars'
import { edgeScroll, edgeHolding, scrollSize, showChild, sideWheel, syncFades } from './overflow'

let home = ''
export const setHome = (h: string) => (home = h)
export const homeDir = () => home

const space = (id: string) => S.spaces.find((x) => x.id === id)
const tabsVertical = () => verticalComponent('tabs')

// Basename, `~` for home.
export function prettyDir(dir: string): string {
  if (home && dir === home) return '~'
  return dir.split('/').filter(Boolean).pop() ?? '/'
}

// Full path, home abbreviated to `~`.
export function tildePath(dir: string): string {
  return home && (dir === home || dir.startsWith(home + '/')) ? '~' + dir.slice(home.length) : dir
}

// Custom title, else the cwd of the active (or first shelved) tile, any kind (DIRECTORIES.md).
export function tabTitle(sp: Space): string {
  if (sp.customTitle) return sp.customTitle
  const t = S.tiles.get(sp.active ?? sp.shelf[0] ?? '')
  return t ? prettyDir(t.cwd) : 'empty'
}

// A new tab starts with a terminal in the app cwd (a tile from nothing: no context tile).
// `empty`: no terminal, for a tile dropped onto the tab list (the caller fills it at once).
// `show: false` (CLI `--tab new` without --focus): created after the visible tab but not shown.
export function newTab(o: { empty?: boolean; show?: boolean } = {}): string {
  const sp = newSpace()
  const at = S.spaces.findIndex((x) => x.id === S.visible)
  S.spaces.splice(at + 1, 0, sp)
  if (o.show !== false) switchTab(sp.id)
  else render()
  if (!o.empty) openTerminal()
  return sp.id
}

// A tile dropped onto a tab: that tab is shown, the tile joins it, active (ops `moveToSpace`).
// Switching first: the emptied source tab, now hidden, just goes away.
export function moveToTab(id: string, spaceId: string) {
  if (!space(spaceId)) return
  switchTab(spaceId)
  moveToSpace(id, spaceId)
}

// The shelf selection's "Move N to tab" (SHELF.md "Selection"): as moveToTab, as a group;
// `spaceId` null: a new tab.
export function moveGroupToTab(ids: string[], spaceId: string | null) {
  if (!ids.length) return
  if (spaceId === null) spaceId = newTab({ empty: true })
  else if (!space(spaceId)) return
  else switchTab(spaceId)
  moveGroupToSpace(ids, spaceId)
}

const openTerminal = () => openTile('terminal', { type: 'slot', at: null, side: 'r' })

// Remove a space. The visible one hands over to the tab before it; never zero tabs (a fresh one,
// with a terminal like any new tab, replaces the last). A hidden one: the visible tab stays.
function dropSpace(id: string) {
  const sp = space(id)
  if (!sp) return
  const i = S.spaces.indexOf(sp)
  S.spaces.splice(i, 1)
  if (S.spaces.length === 0) {
    const fresh = newSpace()
    S.spaces.push(fresh)
    switchTab(fresh.id)
    return void openTerminal()
  }
  if (S.visible === id) return switchTab(S.spaces[Math.max(0, i - 1)].id)
  if (S.current === id) S.current = S.visible
  render()
}

export function switchTab(id: string) {
  if (!space(id)) return
  const left = space(S.visible)
  if (left) left.revealed = null // its shelf items go away without a pointerleave
  if (left) left.selected.clear() // leaving a tab de-selects (SHELF.md "Selection")
  S.visible = S.current = id
  const sp = space(id)!
  if (sp.active) activate(sp.active)
  else {
    ;(document.activeElement as HTMLElement | null)?.blur()
    render()
  }
}

export function switchTabIndex(n: number) {
  // 1..8 by position, 9 = last (browser convention).
  const sp = n >= 9 ? S.spaces[S.spaces.length - 1] : S.spaces[n - 1]
  if (sp) switchTab(sp.id)
}

export function cycleTab(delta: number) {
  const i = S.spaces.findIndex((x) => x.id === S.visible)
  const n = S.spaces.length
  switchTab(S.spaces[(i + delta + n) % n].id)
}

// Close a tab with every tile in it (board, floats, shelf); no questions (requestCloseTab asks).
// Closing the last tile already drops the space (empty hook) unless it is the only tab: dropped here.
export function closeTab(id = S.visible) {
  const sp = space(id)
  if (!sp) return
  for (const t of [...S.tiles.keys()].filter((t) => spaceOf(t) === sp)) closeTile(t)
  if (space(id)) dropSpace(id)
}

export function setTabMeta(id: string, meta: { title?: string | null; icon?: string | null }) {
  const sp = space(id)
  if (!sp) return
  if (meta.title !== undefined) sp.customTitle = meta.title || undefined
  if (meta.icon !== undefined) sp.customIcon = meta.icon || undefined
  render()
}

const tabEls = new Map<string, HTMLElement>()

// Drag a tab along the list to reorder; order updates live under the pointer. Near the list's ends
// it auto-scrolls (edgeScroll); past them counts as deepest. The order follows each scroll step.
// Along the bar's axis: x in a top / bottom bar, y in a left / right one.
function dragTab(e: PointerEvent, id: string) {
  const v = tabsVertical()
  const along = (ev: PointerEvent) => (v ? ev.clientY : ev.clientX)
  const p0 = along(e)
  let p = p0
  let started = false
  const reorder = () => {
    const others = S.spaces.filter((sp) => sp.id !== id)
    let index = others.length
    for (let i = 0; i < others.length; i++) {
      const r = tabEls.get(others[i].id)!.getBoundingClientRect()
      if (p < (v ? r.top + r.height / 2 : r.left + r.width / 2)) {
        index = i
        break
      }
    }
    const moved = S.spaces.find((sp) => sp.id === id)
    if (!moved) return // closed mid-drag
    others.splice(index, 0, moved)
    if (others.some((sp, i) => sp !== S.spaces[i])) {
      S.spaces = others
      renderTabs()
    }
  }
  const edge = edgeScroll(document.getElementById('tab-list')!, v, { past: true, step: reorder })
  const end = () => {
    edge.stop()
    document.body.classList.remove('dragging-tab')
  }
  track(e, {
    move: (ev) => {
      if (!started && Math.abs(along(ev) - p0) < 4) return
      if (!started) document.body.classList.add('dragging-tab')
      started = true
      p = along(ev)
      reorder()
      edge.at(ev.clientX, ev.clientY)
    },
    up: end,
    cancel: end,
  })
}

function createTabEl(id: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'tab'
  el.dataset.space = id
  el.innerHTML = `<span class="tab-ping" title="A tile here was pinged"></span><span class="tab-icon"></span><span class="tab-title"></span><button class="tab-close" title="Close tab (shift: without asking)">${ICON.close}</button>`
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.tab-close')) return
    switchTab(id)
    dragTab(e, id)
  })
  el.querySelector('.tab-close')!.addEventListener('click', (e) => void requestCloseTab(id, { force: (e as MouseEvent).shiftKey }))
  // Middle-click and the menu close too (a narrow side bar shows no close button: TABS.md).
  el.addEventListener('auxclick', (e) => e.button === 1 && void requestCloseTab(id, { force: e.shiftKey }))
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    const sp = space(id)
    if (!sp) return
    showMetaMenu(
      { customTitle: sp.customTitle, customIcon: sp.customIcon, title: tabTitle(sp), set: (m) => setTabMeta(id, m), close: () => void requestCloseTab(id) },
      e.clientX,
      e.clientY,
    )
  })
  return el
}

let shownCurrent = '' // last tab scrolled into view, and the list's content size (along its axis) then
let shownSize = 0

// Keyed reconcile, like the shelf.
export function renderTabs() {
  const bar = document.getElementById('tab-list')!
  for (const [id, el] of tabEls) {
    if (!space(id)) {
      el.remove()
      tabEls.delete(id)
    }
  }
  S.spaces.forEach((sp, i) => {
    let el = tabEls.get(sp.id)
    if (!el) tabEls.set(sp.id, (el = createTabEl(sp.id)))
    if (bar.children[i] !== el) bar.insertBefore(el, bar.children[i] ?? null)
    el.classList.toggle('current', sp.id === S.visible)
    el.classList.toggle('pinged', sp.id !== S.visible && [...S.tiles.values()].some((t) => t.pinged && spaceOf(t.id)?.id === sp.id))
    const title = tabTitle(sp)
    const t = el.querySelector('.tab-title') as HTMLElement
    if (t.textContent !== title) t.textContent = title
    el.title = title
    const icon = el.querySelector('.tab-icon') as HTMLElement
    const iconMarkup = sp.customIcon ? iconHtml({ text: sp.customIcon }) : ''
    if (icon.dataset.icon !== iconMarkup) (icon.innerHTML = iconMarkup), (icon.dataset.icon = iconMarkup)
  })
  // Keep the current tab in view when it changes or tabs resize (titles); a user scroll stays, and
  // so does a drag's auto-scroll (checked again on the first render after it).
  const list = document.getElementById('tab-list')!
  const v = tabsVertical()
  if (!edgeHolding() && (shownCurrent !== S.visible || shownSize !== scrollSize(list, v))) {
    shownCurrent = S.visible
    shownSize = scrollSize(list, v)
    const el = tabEls.get(S.visible)
    if (el) showChild(list, el, v)
  }
  syncOverflow()
}

// Overflow state: `#tabs.overflow` (divider toward what follows), fades on the ends with more tabs.
function syncOverflow() {
  const over = syncFades(document.getElementById('tab-list')!, tabsVertical())
  document.getElementById('tabs')!.classList.toggle('overflow', over)
}

// Tile / template drags over the tabs component (drag.ts, bars.ts): the tab at the pointer along the
// bar's axis (gaps: the nearest one) → its space; the rest (the + button, empty space, the overflow
// edge) → null: a new tab.
export function tabDropAt(x: number, y: number): string | null {
  const v = tabsVertical()
  const p = v ? y : x
  const list = document.getElementById('tab-list')!.getBoundingClientRect()
  if (p < (v ? list.top : list.left) || p > (v ? list.bottom : list.right)) return null
  let best: string | null = null
  let dist = Infinity
  for (const [id, el] of tabEls) {
    const b = el.getBoundingClientRect()
    const lo = v ? b.top : b.left
    const hi = v ? b.bottom : b.right
    const d = p < lo ? lo - p : p > hi ? p - hi : 0
    if (d < dist) (dist = d), (best = id)
  }
  return best
}

// Drop highlight: the tab (`.tab.drop`) or, for a new tab, the + button (`#tab-add.drop`);
// undefined clears.
export function markTabDrop(target: string | null | undefined) {
  for (const [id, el] of tabEls) el.classList.toggle('drop', target === id)
  document.getElementById('tab-add')!.classList.toggle('drop', target === null)
}

export function initTabs() {
  // A tab emptied by closing its last tile (any path) closes; the only tab stays, empty.
  setEmptySpaceHandler((id) => {
    debug('layout', 'empty tab closed', id)
    dropSpace(id)
  })
  document.getElementById('tab-add')!.addEventListener('click', () => newTab())
  const list = document.getElementById('tab-list')!
  list.addEventListener('scroll', syncOverflow)
  sideWheel(list, tabsVertical)
  // Titles derive from tile metadata (cwd, process): refresh on changes.
  document.addEventListener('tile-meta', () => renderTabs())
}
