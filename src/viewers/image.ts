// Image viewer: the pipeline only (runtime.ts: handshake, theme, keys, guards). The file is an <img>
// from the tile's own token (CSP img-src); SVG too: as an image it never runs scripts or loads
// anything. Fit to the tile (shrink only) or actual size: click or `z` toggles. Changes on disk:
// reloaded (cache-busted by revision), swapped in once decoded (no flash). docs/VIEWERS.md "Image".
import { startViewer, type Message } from './runtime'

const img = document.getElementById('img') as HTMLImageElement
const info = document.getElementById('info')!
const msg = document.getElementById('msg')!

const state = startViewer(
  { name: 'image', onMessage, keys: { z: () => toggle() } },
  { rev: '', key: '', src: '', mode: 'fit' as 'fit' | 'actual', natural: { w: 0, h: 0 }, loads: 0, errors: 0 },
)

function showInfo() {
  const { w, h } = state.natural
  if (!w) return void (info.textContent = '')
  const shown = img.getBoundingClientRect().width
  const pct = Math.round((shown / w) * 100)
  info.textContent = `${w} × ${h}` + (state.mode === 'fit' && pct < 100 ? ` · ${pct}%` : '')
}

// Fit ↔ actual size. From a click: the point under the pointer stays under it.
function toggle(at?: { x: number; y: number }) {
  const r = img.getBoundingClientRect()
  const fx = at && r.width ? (at.x - r.left) / r.width : 0.5
  const fy = at && r.height ? (at.y - r.top) / r.height : 0.5
  state.mode = state.mode === 'fit' ? 'actual' : 'fit'
  document.body.className = state.mode
  if (state.mode === 'actual') {
    const n = img.getBoundingClientRect()
    scrollTo({ left: scrollX + n.left + fx * n.width - (at?.x ?? innerWidth / 2), top: scrollY + n.top + fy * n.height - (at?.y ?? innerHeight / 2), behavior: 'instant' })
  }
  showInfo()
}

img.addEventListener('click', (e) => toggle({ x: e.clientX, y: e.clientY }))
addEventListener('resize', showInfo)

// Load `url` off-screen, then swap it in (the old image stays until the new one is decoded).
let seq = 0
async function load(url: string) {
  const n = ++seq
  const pre = new Image()
  pre.src = url
  try {
    await pre.decode()
  } catch {
    if (n !== seq) return
    state.errors++
    img.classList.add('broken')
    msg.classList.add('on')
    state.natural = { w: 0, h: 0 }
    return showInfo()
  }
  if (n !== seq) return
  img.src = url
  img.classList.remove('broken')
  msg.classList.remove('on')
  state.natural = { w: pre.naturalWidth, h: pre.naturalHeight }
  state.loads++
  showInfo()
}

type Doc = { type: 'doc'; key: string; rev: string; src: string }

function onMessage(m: Message) {
  if (m.type !== 'doc') return
  const d = m as unknown as Doc
  if (typeof d.src !== 'string' || !d.src.startsWith('/')) return
  state.key = d.key
  state.rev = d.rev
  state.src = d.src
  // Own token only (the CSP allows nothing else anyway); the revision busts the image cache.
  void load(`${location.protocol}//${location.host}${d.src}?v=${encodeURIComponent(d.rev)}`)
}
