// Shelf column: templates on top, shelved tile items below.
import type { TileId } from '@core/layout'
import { S, location, debug } from './state'
import { displayIcon, displayTitle, iconHtml } from './tile'
import { pin } from './ops'
import { render } from './render'
import { startDrag, isDragging } from './drag'
import { showTileMenu } from './menu'
import { templates } from './kinds'

const items = new Map<TileId, HTMLElement>()

export function initShelf() {
  const tpl = document.getElementById('templates')!
  // Kinds with a template (registry); 'file' kinds pick a file on drop.
  for (const { kind, template: t } of templates()) {
    const el = document.createElement('div')
    el.className = 'template'
    el.dataset.kind = kind
    el.innerHTML = `<div class="ico">${iconHtml(t!.icon)}</div><div class="lbl">${t!.label}</div>`
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      startDrag(e, { type: 'template', kind, label: t!.label })
    })
    tpl.appendChild(el)
  }

  // Unpin when clicking anywhere outside the pinned tile and its item.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!S.pinned) return
      const target = e.target as HTMLElement
      const tileEl = S.tiles.get(S.pinned)?.el
      if (tileEl?.contains(target) || shelfItemEl(S.pinned)?.contains(target)) return
      if (target.closest('.menu')) return
      debug('shelf', 'unpin (outside click)', S.pinned)
      pin(null)
    },
    true,
  )

  document.addEventListener('tile-meta', (e) => {
    const id = (e as CustomEvent).detail as TileId
    if (items.has(id)) updateItem(id)
  })
}

export function shelfItemEl(id: TileId): HTMLElement | undefined {
  return items.get(id)
}

function createItem(id: TileId): HTMLElement {
  const el = document.createElement('div')
  el.className = 'item'
  el.dataset.id = id
  el.innerHTML = `<div class="ico"></div><div class="lbl"></div><span class="dot"></span><span class="ping"></span><span class="exit"></span>`
  el.addEventListener('pointerenter', () => {
    if (isDragging()) return
    S.revealed = id
    const t = S.tiles.get(id)
    if (t) t.activity = false
    render()
  })
  el.addEventListener('pointerleave', () => {
    if (S.revealed !== id) return
    S.revealed = null
    render()
  })
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    startDrag(e, { type: 'tile', id }, () => {
      debug('shelf', 'click', id, 'pinned:', S.pinned)
      pin(S.pinned === id ? null : id)
    })
  })
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    showTileMenu(id, e.clientX, e.clientY)
  })
  return el
}

function updateItem(id: TileId) {
  const t = S.tiles.get(id)
  const el = items.get(id)
  if (!t || !el) return
  const icon = displayIcon(t)
  const title = displayTitle(t)
  const ico = el.querySelector('.ico') as HTMLElement
  if (ico.dataset.icon !== icon || !ico.innerHTML) (ico.innerHTML = iconHtml(icon)), (ico.dataset.icon = icon)
  const lbl = el.querySelector('.lbl') as HTMLElement
  if (lbl.textContent !== title) lbl.textContent = title
  el.title = title
  el.classList.toggle('activity', t.activity)
  el.classList.toggle('pinged', t.pinged)
  el.classList.toggle('pinned', S.pinned === id)
  el.classList.toggle('revealed', S.revealed === id)
  const exit = el.querySelector('.exit') as HTMLElement
  exit.textContent = t.exit === null ? '' : t.exit === 0 ? '✓' : '✗'
  exit.className = `exit ${t.exit === null ? '' : t.exit === 0 ? 'ok' : 'fail'}`
}

// Keyed reconcile so hovered elements survive re-renders.
export function syncShelf() {
  const list = document.getElementById('items')!
  for (const [id, el] of items) {
    if (!S.shelf.includes(id)) {
      el.remove()
      items.delete(id)
    }
  }
  S.shelf.forEach((id, i) => {
    let el = items.get(id)
    if (!el) items.set(id, (el = createItem(id)))
    if (list.children[i] !== el) list.insertBefore(el, list.children[i] ?? null)
    updateItem(id)
  })
}

// Mark activity on shelved, hidden tiles; only re-render on flip.
export function noteActivity(id: TileId) {
  const t = S.tiles.get(id)
  if (!t || t.activity || location(id) !== 'shelved' || S.revealed === id || S.pinned === id) return
  t.activity = true
  updateItem(id)
}
