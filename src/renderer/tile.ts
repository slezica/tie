// Tile element + terminal kind. Elements live in one layer and are never re-parented.
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { ICON, iconFor, SHELLS } from './icons'
import { S, tie, type Tile, type Kind, newId, debug } from './state'
import { termOptions } from './appearance'

const ptyToTile = new Map<number, string>()

export function displayTitle(t: Tile): string {
  if (t.customTitle) return t.customTitle
  if (t.oscTitle) return t.oscTitle
  if (t.cmd) return t.cmd
  if (t.proc && !SHELLS.has(t.proc)) return t.proc
  return t.proc || 'terminal'
}

export function displayIcon(t: Tile): string {
  return t.customIcon || iconFor(t.proc)
}

// Icons are user text (CLI, menu): escaped, never markup.
export function iconHtml(icon: string): string {
  const esc = icon.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return icon ? `<span class="emoji">${esc}</span>` : `<span class="glyph">&gt;_</span>`
}

export function createTile(kind: Kind, opts: { title?: string; cwd?: string; cmd?: string } = {}): Tile {
  const id = newId()
  const el = document.createElement('div')
  el.className = 'tile'
  el.dataset.id = id
  el.innerHTML = `
    <div class="titlebar">
      <span class="icon"></span>
      <span class="title"></span>
      <span class="status"></span>
      <span class="spacer"></span>
      <button class="btn collapse" title="Collapse">${ICON.collapse}</button>
      <button class="btn zoom" title="Zoom">${ICON.zoom}</button>
      <button class="btn close" title="Close">${ICON.close}</button>
    </div>
    <div class="body"></div>
    ${['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((d) => `<div class="rz ${d}" data-dir="${d}"></div>`).join('')}
  `
  document.getElementById('tiles')!.appendChild(el)
  const body = el.querySelector('.body') as HTMLElement

  const term = new Terminal({
    ...termOptions(),
    cursorBlink: true,
    scrollback: 5000,
    macOptionIsMeta: true,
    macOptionClickForcesSelection: true,
    allowProposedApi: true,
  })
  const fit = new FitAddon()
  term.loadAddon(fit)

  const tile: Tile = { id, kind, exit: null, activity: false, pty: null, el, body, term, fit, customTitle: opts.title, cwd: opts.cwd, cmd: opts.cmd }
  S.tiles.set(id, tile)
  term.onTitleChange((title) => {
    tile.oscTitle = title
    refreshTitle(tile)
  })
  refreshTitle(tile)
  return tile
}

export function refreshTitle(t: Tile) {
  const title = displayTitle(t)
  ;(t.el.querySelector('.title') as HTMLElement).textContent = title
  ;(t.el.querySelector('.icon') as HTMLElement).innerHTML = iconHtml(displayIcon(t))
  ;(t.el.querySelector('.status') as HTMLElement).textContent = t.exit === null ? '' : t.exit === 0 ? '✓' : `✗ ${t.exit}`
  document.dispatchEvent(new CustomEvent('tile-meta', { detail: t.id }))
}

// Open xterm into the body and start the pty once the element has a size.
export async function startTerminal(t: Tile, cmd?: string) {
  t.term.open(t.body)
  t.fit.fit()
  const { cols, rows } = t.term
  const res = await tie.pty.spawn({ cmd, cwd: t.cwd || S.cwd, cols, rows, env: { TIE_TILE: t.id } }).catch((e: Error) => ({ error: e.message }))
  // Closed while spawning: disposeTile had no pty to kill yet.
  if (S.tiles.get(t.id) !== t) return void (typeof res === 'number' && tie.pty.kill(res))
  if (typeof res !== 'number') return showError(t, res.error)
  t.pty = res
  t.ptySize = { cols, rows }
  ptyToTile.set(t.pty, t.id)
  debug('pty', 'started', t.id, t.pty, cols, rows)
  t.term.onData((d) => t.pty !== null && tie.pty.write(t.pty, d))
  t.term.onResize(({ cols, rows }) => {
    if (t.pty === null) return
    tie.pty.resize(t.pty, cols, rows)
    t.ptySize = { cols, rows }
  })
  // xterm may have resized while the pty was spawning (before onResize was hooked).
  if (t.term.cols !== cols || t.term.rows !== rows) {
    tie.pty.resize(t.pty, t.term.cols, t.term.rows)
    t.ptySize = { cols: t.term.cols, rows: t.term.rows }
  }
  new ResizeObserver(() => fitTile(t)).observe(t.body)
}

// Error state: centered message replaces the tile's content; the tile stays open.
export function showError(t: Tile, message: string) {
  t.error = message
  debug('pty', 'error', t.id, message)
  const el = document.createElement('div')
  el.className = 'tile-error'
  el.innerHTML = `<div class="word">Error</div><div class="msg"></div>`
  ;(el.querySelector('.msg') as HTMLElement).textContent = message
  t.body.appendChild(el)
  refreshTitle(t)
}

export function fitTile(t: Tile) {
  if (t.body.clientWidth < 10 || t.body.clientHeight < 10) return // collapsed/hidden
  const d = t.fit.proposeDimensions()
  if (d && (d.cols !== t.term.cols || d.rows !== t.term.rows)) t.fit.fit()
}

export function disposeTile(t: Tile) {
  if (t.pty !== null) {
    tie.pty.kill(t.pty)
    ptyToTile.delete(t.pty)
  }
  t.term.dispose()
  t.el.remove()
  S.tiles.delete(t.id)
}

export function initPtyEvents(onActivity: (t: Tile) => void, onExit: (t: Tile) => void) {
  tie.pty.onData((pid, data) => {
    const t = S.tiles.get(ptyToTile.get(pid) ?? '')
    if (!t) return
    t.term.write(data)
    onActivity(t)
  })
  tie.pty.onExit((pid, code) => {
    const t = S.tiles.get(ptyToTile.get(pid) ?? '')
    if (!t) return
    t.exit = code
    t.term.write(`\r\n\x1b[90m[process exited with code ${code}]\x1b[0m`)
    refreshTitle(t)
    onExit(t)
  })
  tie.pty.onCwd((pid, cwd) => {
    const t = S.tiles.get(ptyToTile.get(pid) ?? '')
    if (!t) return
    t.cwdNow = cwd
    document.dispatchEvent(new CustomEvent('tile-meta', { detail: t.id }))
  })
  tie.pty.onProcess((pid, name) => {
    const t = S.tiles.get(ptyToTile.get(pid) ?? '')
    if (!t) return
    t.proc = name
    refreshTitle(t)
  })
}
