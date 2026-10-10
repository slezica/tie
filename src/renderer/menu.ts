// HTML context menu (not native, so Playwright can drive it).
import type { TileId } from '@core/layout'
import { S } from './state'
import { setMeta } from './ops'
import { displayTitle, displayIcon } from './tile'

let menu: HTMLElement | null = null

export function closeMenu() {
  menu?.remove()
  menu = null
}

export function showTileMenu(id: TileId, x: number, y: number) {
  closeMenu()
  const t = S.tiles.get(id)
  if (!t) return
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

  item('Rename…', () => prompt('Title (empty = automatic)', t.customTitle ?? displayTitle(t), (v) => setMeta(id, { title: v || null })))
  item('Set icon…', () => prompt('Emoji (empty = automatic)', t.customIcon ?? displayIcon(t), (v) => setMeta(id, { icon: v || null })))
  if (t.customTitle || t.customIcon) item('Reset title & icon', () => (setMeta(id, { title: null, icon: null }), closeMenu()))

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
