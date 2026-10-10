// HTML context menu (not native, so Playwright can drive it).
import type { TileId } from '@core/layout'
import { S } from './state'
import { setMeta, refocus } from './ops'
import { displayTitle, displayIcon } from './tile'

let menu: HTMLElement | null = null

export function closeMenu() {
  const hadFocus = menu?.contains(document.activeElement)
  menu?.remove()
  menu = null
  if (hadFocus) refocus()
}

// Anything with a renamable title and icon (tiles, tabs).
export interface MetaTarget {
  customTitle?: string
  customIcon?: string
  title: string // current displayed title
  icon: string // current displayed icon ('' = none/default)
  set: (meta: { title?: string | null; icon?: string | null }) => void
}

export function showTileMenu(id: TileId, x: number, y: number) {
  const t = S.tiles.get(id)
  if (!t) return
  showMetaMenu(
    { customTitle: t.customTitle, customIcon: t.customIcon, title: displayTitle(t), icon: displayIcon(t), set: (m) => setMeta(id, m) },
    x,
    y,
  )
}

export function showMetaMenu(t: MetaTarget, x: number, y: number) {
  closeMenu()
  menu = document.createElement('div')
  menu.className = 'menu'
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`
  document.body.appendChild(menu)

  const item = (label: string, fn: () => void) => {
    const el = document.createElement('div')
    el.className = 'menu-item'
    el.textContent = label
    el.addEventListener('click', fn)
    menu!.appendChild(el)
  }

  // Replace menu content with a one-line input.
  const prompt = (label: string, value: string, apply: (v: string) => void) => {
    menu!.replaceChildren()
    const lbl = document.createElement('div')
    lbl.className = 'menu-label'
    lbl.textContent = label
    const input = document.createElement('input')
    input.className = 'menu-input'
    input.value = value
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        apply(input.value.trim())
        closeMenu()
      } else if (e.key === 'Escape') closeMenu()
    })
    menu!.append(lbl, input)
    input.focus()
    input.select()
  }

  item('Rename…', () => prompt('Title (empty = automatic)', t.customTitle ?? t.title, (v) => t.set({ title: v || null })))
  item('Set icon…', () => prompt('Emoji (empty = automatic)', t.customIcon ?? t.icon, (v) => t.set({ icon: v || null })))
  if (t.customTitle || t.customIcon) item('Reset title & icon', () => (t.set({ title: null, icon: null }), closeMenu()))

  // Keep inside window.
  const r = menu.getBoundingClientRect()
  if (r.right > window.innerWidth) menu.style.left = `${window.innerWidth - r.width - 4}px`
  if (r.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - r.height - 4}px`
}

export function initMenu() {
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (menu && !menu.contains(e.target as HTMLElement)) closeMenu()
    },
    true,
  )
  window.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu())
}
