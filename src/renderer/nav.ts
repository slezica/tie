// Navigation bar: back / forward / reload + location, a compact row under the title bar of tiles
// whose kind navigates (Surface.nav). Hidden for kinds without it (terminals). Keys: cmd+[ / cmd+]
// / cmd+R / cmd+L (keymap: @core/keymap). docs/TILES.md "Navigation".
import { debug, type Tile } from './state'
import { ICON } from './icons'
import { refocus } from './ops'

export interface NavState {
  location: string // shown in the bar (file path, URL)
  back: boolean // can go back
  forward: boolean
  editable: boolean // location takes input (go)
}

// What a navigating kind offers the host.
export interface Nav {
  state(): NavState
  back(): void
  forward(): void
  reload(): void
  go?(input: string): void // editable location only
}

// The bar for a tile whose surface has `nav` (tile.ts, at creation).
export function createNavBar(t: Tile) {
  const nav = t.surface.nav
  if (!nav) return
  const bar = document.createElement('div')
  bar.className = 'navbar'
  bar.innerHTML = `
    <button class="nav-btn" data-nav="back" tabindex="-1" title="Back (⌘[)">${ICON.back}</button>
    <button class="nav-btn" data-nav="forward" tabindex="-1" title="Forward (⌘])">${ICON.forward}</button>
    <button class="nav-btn" data-nav="reload" tabindex="-1" title="Reload (⌘R)">${ICON.reload}</button>
    <input class="location" spellcheck="false" tabindex="-1" />
  `
  t.el.querySelector('.titlebar')!.after(bar)
  // Buttons never take focus (keys stay with the tile's content).
  bar.addEventListener('mousedown', (e) => (e.target as Element).closest('.nav-btn') && e.preventDefault())
  bar.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.nav-btn')
    if (!b || (b as HTMLButtonElement).disabled) return
    navAction(t, b.dataset.nav as 'back' | 'forward' | 'reload')
  })
  const input = bar.querySelector('.location') as HTMLInputElement
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== 'Escape') return
    if (e.key === 'Enter' && nav.go && nav.state().editable) nav.go(input.value)
    input.blur()
    refocus()
  })
  input.addEventListener('blur', () => (input.value = nav.state().location))
  refreshNav(t)
}

export function refreshNav(t: Tile) {
  const nav = t.surface.nav
  const bar = t.el.querySelector('.navbar')
  if (!nav || !bar) return
  const s = nav.state()
  ;(bar.querySelector('[data-nav="back"]') as HTMLButtonElement).disabled = !s.back
  ;(bar.querySelector('[data-nav="forward"]') as HTMLButtonElement).disabled = !s.forward
  const input = bar.querySelector('.location') as HTMLInputElement
  input.readOnly = !s.editable
  input.title = s.location
  if (document.activeElement === input) return
  input.value = s.location
  if (!s.editable) input.scrollLeft = input.scrollWidth // paths: the file name end matters most
}

export function navAction(t: Tile, a: 'back' | 'forward' | 'reload') {
  debug('nav', a, t.id)
  t.surface.nav?.[a]()
}

// cmd+L: the location field, when the kind takes input there. Else nothing.
export function focusLocation(t: Tile) {
  const input = t.el.querySelector<HTMLInputElement>('.navbar .location')
  if (!input || !t.surface.nav?.state().editable) return
  input.focus()
  input.select()
}
