// State → DOM. Positions every tile absolutely in window coords; never re-parents.
import { compute, parentDir, type Rect, type TileId } from '@core/layout'
import { S, squashed, layoutOpts, TITLE, PEAK, boardRect, revealSize, readGeometry, withSpace, spaceOf, type Tile } from './state'
import { barOfComponent } from './bars'
import { renderTabs } from './tabs'
import { ICON } from './icons'
import { canCollapse, clampFloat } from './ops'
import { syncShelf, shelfItemEl } from './shelf'
import { attachBorder, setBorder } from './drag'
import { applySizes } from './barsize'

// Tiles of background spaces: display:none (their terminals skip fitting while hidden).
function hideOtherSpaces() {
  for (const [id, t] of S.tiles) {
    const here = spaceOf(id)?.id === S.visible
    t.el.style.display = here ? '' : 'none'
  }
}

const Z = { slotted: 1, border: 5, floating: 10, zoomed: 1000, reveal: 2000 }

function setRect(el: HTMLElement, r: Rect) {
  el.style.left = `${r.x}px`
  el.style.top = `${r.y}px`
  el.style.width = `${r.w}px`
  el.style.height = `${r.h}px`
}

// pin: shelved and shown (hover reveal → Pin, pinned → Unpin); off the shelf, hidden.
function setButtons(t: Tile, opts: { collapse: boolean; zoom: boolean; pin?: 'pin' | 'unpin' }) {
  const c = t.el.querySelector('.btn.collapse') as HTMLElement
  const z = t.el.querySelector('.btn.zoom') as HTMLElement
  const p = t.el.querySelector('.btn.pin') as HTMLElement
  c.style.display = opts.collapse ? '' : 'none'
  z.style.display = opts.zoom ? '' : 'none'
  p.style.display = opts.pin ? '' : 'none'
  if (opts.pin && p.dataset.state !== opts.pin) {
    p.innerHTML = ICON[opts.pin]
    p.title = opts.pin === 'pin' ? 'Pin' : 'Unpin'
    p.dataset.state = opts.pin
  }
  const collapsed = S.collapsed.has(t.id)
  // Arrows along the axis the tile shrinks on: row split → horizontal; col split or floating → vertical.
  const across = parentDir(S.tree, t.id) === 'row'
  const ci = collapsed ? (across ? ICON.expand : ICON.expandV) : across ? ICON.collapse : ICON.collapseV
  if (c.dataset.icon !== ci) (c.innerHTML = ci), (c.dataset.icon = ci)
  const zi = S.zoomed === t.id ? ICON.unzoom : ICON.zoom
  if (z.dataset.icon !== zi) (z.innerHTML = zi), (z.dataset.icon = zi)
}

// Always renders the visible space, even when called from an op running in another (withSpace).
export function render() {
  withSpace(S.visible, renderVisible)
}

function renderVisible() {
  applySizes() // bar sizes within the window's limits (a resize may clamp a vertical bar): before the geometry
  readGeometry()
  hideOtherSpaces()
  renderTabs()
  const b = boardRect()
  const layout = compute(S.tree, b, layoutOpts())
  S.rects.clear()

  const place = (id: TileId, r: Rect, z: number, cls: Record<string, boolean>) => {
    const t = S.tiles.get(id)
    if (!t) return
    setRect(t.el, r)
    t.el.style.zIndex = String(z)
    t.el.className = 'tile ' + Object.keys(cls).filter((k) => cls[k]).join(' ') + (t.pinged ? ' pinged' : '')
    S.rects.set(id, r)
  }

  // Slotted. Zoomed: the layout gives it the board, the others squashed to bars; floats stay above.
  for (const [id, r] of layout.tiles) {
    place(id, r, Z.slotted, {
      slotted: true,
      zoomed: S.zoomed === id,
      active: S.active === id,
      'collapsed-h': r.collapsed === 'horizontal',
      'collapsed-v': r.collapsed === 'vertical',
    })
    setButtons(S.tiles.get(id)!, { collapse: !squashed(id) && (canCollapse(id) || S.collapsed.has(id)), zoom: true })
  }

  // Floating, clamped into the board (it may have shrunk).
  S.floats.forEach((f, i) => {
    Object.assign(f, clampFloat(f))
    const zoomed = S.zoomed === f.id
    const collapsed = S.collapsed.has(f.id) && !zoomed
    const r = zoomed ? b : { x: b.x + f.x, y: b.y + f.y, w: f.w, h: collapsed ? TITLE : f.h }
    place(f.id, r, zoomed ? Z.zoomed : Z.floating + i, {
      floating: true,
      zoomed,
      active: S.active === f.id,
      'collapsed-h': collapsed,
    })
    setButtons(S.tiles.get(f.id)!, { collapse: true, zoom: true })
  })

  // Shelf strip, then reveals next to their items, toward the board, by the shelf's bar: below the
  // item (top bar), above it (bottom), right of it (left bar), left of it (right bar). Centred on the
  // item along the bar, clamped into the board; against the board edge by the bar, --peak + 2 px in.
  syncShelf()
  const size = revealSize()
  const side = barOfComponent('shelf')
  const v = side === 'left' || side === 'right'
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi))
  const peak = document.getElementById('peak')!
  peak.style.display = 'none'
  for (const id of S.shelf) {
    const item = shelfItemEl(id)
    const ir = item?.getBoundingClientRect()
    const cx = ir ? ir.left + ir.width / 2 : b.x + b.w / 2
    const cy = ir ? ir.top + ir.height / 2 : b.y + b.h / 2
    const x = v ? (side === 'left' ? b.x + PEAK + 2 : b.x + b.w - PEAK - size.w - 2) : clamp(cx - size.w / 2, b.x, b.x + b.w - size.w)
    const y = v ? clamp(cy - size.h / 2, b.y, b.y + b.h - size.h) : side === 'top' ? b.y + PEAK + 2 : b.y + b.h - PEAK - size.h - 2
    const pinned = S.pinned === id
    const shown = pinned || S.revealed === id
    place(id, { x, y, ...size }, Z.reveal + (S.revealed === id ? 1 : 0), {
      shelved: true,
      revealed: shown,
      pinned,
      active: S.active === id,
    })
    setButtons(S.tiles.get(id)!, { collapse: false, zoom: false, pin: pinned ? 'unpin' : shown ? 'pin' : undefined })
    if (shown && (S.revealed === id || !S.revealed)) {
      // Sticks out of the reveal's edge facing the item, level with it (kept on the reveal's edge).
      const at = v ? clamp(cy, y + PEAK, y + size.h - PEAK) : clamp(cx, x + PEAK, x + size.w - PEAK)
      Object.assign(peak.style, {
        display: 'block',
        left: `${v ? (side === 'left' ? x - PEAK : x + size.w) : at - PEAK}px`,
        top: `${v ? at - PEAK : side === 'top' ? y - PEAK : y + size.h}px`,
        width: `${v ? PEAK : PEAK * 2}px`,
        height: `${v ? PEAK * 2 : PEAK}px`,
        zIndex: String(Z.reveal + 2),
      })
      peak.classList.toggle('pinned', pinned)
      peak.classList.toggle('up', side === 'top')
      peak.classList.toggle('left', side === 'left')
      peak.classList.toggle('right', side === 'right')
    }
  }

  // Border handles between slotted siblings, keyed so a drag keeps its pointer capture.
  const borders = document.getElementById('borders')!
  const keep = new Set<string>()
  if (!S.zoomed) {
    for (const br of layout.borders) {
      const key = `${br.path.join('.')}:${br.index}:${br.dir}`
      keep.add(key)
      let h = borders.querySelector<HTMLElement>(`[data-key="${key}"]`)
      if (!h) {
        h = document.createElement('div')
        h.className = `border ${br.dir}`
        h.dataset.key = key
        h.style.zIndex = String(Z.border)
        attachBorder(h)
        borders.appendChild(h)
      }
      setBorder(h, br)
      setRect(h, br.rect)
    }
  }
  for (const h of [...borders.children] as HTMLElement[]) if (!keep.has(h.dataset.key!)) h.remove()

  document.body.classList.toggle('empty', !S.tree && S.floats.length === 0)
}

// Dev (--hot): CSS edits re-layout immediately.
if (import.meta.hot) import.meta.hot.on('vite:afterUpdate', () => render())
