import '@xterm/xterm/css/xterm.css'
import { S, tie, location } from './state'
import { render } from './render'
import { openTile, activate, closeTile, toggleCollapse, toggleZoom } from './ops'
import { initTerminals } from './kinds/terminal'
import { initFileViews } from './fileview'
import { registerKind } from './kinds'
import { probeKind } from './kinds/probe'
import { initFrames } from './frame'
import { initGuests } from './guest'
import { initShelf } from './shelf'
import { initMenu, showTileMenu } from './menu'
import { startDrag, startFloatResize } from './drag'
import { initDriver } from './driver'
import { initSettings } from './settings'
import { applyAppearance } from './appearance'
import { initKeys } from './keys'
import { initTabs, setHome } from './tabs'
import { initPaste, dropOnTile } from './paste'

// SECURITY: native drops (from Finder, browsers) are no-ops. Unclaimed, the browser navigates the
// window to a dropped link/file (and the preload would follow), and dropped text lands in xterm's
// textarea = typed into the shell. Capture phase: claimed before any element sees it.
// Tie's own drags use pointer events, not HTML drag-and-drop.
window.addEventListener('dragover', (e) => e.preventDefault(), true)
window.addEventListener(
  'drop',
  (e) => {
    e.preventDefault()
    e.stopPropagation()
    document.body.classList.remove('os-drag')
    dropOnTile(e) // on a terminal: paths/text through the paste guards; files elsewhere: viewers (paste.ts)
  },
  true,
)
// SECURITY: while an OS drag is over the window, content frames ignore the pointer (body.os-drag,
// style.css): the drop lands in the shell (opens files beside the tile), and content never sees
// dropped files. A drag entering the window straight over a frame still reaches it (no dragenter
// here first); viewers refuse drops.
window.addEventListener('dragenter', () => document.body.classList.add('os-drag'), true)
window.addEventListener('dragleave', (e) => !e.relatedTarget && document.body.classList.remove('os-drag'), true)
window.addEventListener('dragend', () => document.body.classList.remove('os-drag'), true)

const tiles = document.getElementById('tiles')!
const tileId = (el: Element | null) => (el?.closest('.tile') as HTMLElement | null)?.dataset.id

// Delegated tile interactions.
tiles.addEventListener('pointerdown', (e) => {
  const target = e.target as HTMLElement
  const id = tileId(target)
  if (!id || !S.tiles.has(id)) return
  if (location(id) !== 'shelved' || S.pinned === id) {
    if (S.active !== id) activate(id)
  }
  if (target.closest('.rz')) return startFloatResize(e, id)
  if (e.button !== 0 || target.closest('.btn') || !target.closest('.titlebar')) return
  startDrag(e, { type: 'tile', id }, () => onTitleClick(id))
})

// Clicks on title bars arrive via startDrag (pointer capture retargets native click/dblclick).
let lastClick = { id: '', at: 0 }
function onTitleClick(id: string) {
  const now = performance.now()
  const double = lastClick.id === id && now - lastClick.at < 350
  lastClick = { id: double ? '' : id, at: now }
  if (S.collapsed.has(id)) toggleCollapse(id)
  else if (double && location(id) !== 'shelved') toggleZoom(id)
}

tiles.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.btn')
  const id = tileId(btn)
  if (!btn || !id) return
  if (btn.classList.contains('close')) closeTile(id)
  else if (btn.classList.contains('collapse')) toggleCollapse(id)
  else if (btn.classList.contains('zoom')) toggleZoom(id)
})

tiles.addEventListener('contextmenu', (e) => {
  const target = e.target as HTMLElement
  const id = tileId(target)
  if (!id || !target.closest('.titlebar')) return
  e.preventDefault()
  showTileMenu(id, e.clientX, e.clientY)
})

window.addEventListener('resize', () => render())

async function boot() {
  const info = await tie.info()
  const { settings } = await tie.settings.get()
  applyAppearance(settings)
  S.cwd = info.cwd
  setHome(info.home)
  if (info.instance !== 'default') document.getElementById('brand')!.textContent = info.instance
  initTerminals()
  initFileViews()
  initFrames()
  initGuests()
  if (info.dev) registerKind({ kind: 'probe', factory: probeKind, opens: 'bare' })
  initShelf()
  initMenu()
  initPaste()
  initDriver()
  initSettings()
  initKeys()
  initTabs()
  openTile('terminal', { type: 'slot', at: null, side: 'r' })
  tie.ready()
}

boot()
