// Tile host: element, title bar, nav bar (nav.ts), error state, lifecycle. The body belongs to the tile's kind
// (kinds/). Elements live in one layer and are never re-parented.
import { ICON } from './icons'
import { S, type Tile, type Kind, newId, debug } from './state'
import { kindSpec, type Host, type OpenOpts } from './kinds'
import { noteActivity } from './shelf'
import { closeTile } from './ops'
import { createNavBar, refreshNav } from './nav'

export function displayTitle(t: Tile): string {
  return t.customTitle || t.surface.title()
}

export function displayIcon(t: Tile): string {
  return t.customIcon || t.surface.icon()
}

// Icons are user text (CLI, menu): escaped, never markup.
export function iconHtml(icon: string): string {
  const esc = icon.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return icon ? `<span class="emoji">${esc}</span>` : `<span class="glyph">&gt;_</span>`
}

export function createTile(kind: Kind, opts: OpenOpts = {}): Tile {
  const factory = kindSpec(kind)?.factory
  if (!factory) throw new Error(`unknown kind: ${kind}`)
  const id = newId()
  const el = document.createElement('div')
  el.className = 'tile'
  el.dataset.id = id
  el.dataset.kind = kind
  el.innerHTML = `
    <div class="titlebar">
      <span class="icon"></span>
      <span class="tile-dot"></span>
      <span class="title"></span>
      <span class="status"></span>
      <span class="spacer"></span>
      <button class="btn pill" hidden></button>
      <button class="btn collapse" title="Collapse">${ICON.collapse}</button>
      <button class="btn zoom" title="Zoom">${ICON.zoom}</button>
      <button class="btn close" title="Close">${ICON.close}</button>
    </div>
    <div class="body"></div>
    <div class="link-strip" hidden></div>
    ${['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((d) => `<div class="rz ${d}" data-dir="${d}"></div>`).join('')}
  `
  document.getElementById('tiles')!.appendChild(el)
  const body = el.querySelector('.body') as HTMLElement

  const tile = { id, kind, exit: null, activity: false, pinged: false, el, body, customTitle: opts.title } as Omit<Tile, 'surface'> as Tile
  const host: Host = {
    id,
    body,
    alive: () => S.tiles.get(id) === tile,
    changed: () => host.alive() && refreshTitle(tile),
    activity: () => noteActivity(id),
    exit: (code) => {
      tile.exit = code
      refreshTitle(tile)
    },
    error: (message) => showError(tile, message),
    close: () => host.alive() && closeTile(id),
    // SECURITY: the strip lives in the UI, over the body: content can't draw the real one. Text only.
    hint: (text) => {
      const strip = el.querySelector('.link-strip') as HTMLElement
      strip.textContent = text ?? ''
      strip.hidden = !text
    },
  }
  S.tiles.set(id, tile)
  tile.surface = factory(host, opts)
  createNavBar(tile) // kinds that navigate (Surface.nav)
  refreshTitle(tile)
  return tile
}

// Start the kind's content once the element has a size; then follow body resizes.
export async function mountTile(t: Tile) {
  await t.surface.mount()
  if (S.tiles.get(t.id) !== t || t.error) return
  new ResizeObserver(() => t.surface.resize()).observe(t.body)
}

export function refreshTitle(t: Tile) {
  const title = displayTitle(t)
  ;(t.el.querySelector('.title') as HTMLElement).textContent = title
  ;(t.el.querySelector('.icon') as HTMLElement).innerHTML = iconHtml(displayIcon(t))
  ;(t.el.querySelector('.status') as HTMLElement).textContent = t.exit === null ? '' : t.exit === 0 ? '✓' : `✗ ${t.exit}`
  const pill = t.el.querySelector('.pill') as HTMLButtonElement
  pill.hidden = !t.surface.pill
  if (t.surface.pill) {
    pill.textContent = t.surface.pill.label()
    pill.title = t.surface.pill.title()
    pill.classList.toggle('on', t.surface.pill.on())
  }
  refreshNav(t)
  document.dispatchEvent(new CustomEvent('tile-meta', { detail: t.id }))
}

// Error state: centered message replaces the tile's content; the tile stays open.
export function showError(t: Tile, message: string) {
  t.error = message
  debug('app', 'tile error', t.id, message)
  const el = document.createElement('div')
  el.className = 'tile-error'
  el.innerHTML = `<div class="word">Error</div><div class="msg"></div>`
  ;(el.querySelector('.msg') as HTMLElement).textContent = message
  t.body.appendChild(el)
  refreshTitle(t)
}

export function disposeTile(t: Tile) {
  t.surface.dispose()
  t.el.remove()
  S.tiles.delete(t.id)
}
