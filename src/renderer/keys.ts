// Keyboard shortcuts: a keymap (chord → action), handled before terminals see the keys.
import type { Rect, Side, TileId } from '@core/layout'
import { S, location, getTile } from './state'
import { openTile, activate, closeTile } from './ops'
import { newTab, closeTab, cycleTab, switchTabIndex } from './tabs'

export type Action =
  | 'split-right' | 'split-down'
  | 'focus-left' | 'focus-right' | 'focus-up' | 'focus-down'
  | 'close-tile'
  | 'new-tab' | 'close-tab' | 'next-tab' | 'prev-tab'
  | `tab-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`

// Defaults; settings will override per chord later. Chord: modifiers (Cmd, Ctrl, Alt, Shift) + key.
export const DEFAULT_KEYMAP: Record<string, Action> = {
  'Cmd+D': 'split-right',
  'Cmd+Shift+D': 'split-down',
  'Cmd+Left': 'focus-left',
  'Cmd+Right': 'focus-right',
  'Cmd+Up': 'focus-up',
  'Cmd+Down': 'focus-down',
  'Cmd+T': 'new-tab',
  'Cmd+W': 'close-tile',
  'Cmd+Shift+W': 'close-tab',
  'Ctrl+Tab': 'next-tab',
  'Ctrl+Shift+Tab': 'prev-tab',
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`Cmd+${n}`, `tab-${n}` as Action])),
}

let keymap = DEFAULT_KEYMAP

const KEY_NAMES: Record<string, string> = { ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down' }

export function chord(e: KeyboardEvent): string {
  const key = KEY_NAMES[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key)
  return [e.metaKey && 'Cmd', e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', key].filter(Boolean).join('+')
}

// Text fields keep their own editing shortcuts; the terminal's hidden textarea does not count.
function editingText(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || el.classList?.contains('xterm-helper-textarea')) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

export function initKeys() {
  window.addEventListener(
    'keydown',
    (e) => {
      if (editingText(e.target) || document.querySelector('.settings, .dialog-backdrop')) return
      const action = keymap[chord(e)]
      if (!action) return
      e.preventDefault()
      e.stopPropagation()
      run(action)
    },
    true, // capture: before xterm
  )
}

export function run(action: Action) {
  switch (action) {
    case 'split-right':
      return splitActive('r')
    case 'split-down':
      return splitActive('b')
    case 'focus-left':
      return focusDirection('l')
    case 'focus-right':
      return focusDirection('r')
    case 'focus-up':
      return focusDirection('t')
    case 'focus-down':
      return focusDirection('b')
    case 'close-tile':
      return void (S.active && closeTile(S.active))
    case 'new-tab':
      return void newTab()
    case 'close-tab':
      return void closeTab()
    case 'next-tab':
      return cycleTab(1)
    case 'prev-tab':
      return cycleTab(-1)
    default:
      if (action.startsWith('tab-')) return switchTabIndex(Number(action.slice(4)))
  }
}

// New tile of the active tile's kind, as if its template were dropped on that edge. Slotted only.
function splitActive(side: Side) {
  if (!S.tree) return void openTile('terminal', { type: 'slot', at: null, side })
  if (!S.active || location(S.active) !== 'slotted') return
  openTile(getTile(S.active).kind, { type: 'slot', at: S.active, side })
}

// Nearest visible tile in a direction (slotted and floating). Prefers tiles overlapping on the
// perpendicular axis, then the smallest gap along the axis, then the smallest perpendicular offset,
// then the most recently used (like i3).
function focusDirection(dir: Side) {
  const from = S.active ? S.rects.get(S.active) : null
  if (!from || !S.active) return
  const horizontal = dir === 'l' || dir === 'r'
  const sign = dir === 'r' || dir === 'b' ? 1 : -1
  const cx = (r: Rect) => r.x + r.w / 2
  const cy = (r: Rect) => r.y + r.h / 2
  let best: { id: TileId; score: number[] } | null = null
  for (const [id, r] of S.rects) {
    const loc = location(id)
    if (id === S.active || (loc !== 'slotted' && loc !== 'floating')) continue
    const along = horizontal ? cx(r) - cx(from) : cy(r) - cy(from)
    if (along * sign <= 1) continue
    const gap = horizontal
      ? sign > 0 ? r.x - (from.x + from.w) : from.x - (r.x + r.w)
      : sign > 0 ? r.y - (from.y + from.h) : from.y - (r.y + r.h)
    const overlap = horizontal
      ? Math.min(from.y + from.h, r.y + r.h) - Math.max(from.y, r.y)
      : Math.min(from.x + from.w, r.x + r.w) - Math.max(from.x, r.x)
    const offset = horizontal ? Math.abs(cy(r) - cy(from)) : Math.abs(cx(r) - cx(from))
    const mru = S.mru.indexOf(id)
    const score = [overlap > 0 ? 0 : 1, Math.max(0, gap), Math.round(offset), mru < 0 ? Infinity : mru] // ties: most recently used
    if (!best || compare(score, best.score) < 0) best = { id, score }
  }
  if (!best) return
  if (S.zoomed) S.zoomed = null
  activate(best.id)
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}
