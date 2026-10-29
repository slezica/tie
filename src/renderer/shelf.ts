// Shelf strip and template list in the toolbar: one icon per shelved tile; templates to spawn from.
import { inRevealZone, type TileId } from '@core/layout'
import { S, location, debug } from './state'
import { displayIcon, displayTitle } from './tile'
import { iconHtml } from './icons'
import { pin } from './ops'
import { render } from './render'
import { startDrag, isDragging } from './drag'
import { showTileMenu } from './menu'
import { TEMPLATES } from './kinds'

const items = new Map<TileId, HTMLElement>()

// Ghost slot: where a dragged tile or template would land (wysiwyg), in the strip at that slot.
const ghost = document.createElement('div')
ghost.className = 'item ghost'

export function initShelf() {
  const tpl = document.getElementById('templates')!
  // Templates (kinds/index.ts): the file template picks a file on drop.
  for (const t of TEMPLATES) {
    const el = document.createElement('div')
    el.className = 'template'
    el.dataset.kind = t.id
    el.title = t.label
    el.innerHTML = `<div class="ico">${iconHtml({ glyph: t.icon })}</div>`
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      startDrag(e, { type: 'template', template: t.id, label: t.label })
    })
    tpl.appendChild(el)
  }

  // A pin stays until released: item click, the title bar's Unpin, close, unshelve, `tie move` (SHELF.md).

  // Hover reveal: dismissed once the pointer leaves the item, the reveal and the band between
  // (core/layout inRevealZone). Over a frame or guest inside the reveal the UI gets no moves, but
  // it does on the way out (the tile's border is UI), so the last position is always known.
  // The document's pointerleave is checked the same way, not taken as "left the window": the
  // toolbar is a window drag region (-webkit-app-region), and macOS hands the pointer to the OS
  // there, which Chromium reports as leaving the document. The strip between the item and the
  // board is such a region, so the pointer "leaves" on its way into the reveal (SHELF.md).
  document.addEventListener('pointermove', (e) => keepReveal(e.clientX, e.clientY), true)
  document.documentElement.addEventListener('pointerleave', (e) => keepReveal(e.clientX, e.clientY))

  document.addEventListener('tile-meta', (e) => {
    const id = (e as CustomEvent).detail as TileId
    if (items.has(id)) updateItem(id)
  })
}

export function shelfItemEl(id: TileId): HTMLElement | undefined {
  return items.get(id)
}

// Show the ghost at visual slot `slot` (among the items shown: the dragged one is hidden) with the
// dragged thing's icon; the "+" hint slot gives way to it (CSS: #shelf.landing).
export function setShelfGhost(slot: number, icon: string) {
  const list = document.getElementById('shelf')!
  if (ghost.dataset.icon !== icon) (ghost.innerHTML = icon), (ghost.dataset.icon = icon)
  const kids = [...list.children].filter((e) => e !== ghost && !e.classList.contains('drag-source'))
  const before = kids[slot] ?? null
  if (ghost.parentElement !== list || ghost.nextSibling !== before) list.insertBefore(ghost, before)
  list.classList.add('landing')
}

export function clearShelfGhost() {
  ghost.remove()
  document.getElementById('shelf')!.classList.remove('landing')
}

// A shelf item being dragged is hidden: the ghost stands for it.
export function hideShelfItem(id: TileId | null) {
  for (const el of items.values()) el.classList.toggle('drag-source', el.dataset.id === id)
}

function keepReveal(x: number, y: number) {
  const id = S.revealed
  if (!id || isDragging()) return
  const item = items.get(id)?.getBoundingClientRect()
  const reveal = S.rects.get(id)
  if (item && reveal && inRevealZone(x, y, { x: item.x, y: item.y, w: item.width, h: item.height }, reveal)) return
  dismissReveal()
}

function dismissReveal() {
  debug('shelf', 'reveal dismissed', S.revealed)
  S.revealed = null
  render()
}

function createItem(id: TileId): HTMLElement {
  const el = document.createElement('div')
  el.className = 'item'
  el.dataset.id = id
  el.innerHTML = `<div class="ico"></div><span class="dot"></span><span class="ping"></span><span class="exit"></span>`
  el.addEventListener('pointerenter', () => {
    if (isDragging()) return
    S.revealed = id
    const t = S.tiles.get(id)
    if (t) t.activity = false
    render()
  })
  el.addEventListener('pointerleave', (e) => S.revealed === id && keepReveal(e.clientX, e.clientY))
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
  const icon = iconHtml(displayIcon(t))
  const title = displayTitle(t)
  const ico = el.querySelector('.ico') as HTMLElement
  if (ico.dataset.icon !== icon) (ico.innerHTML = icon), (ico.dataset.icon = icon)
  el.title = title // icon-only: the title is the tooltip
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
  const list = document.getElementById('shelf')!
  for (const [id, el] of items) {
    if (!S.shelf.includes(id)) {
      el.remove()
      items.delete(id)
    }
  }
  S.shelf.forEach((id, i) => {
    let el = items.get(id)
    if (!el) items.set(id, (el = createItem(id)))
    const kids = [...list.children].filter((e) => e !== ghost) // the ghost keeps its slot
    if (kids[i] !== el) list.insertBefore(el, kids[i] ?? null)
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
