// Keyboard shortcuts: actions from main (keymap: @core/keymap, matched in src/main/keys.ts).
import type { Rect, Side, TileId } from '@core/layout'
import { S, tie, location, getTile, spaceOf, withSpace } from './state'
import { openTile, activate, closeTile, cwdOf } from './ops'
import { newTab, closeTab, cycleTab, switchTabIndex } from './tabs'
import { quitPressed, quitReleased, quitCancelled } from './quit'
import type { Action } from '@core/keymap'
import { needsFile } from './kinds'

// Text fields keep their own editing shortcuts; the terminal's hidden textarea does not count.
function editingText(target: Element | null): boolean {
  const el = target as HTMLElement | null
  if (!el || el.classList?.contains('xterm-helper-textarea')) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

const modalOpen = () => !!document.querySelector('.settings, .dialog-backdrop')

// Shortcuts are matched and blocked in main (src/main/keys.ts); this side runs the actions. Main
// skips the keymap (not ⌘Q) while a text field or modal has focus: told on every change.
export function initKeys() {
  let suspended = false
  const sync = () => {
    const on = editingText(document.activeElement) || modalOpen()
    if (on !== suspended) tie.keys.suspend((suspended = on))
  }
  document.addEventListener('focusin', sync, true)
  document.addEventListener('focusout', () => setTimeout(sync), true)
  new MutationObserver(sync).observe(document.body, { childList: true })

  tie.keys.onAction((a) => {
    if (a === 'quit-press') return quitPressed()
    if (a === 'quit-release') return quitReleased()
    if (a === 'quit-cancel') return quitCancelled()
    if (!modalOpen()) run(a as Action) // never act behind a modal, even if main's view lagged
  })
  window.addEventListener('blur', () => quitCancelled())
  // ⌘Q reaches the page (main can't block it, see main/keys.ts): keep it from xterm.
  window.addEventListener('keydown', (e) => e.metaKey && e.key.toLowerCase() === 'q' && (e.preventDefault(), e.stopPropagation()), true)
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
    case 'history-back':
      return void (S.active && S.tiles.get(S.active)?.surface.history?.(-1))
    case 'history-forward':
      return void (S.active && S.tiles.get(S.active)?.surface.history?.(1))
    default:
      if (action.startsWith('tab-')) return switchTabIndex(Number(action.slice(4)))
  }
}

// New tile of the active tile's kind, as if its template were dropped on that edge. Slotted only.
// The new terminal starts where the source shell is now. Kinds showing a file split into a
// terminal in the file's directory.
async function splitActive(side: Side) {
  if (!S.tree) return void openTile('terminal', { type: 'slot', at: null, side })
  const src = S.active
  if (!src || location(src) !== 'slotted') return
  const own = getTile(src).kind
  const kind = needsFile(own) ? 'terminal' : own
  const cwd = await cwdOf(src)
  if (!S.tiles.has(src) || location(src) !== 'slotted') return // closed/moved meanwhile
  withSpace(spaceOf(src)!.id, () => openTile(kind, { type: 'slot', at: src, side }, { cwd }))
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
  activate(best.id)
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}
