// Tabs: one per space, in the window's top bar.
import { S, newSpace, type Space } from './state'
import { render } from './render'
import { activate } from './ops'
import { showMetaMenu } from './menu'
import { infoDialog } from './dialog'
import { displayTitle, iconHtml } from './tile'
import { ICON } from './icons'

let home = ''
export const setHome = (h: string) => (home = h)

const space = (id: string) => S.spaces.find((x) => x.id === id)
const isEmpty = (sp: Space) => !sp.tree && sp.floats.length === 0 && sp.shelf.length === 0

function prettyDir(dir: string): string {
  if (home && dir === home) return '~'
  return dir.split('/').filter(Boolean).pop() ?? '/'
}

// Custom title, else the active terminal's working directory, else its title.
export function tabTitle(sp: Space): string {
  if (sp.customTitle) return sp.customTitle
  const t = sp.active ? S.tiles.get(sp.active) : undefined
  if (t?.cwdNow) return prettyDir(t.cwdNow)
  if (t) return displayTitle(t)
  return 'empty'
}

export function newTab(): string {
  const sp = newSpace()
  const at = S.spaces.findIndex((x) => x.id === S.visible)
  S.spaces.splice(at + 1, 0, sp)
  switchTab(sp.id)
  return sp.id
}

export function switchTab(id: string) {
  if (!space(id)) return
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

// Only empty tabs close (safety); otherwise explain.
export async function closeTab(id = S.visible): Promise<boolean> {
  const sp = space(id)
  if (!sp) return false
  if (!isEmpty(sp)) {
    await infoDialog('Tab not empty', 'Only empty tabs can be closed. Close or move its tiles (board and shelf) first.')
    return false
  }
  const i = S.spaces.indexOf(sp)
  S.spaces.splice(i, 1)
  if (S.spaces.length === 0) S.spaces.push(newSpace())
  if (S.visible === id) switchTab(S.spaces[Math.max(0, i - 1)].id)
  else render()
  return true
}

export function setTabMeta(id: string, meta: { title?: string | null; icon?: string | null }) {
  const sp = space(id)
  if (!sp) return
  if (meta.title !== undefined) sp.customTitle = meta.title || undefined
  if (meta.icon !== undefined) sp.customIcon = meta.icon || undefined
  render()
}

const tabEls = new Map<string, HTMLElement>()

function createTabEl(id: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'tab'
  el.dataset.space = id
  el.innerHTML = `<span class="tab-icon"></span><span class="tab-title"></span><button class="tab-close" title="Close tab">${ICON.close}</button>`
  el.addEventListener('pointerdown', (e) => {
    if (e.button === 0 && !(e.target as HTMLElement).closest('.tab-close')) switchTab(id)
  })
  el.querySelector('.tab-close')!.addEventListener('click', () => closeTab(id))
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    const sp = space(id)
    if (!sp) return
    showMetaMenu(
      { customTitle: sp.customTitle, customIcon: sp.customIcon, title: tabTitle(sp), icon: sp.customIcon ?? '', set: (m) => setTabMeta(id, m) },
      e.clientX,
      e.clientY,
    )
  })
  return el
}

// Keyed reconcile, like the shelf.
export function renderTabs() {
  const bar = document.getElementById('tabs')!
  const add = document.getElementById('tab-add')!
  for (const [id, el] of tabEls) {
    if (!space(id)) {
      el.remove()
      tabEls.delete(id)
    }
  }
  S.spaces.forEach((sp, i) => {
    let el = tabEls.get(sp.id)
    if (!el) tabEls.set(sp.id, (el = createTabEl(sp.id)))
    if (bar.children[i] !== el) bar.insertBefore(el, bar.children[i] ?? add)
    el.classList.toggle('current', sp.id === S.visible)
    const title = tabTitle(sp)
    const t = el.querySelector('.tab-title') as HTMLElement
    if (t.textContent !== title) t.textContent = title
    el.title = title
    const icon = el.querySelector('.tab-icon') as HTMLElement
    const iconMarkup = sp.customIcon ? iconHtml(sp.customIcon) : ''
    if (icon.dataset.icon !== iconMarkup) (icon.innerHTML = iconMarkup), (icon.dataset.icon = iconMarkup)
  })
}

export function initTabs() {
  document.getElementById('tab-add')!.addEventListener('click', () => newTab())
  // Titles derive from tile metadata (cwd, process): refresh on changes.
  document.addEventListener('tile-meta', () => renderTabs())
}
