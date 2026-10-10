// State → DOM. Positions every tile absolutely in window coords; never re-parents.
import { compute, type Rect, type TileId } from '@core/layout'
import { S, GAP, TITLE, PEAK, boardRect, shelfRect, revealSize, type Tile } from './state'
import { ICON } from './icons'
import { canCollapse, clampFloat } from './ops'
import { syncShelf, shelfItemEl } from './shelf'
import { attachBorder, setBorder } from './drag'

const Z = { slotted: 1, border: 5, floating: 10, zoomed: 1000, reveal: 2000 }

function setRect(el: HTMLElement, r: Rect) {
  el.style.left = `${r.x}px`
  el.style.top = `${r.y}px`
  el.style.width = `${r.w}px`
  el.style.height = `${r.h}px`
}

function setButtons(t: Tile, opts: { collapse: boolean; zoom: boolean }) {
  const c = t.el.querySelector('.btn.collapse') as HTMLElement
  const z = t.el.querySelector('.btn.zoom') as HTMLElement
  c.style.display = opts.collapse ? '' : 'none'
  z.style.display = opts.zoom ? '' : 'none'
  const collapsed = S.collapsed.has(t.id)
  const ci = collapsed ? ICON.expand : ICON.collapse
  if (c.dataset.icon !== ci) (c.innerHTML = ci), (c.dataset.icon = ci)
  const zi = S.zoomed === t.id ? ICON.unzoom : ICON.zoom
  if (z.dataset.icon !== zi) (z.innerHTML = zi), (z.dataset.icon = zi)
}

export function render() {
  const b = boardRect()
  const layout = compute(S.tree, b, { gap: GAP, bar: TITLE, collapsed: S.collapsed })
  S.rects.clear()

  const place = (id: TileId, r: Rect, z: number, cls: Record<string, boolean>) => {
    const t = S.tiles.get(id)
    if (!t) return
    setRect(t.el, r)
    t.el.style.zIndex = String(z)
    t.el.className = 'tile ' + Object.keys(cls).filter((k) => cls[k]).join(' ')
    S.rects.set(id, r)
  }

  // Slotted.
  for (const [id, r] of layout.tiles) {
    const zoomed = S.zoomed === id
    place(id, zoomed ? b : r, zoomed ? Z.zoomed : Z.slotted, {
      slotted: true,
      zoomed,
      active: S.active === id,
      'collapsed-h': !zoomed && r.collapsed === 'horizontal',
      'collapsed-v': !zoomed && r.collapsed === 'vertical',
    })
    setButtons(S.tiles.get(id)!, { collapse: canCollapse(id) || S.collapsed.has(id), zoom: true })
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

  // Shelf column, then reveals positioned next to their items.
  syncShelf()
  const sr = shelfRect()
  const size = revealSize()
  const peak = document.getElementById('peak')!
  peak.style.display = 'none'
  for (const id of S.shelf) {
    const item = shelfItemEl(id)
    const ir = item?.getBoundingClientRect()
    const cy = ir ? ir.top + ir.height / 2 : b.y + b.h / 2
    const x = sr.x - PEAK - size.w - 2
    const y = Math.max(b.y, Math.min(cy - size.h / 2, b.y + b.h - size.h))
    const pinned = S.pinned === id
    const shown = pinned || S.revealed === id
    place(id, { x, y, ...size }, Z.reveal + (S.revealed === id ? 1 : 0), {
      shelved: true,
      revealed: shown,
      pinned,
      active: S.active === id,
    })
    setButtons(S.tiles.get(id)!, { collapse: false, zoom: false })
    if (shown && (S.revealed === id || !S.revealed)) {
      peak.style.display = 'block'
      peak.style.left = `${x + size.w}px` // sticks out of the reveal's right edge
      peak.style.top = `${cy - PEAK}px`
      peak.style.zIndex = String(Z.reveal + 2)
      peak.classList.toggle('pinned', pinned)
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
