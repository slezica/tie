// Hex viewer: the pipeline only (runtime.ts: handshake, theme, keys, guards). Any file as bytes
// (transferred over the port, never a string): offset | 16 bytes | ASCII. Virtualized: only the
// rows in view (plus a margin) exist; very large files map the scroll position proportionally
// (layout height capped). Changes on disk: redrawn in place, changed rows highlighted for a while.
// docs/VIEWERS.md "Hex".
import { startViewer, type Message } from './runtime'

const COLS = 16
const OVER = 10 // rows drawn beyond the view, each way
const MAX_PX = 16_000_000 // layout height cap (Chromium's limit is ~33M px)
const CHANGED_MS = 4000

const space = document.getElementById('space')!
const rows = document.getElementById('rows')!

let bytes: Uint8Array = new Uint8Array(0)
let changed = new Set<number>()
let changedTimer: ReturnType<typeof setTimeout> | null = null

const state = startViewer(
  { name: 'hex', onMessage, onTheme: () => draw() },
  {
    rev: '',
    key: '',
    get size() {
      return bytes.length
    },
    first: 0, // first row in view
    drawn: 0, // rows in the DOM
    rowH: 0,
    get changed() {
      return changed.size
    },
    draws: 0,
    scrolls: new Map<string, number>(),
  },
)

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))
// Printable ASCII as itself (HTML-escaped), everything else as a (dim) dot: no byte is ever markup.
const ASCII = Array.from({ length: 256 }, (_, i) => (i < 0x20 || i >= 0x7f ? '<span class="z">.</span>' : i === 0x26 ? '&amp;' : i === 0x3c ? '&lt;' : i === 0x3e ? '&gt;' : String.fromCharCode(i)))

function row(i: number): string {
  const off = i * COLS
  let h = ''
  let a = ''
  for (let j = 0; j < COLS; j++) {
    const k = off + j
    if (k < bytes.length) {
      const b = bytes[k]
      h += b ? HEX[b] : '<span class="z">00</span>'
      a += ASCII[b]
    } else h += '  '
    if (j < COLS - 1) h += j === 7 ? '  ' : ' '
  }
  return `<div class="r${changed.has(i) ? ' changed' : ''}"><span class="o">${off.toString(16).padStart(8, '0')}</span>  <span class="h">${h}</span>  <span class="a">${a}</span></div>`
}

// Row height: the root line height (font and size from the theme), rounded to whole pixels and set
// on every row (--rh), so row positions computed here match the layout exactly.
function rowHeight(): number {
  const h = Math.round(parseFloat(getComputedStyle(document.documentElement).lineHeight)) || 18
  document.documentElement.style.setProperty('--rh', `${h}px`)
  return h
}

function draw() {
  state.draws++
  const total = Math.ceil(bytes.length / COLS)
  if (!total) {
    space.style.height = ''
    rows.style.transform = ''
    rows.innerHTML = '<div id="empty">(empty file)</div>'
    state.drawn = state.first = 0
    return
  }
  const rh = (state.rowH = rowHeight())
  const height = Math.min(total * rh, MAX_PX)
  space.style.height = `${Math.round(height)}px`
  // Scroll fraction → row at the top of the view (exact when the height isn't capped).
  const vis = innerHeight / rh
  const maxScroll = Math.max(0, height - innerHeight)
  const pos = maxScroll ? (Math.min(scrollY, maxScroll) / maxScroll) * Math.max(0, total - vis) : 0
  const first = Math.floor(pos)
  const start = Math.max(0, first - OVER)
  const end = Math.min(total, first + Math.ceil(vis) + OVER + 1)
  rows.style.transform = `translateY(${scrollY - (pos - start) * rh}px)`
  let html = ''
  for (let i = start; i < end; i++) html += row(i)
  rows.innerHTML = html
  state.first = first
  state.drawn = end - start
}

let frame = 0
const later = () => (frame ||= requestAnimationFrame(() => ((frame = 0), draw())))
addEventListener('scroll', later)
addEventListener('resize', later)

// Rows whose bytes differ (or that appeared). Rows past a shrunk end just disappear.
function diff(a: Uint8Array, b: Uint8Array): Set<number> {
  const out = new Set<number>()
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) continue
    const r = Math.floor(i / COLS)
    if (i < b.length) out.add(r)
    i = (r + 1) * COLS - 1 // next row
  }
  return out
}

type Doc = { type: 'doc'; key: string; rev: string; bytes: Uint8Array; scroll: 'keep' | 'top' | 'restore' }

function onMessage(m: Message) {
  if (m.type !== 'doc') return
  const d = m as unknown as Doc
  const next = d.bytes instanceof Uint8Array ? d.bytes : new Uint8Array(0)
  const isLive = d.key === state.key && d.scroll === 'keep'
  if (state.key && !isLive) state.scrolls.set(state.key, scrollY)
  changed = isLive ? diff(bytes, next) : new Set()
  bytes = next
  state.key = d.key
  state.rev = d.rev
  if (changedTimer) clearTimeout(changedTimer)
  if (changed.size) changedTimer = setTimeout(() => ((changed = new Set()), draw()), CHANGED_MS)
  if (!isLive) {
    draw() // height first, then position
    scrollTo(0, d.scroll === 'restore' ? (state.scrolls.get(d.key) ?? 0) : 0)
  }
  draw()
}
