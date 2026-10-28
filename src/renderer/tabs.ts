// Tabs: one per space, the tab list in the toolbar (scrolls when they don't fit).
import { S, newSpace, spaceOf, debug, type Space } from './state'
import { render } from './render'
import { activate, openTile, closeTile, setEmptySpaceHandler } from './ops'
import { showMetaMenu } from './menu'
import { requestCloseTab } from './close'
import { displayTitle } from './tile'
import { iconHtml } from './icons'
import { ICON } from './icons'
import { track } from './drag'

let home = ''
export const setHome = (h: string) => (home = h)

const space = (id: string) => S.spaces.find((x) => x.id === id)

// Basename, `~` for home.
export function prettyDir(dir: string): string {
  if (home && dir === home) return '~'
  return dir.split('/').filter(Boolean).pop() ?? '/'
}

// Full path, home abbreviated to `~`.
export function tildePath(dir: string): string {
  return home && (dir === home || dir.startsWith(home + '/')) ? '~' + dir.slice(home.length) : dir
}

// Custom title, else the active (or first shelved) terminal's working directory, else its title.
export function tabTitle(sp: Space): string {
  if (sp.customTitle) return sp.customTitle
  const t = S.tiles.get(sp.active ?? sp.shelf[0] ?? '')
  const dir = t?.surface.dir?.()
  if (dir) return prettyDir(dir)
  if (t) return displayTitle(t)
  return 'empty'
}

// A new tab starts with a terminal (like a template dropped on an empty board: default cwd).
export function newTab(): string {
  const sp = newSpace()
  const at = S.spaces.findIndex((x) => x.id === S.visible)
  S.spaces.splice(at + 1, 0, sp)
  switchTab(sp.id)
  openTerminal()
  return sp.id
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

// Drag a tab sideways to reorder; order updates live under the pointer.
function dragTab(e: PointerEvent, id: string) {
  const x0 = e.clientX
  let started = false
  track(e, {
    move: (ev) => {
      if (!started && Math.abs(ev.clientX - x0) < 4) return
      if (!started) document.body.classList.add('dragging-tab')
      started = true
      const others = S.spaces.filter((sp) => sp.id !== id)
      let index = others.length
      for (let i = 0; i < others.length; i++) {
        const r = tabEls.get(others[i].id)!.getBoundingClientRect()
        if (ev.clientX < r.left + r.width / 2) {
          index = i
          break
        }
      }
      const moved = S.spaces.find((sp) => sp.id === id)!
      others.splice(index, 0, moved)
      if (others.some((sp, i) => sp !== S.spaces[i])) {
        S.spaces = others
        renderTabs()
      }
    },
    up: () => document.body.classList.remove('dragging-tab'),
    cancel: () => document.body.classList.remove('dragging-tab'),
  })
}

function createTabEl(id: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'tab'
  el.dataset.space = id
  el.innerHTML = `<span class="tab-ping" title="A tile here was pinged"></span><span class="tab-icon"></span><span class="tab-title"></span><button class="tab-close" title="Close tab">${ICON.close}</button>`
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.tab-close')) return
    switchTab(id)
    dragTab(e, id)
  })
  el.querySelector('.tab-close')!.addEventListener('click', () => void requestCloseTab(id))
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    const sp = space(id)
    if (!sp) return
    showMetaMenu(
      { customTitle: sp.customTitle, customIcon: sp.customIcon, title: tabTitle(sp), set: (m) => setTabMeta(id, m) },
      e.clientX,
      e.clientY,
    )
  })
  return el
}

let shownCurrent = '' // last tab scrolled into view, and the list's content width then
let shownWidth = 0

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
  // Keep the current tab in view when it changes or tabs resize (titles); a user scroll stays.
  const list = document.getElementById('tab-list')!
  if (shownCurrent !== S.visible || shownWidth !== list.scrollWidth) {
    shownCurrent = S.visible
    shownWidth = list.scrollWidth
    showTab(S.visible)
  }
  syncOverflow()
}

// Scroll the list so the tab is fully visible (never scrolls anything else).
function showTab(id: string) {
  const el = tabEls.get(id)
  const list = document.getElementById('tab-list')!
  if (!el) return
  const left = el.offsetLeft
  const right = left + el.offsetWidth
  if (left < list.scrollLeft) list.scrollLeft = left
  else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth
}

// Overflow state: `#tabs.overflow` (divider toward the shelf), fades on the sides with more tabs.
function syncOverflow() {
  const tabs = document.getElementById('tabs')!
  const list = document.getElementById('tab-list')!
  const over = list.scrollWidth > list.clientWidth + 1
  tabs.classList.toggle('overflow', over)
  list.classList.toggle('more-left', over && list.scrollLeft > 1)
  list.classList.toggle('more-right', over && list.scrollLeft + list.clientWidth < list.scrollWidth - 1)
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
  // A vertical wheel scrolls the list sideways (trackpads scroll sideways already).
  list.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    list.scrollLeft += e.deltaY
    e.preventDefault()
  })
  // Titles derive from tile metadata (cwd, process): refresh on changes.
  document.addEventListener('tile-meta', () => renderTabs())
}
