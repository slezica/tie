// Shelf strip and template list, each in its bar (bars.ts): one icon per shelved tile; templates to
// spawn from. In a vertical bar: one per row, icons scaled (narrow) or with titles (list; style.css).
import { inRevealZone, type TileId } from '@core/layout'
import { S, location, debug } from './state'
import { displayIcon, displayTitle } from './tile'
import { iconHtml } from './icons'
import { pin, toggleSelected, clearSelection, selection, unshelveGroup } from './ops'
import { render } from './render'
import { startDrag, isDragging } from './drag'
import { showTileMenu, showListMenu, menuOpen, type MenuEntry } from './menu'
import { requestCloseGroup } from './close'
import { moveGroupToTab, tabTitle } from './tabs'
import { TEMPLATES } from './kinds'
import { verticalComponent } from './bars'
import { sideWheel, syncFades } from './overflow'

const items = new Map<TileId, HTMLElement>()

// Ghost slots: where a dragged tile, template or group would land (wysiwyg), in the strip from that
// slot on: one per tile (a group: its icons, in order).
const ghosts: HTMLElement[] = []
const isGhost = (e: Element) => e.classList.contains('ghost')

export function initShelf() {
  const tpl = document.getElementById('templates')!
  // Templates (kinds/index.ts): the file template picks a file on drop.
  for (const t of TEMPLATES) {
    const el = document.createElement('div')
    el.className = 'template'
    el.dataset.kind = t.id
    el.title = t.label
    el.innerHTML = `<div class="ico">${iconHtml({ glyph: t.icon })}</div><span class="lbl"></span>`
    el.querySelector('.lbl')!.textContent = t.label // list form (vertical bars)
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
  // bars are window drag regions (-webkit-app-region), and macOS hands the pointer to the OS
  // there, which Chromium reports as leaving the document. The strip between the item and the
  // board is such a region, so the pointer "leaves" on its way into the reveal (SHELF.md).
  document.addEventListener('pointermove', (e) => keepReveal(e.clientX, e.clientY), true)
  document.documentElement.addEventListener('pointerleave', (e) => keepReveal(e.clientX, e.clientY))

  initSelection()

  // Overflow (SHELF.md "Space"): fades at the cut ends; a vertical wheel scrolls a horizontal strip.
  const strip = document.getElementById('shelf')!
  strip.addEventListener('scroll', syncShelfFades)
  sideWheel(strip, () => verticalComponent('shelf'))

  document.addEventListener('tile-meta', (e) => {
    const id = (e as CustomEvent).detail as TileId
    if (items.has(id)) updateItem(id)
  })
}

export function shelfItemEl(id: TileId): HTMLElement | undefined {
  return items.get(id)
}

// Show ghosts from visual slot `slot` (among the items shown: dragged ones are hidden), one per
// icon; the "+" hint slot gives way to them (CSS: #shelf.landing).
export function setShelfGhost(slot: number, icons: string[]) {
  const list = document.getElementById('shelf')!
  while (ghosts.length < icons.length) ghosts.push(Object.assign(document.createElement('div'), { className: 'item ghost' }))
  for (const g of ghosts.splice(icons.length)) g.remove()
  ghosts.forEach((g, i) => {
    if (g.dataset.icon !== icons[i]) (g.innerHTML = icons[i]), (g.dataset.icon = icons[i])
  })
  const kids = [...list.children].filter((e) => !isGhost(e) && !e.classList.contains('drag-source'))
  let before: Element | null = kids[slot] ?? null
  for (let i = ghosts.length - 1; i >= 0; i--) {
    const g = ghosts[i]
    if (g.parentElement !== list || g.nextElementSibling !== before) list.insertBefore(g, before)
    before = g
  }
  list.classList.add('landing')
  syncShelfFades()
}

export function clearShelfGhost() {
  for (const g of ghosts) g.remove()
  document.getElementById('shelf')!.classList.remove('landing')
  syncShelfFades()
}

const syncShelfFades = () => void syncFades(document.getElementById('shelf')!, verticalComponent('shelf'))

// Shelf items being dragged are hidden: the ghosts (or the "+" hint, as wide) stand for them.
export function hideShelfItems(ids: TileId[]) {
  for (const el of items.values()) el.classList.toggle('drag-source', ids.includes(el.dataset.id!))
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

// Selection (SHELF.md "Selection"): cmd+click on items (createItem); the rest de-selects. Capture
// phase: before the thing clicked acts. A click on a tile reaches here too; one inside a frame or
// guest doesn't, but it activates the tile (frame.ts), and activating clears the selection (ops).
function initSelection() {
  const editing = (el: Element | null) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable)
  const modal = () => !!document.querySelector('.settings, .dialog-backdrop') // dialogs, the picker, settings
  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as HTMLElement
      if (!S.selected.size || e.button !== 0 || t.closest('.menu, .dialog-backdrop, .settings')) return // right button: contextmenu below
      const item = t.closest('#shelf .item') as HTMLElement | null
      if (item && (e.metaKey || e.ctrlKey)) return // cmd+click toggles (createItem); ctrl+click is a right-click
      if (item && S.selected.has(item.dataset.id!)) return // a press on a selected item: drag = the group, click = de-select (createItem)
      clearSelection()
    },
    true,
  )
  // Context menu on anything but a selected item: de-select (that thing's own menu follows).
  document.addEventListener(
    'contextmenu',
    (e) => {
      const id = ((e.target as HTMLElement).closest('#shelf .item') as HTMLElement | null)?.dataset.id
      if (S.selected.size && !(id && S.selected.has(id))) clearSelection()
    },
    true,
  )
  // Escape, unless a menu, a modal, a drag or a text field uses it. With a selection nothing is
  // active, so no terminal or frame is waiting for it.
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !S.selected.size || menuOpen() || modal() || isDragging() || editing(document.activeElement)) return
      e.stopPropagation()
      clearSelection({ restore: true })
    },
    true,
  )
}

// Right-click on a selected item: the selection's actions, in shelf order (read when chosen: a tile
// may have left meanwhile). The selection stays while the menu is open.
function showGroupMenu(x: number, y: number) {
  const n = selection().length
  const tiles = n === 1 ? '1 tile' : `${n} tiles`
  const tabs = (): MenuEntry[] => [
    ...S.spaces.map((sp, i) => ({ sp, i })).filter(({ sp }) => sp.id !== S.visible).map(({ sp, i }) => ({ label: `${i + 1} · ${tabTitle(sp)}`, run: () => moveGroupToTab(selection(), sp.id) })),
    { label: 'New tab', run: () => moveGroupToTab(selection(), null) },
  ]
  showListMenu(
    [
      { label: `Unshelve ${tiles}`, run: () => unshelveGroup(selection()) },
      { label: `Move ${n} to tab ▸`, sub: tabs },
      {
        label: `Close ${tiles}`,
        run: () => {
          const group = selection()
          clearSelection()
          void requestCloseGroup(group)
        },
      },
    ],
    x,
    y,
  )
}

function createItem(id: TileId): HTMLElement {
  const el = document.createElement('div')
  el.className = 'item'
  el.dataset.id = id
  el.innerHTML = `<div class="ico"></div><span class="lbl"></span><span class="dot"></span><span class="ping"></span><span class="exit"></span>`
  el.addEventListener('pointerenter', (e) => {
    if (isDragging() || e.metaKey) return // cmd held: selecting, not looking
    S.revealed = id
    const t = S.tiles.get(id)
    if (t) t.activity = false
    render()
  })
  el.addEventListener('pointerleave', (e) => S.revealed === id && keepReveal(e.clientX, e.clientY))
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    // The click arrives on release (startDrag): modifiers as at the press.
    const meta = e.metaKey
    startDrag(e, { type: 'tile', id }, () => {
      debug('shelf', 'click', id, 'meta:', meta, 'pinned:', S.pinned)
      if (meta) return toggleSelected(id)
      clearSelection() // a plain click on a selected item (initSelection left it to here)
      pin(S.pinned === id ? null : id)
    })
  })
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    if (S.selected.has(id)) showGroupMenu(e.clientX, e.clientY)
    else showTileMenu(id, e.clientX, e.clientY) // de-selected already (initSelection)
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
  el.title = title // icon-only (horizontal, narrow): the title is the tooltip
  const lbl = el.querySelector('.lbl') as HTMLElement
  if (lbl.textContent !== title) lbl.textContent = title // list form (vertical bars)
  el.classList.toggle('activity', t.activity)
  el.classList.toggle('pinged', t.pinged)
  el.classList.toggle('pinned', S.pinned === id)
  el.classList.toggle('revealed', S.revealed === id)
  el.classList.toggle('selected', S.selected.has(id))
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
    const kids = [...list.children].filter((e) => !isGhost(e)) // the ghosts keep their slots
    if (kids[i] !== el) list.insertBefore(el, kids[i] ?? null)
    updateItem(id)
  })
  syncShelfFades()
}

// Mark activity on shelved, hidden tiles; only re-render on flip.
export function noteActivity(id: TileId) {
  const t = S.tiles.get(id)
  if (!t || t.activity || location(id) !== 'shelved' || S.revealed === id || S.pinned === id) return
  t.activity = true
  updateItem(id)
}
