// ASCII render of the board from `tie list --json`.
import { tie } from './lib.mjs'

const instance = process.env.TIE_INSTANCE || 'default'
const COLS = Number(process.argv[2]) || 100

const r = await tie(instance, 'list')
const b = r.board
const rows = Math.round((COLS * b.h) / b.w / 2.1)
const grid = Array.from({ length: rows }, () => Array(COLS).fill(' '))

const sx = (x) => Math.round(((x - b.x) / b.w) * (COLS - 1))
const sy = (y) => Math.round(((y - b.y) / b.h) * (rows - 1))

function box(t, ch) {
  const x0 = Math.max(0, sx(t.rect.x)), x1 = Math.min(COLS - 1, sx(t.rect.x + t.rect.w))
  const y0 = Math.max(0, sy(t.rect.y)), y1 = Math.min(rows - 1, sy(t.rect.y + t.rect.h))
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const edgeY = y === y0 || y === y1
      const edgeX = x === x0 || x === x1
      grid[y][x] = edgeY && edgeX ? '+' : edgeY ? ch.h : edgeX ? ch.v : ' '
    }
  const flags = [t.active && '*', t.collapsed && 'collapsed', t.zoomed && 'zoomed', t.state === 'floating' && 'float', t.pinned && 'pinned']
  const label = ` ${t.id} ${t.title} ${flags.filter(Boolean).join(' ')} `.slice(0, Math.max(0, x1 - x0 - 1))
  if (y0 + 1 <= y1 && x1 - x0 > 2) [...label].forEach((c, i) => (grid[y0 + 1][x0 + 1 + i] = c))
}

const order = { slotted: 0, floating: 1, shelved: 2 }
const visible = r.tiles.filter((t) => t.rect && (t.state !== 'shelved' || t.pinned)).sort((a, b) => order[a.state] - order[b.state] || a.zoomed - b.zoomed)
for (const t of visible) box(t, t.state === 'slotted' && !t.zoomed ? { h: '-', v: '|' } : { h: '=', v: '‖' })

console.log(grid.map((row) => row.join('')).join('\n'))
const shelf = r.shelf.map((id) => {
  const t = r.tiles.find((t) => t.id === id)
  return `${id}:${t.title}${t.pinned ? '(pinned)' : ''}${t.exit !== null ? `(exit ${t.exit})` : ''}`
})
console.log(`shelf: ${shelf.join('  ') || '(empty)'}`)
console.log(`active: ${r.active ?? '-'}`)
