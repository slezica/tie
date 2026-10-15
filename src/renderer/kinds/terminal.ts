// Terminal kind: xterm in the tile body, wired to a pty in main. docs/TERMINALS.md.
// The one trusted kind: renders in the shell realm (content kinds get a sandboxed frame).
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { iconFor, SHELLS } from '../icons'
import { S, tie, debug } from '../state'
import { termOptions } from '../appearance'
import type { Host, OpenOpts, Surface } from '.'

// Per-terminal state, reached by pty id (events from main) and tile id.
interface Term {
  host: Host
  term: Terminal
  fit: FitAddon
  pty: number | null // = pid
  ptySize?: { cols: number; rows: number } // last size sent to the pty
  oscTitle?: string // title escape
  proc?: string // foreground process (polled)
  cmd?: string // `--cmd`: run instead of an interactive shell
  cwd?: string // start directory
  cwdNow?: string // shell's current directory (polled)
}

const byPty = new Map<number, Term>()
const byTile = new Map<string, Term>()

// Temporary (paste.ts): until paste goes through Surface.
export const terminalOf = (id: string) => byTile.get(id)

// SECURITY: terminal output is untrusted, and OSC 8 links can hide any URL behind any text.
// xterm's default handler (confirm + window.open) would load it in-app. Here: hover shows the real
// URL, only cmd-click opens it, and only via main's openExternal (which allows http(s) only).
// Non-http schemes pass xterm (allowNonHttpProtocols) so the tip can show them as blocked.
const linkTip = document.createElement('div')
linkTip.className = 'link-tip'
const webUrl = (uri: string) => /^https?:\/\//i.test(uri)
const linkHandler = {
  allowNonHttpProtocols: true,
  activate: (e: MouseEvent, uri: string) => {
    if (e.metaKey) tie.openExternal(uri)
  },
  hover: (e: MouseEvent, uri: string) => {
    linkTip.textContent = webUrl(uri) ? `⌘-click to open ${uri}` : `Blocked link: ${uri}`
    linkTip.classList.toggle('blocked', !webUrl(uri))
    linkTip.style.left = `${e.clientX + 12}px`
    linkTip.style.top = `${e.clientY + 16}px`
    document.body.appendChild(linkTip)
  },
  leave: () => linkTip.remove(),
}

export function terminalKind(host: Host, opts: OpenOpts): Surface {
  const term = new Terminal({
    ...termOptions(),
    cursorBlink: true,
    scrollback: 5000,
    macOptionIsMeta: true,
    macOptionClickForcesSelection: true,
    allowProposedApi: true,
    linkHandler,
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  const t: Term = { host, term, fit, pty: null, cmd: opts.cmd, cwd: opts.cwd }
  byTile.set(host.id, t)
  term.onTitleChange((title) => {
    t.oscTitle = title
    host.changed()
  })

  return {
    mount: () => start(t),
    resize: () => fitTerm(t),
    dispose: () => {
      if (t.pty !== null) {
        tie.pty.kill(t.pty)
        byPty.delete(t.pty)
      }
      byTile.delete(host.id)
      term.dispose()
    },
    focus: () => {
      if (!term.element) return false
      term.focus()
      return true
    },
    title: () => {
      if (t.oscTitle) return t.oscTitle
      if (t.cmd) return t.cmd
      if (t.proc && !SHELLS.has(t.proc)) return t.proc
      return t.proc || 'terminal'
    },
    icon: () => iconFor(t.proc),
    dir: () => t.cwdNow,
    // Where the shell is right now (fresh read, not the 2 s poll).
    cwd: async () => {
      const now = t.pty !== null ? await tie.pty.cwd(t.pty) : null
      return now ?? t.cwdNow ?? t.cwd
    },
    appearance: () => {
      const o = termOptions()
      term.options.theme = o.theme
      term.options.lineHeight = o.lineHeight
      term.options.fontFamily = o.fontFamily
      term.options.fontSize = o.fontSize
      term.options.letterSpacing = o.letterSpacing
      if (term.element) fitTerm(t) // cell size changed
    },
    info: () => ({ term: { cols: term.cols, rows: term.rows, pty: t.ptySize ?? null } }), // mismatch = sizing bug
  }
}

// Open xterm into the body and start the pty (the element has a size by now).
async function start(t: Term) {
  const { host, term } = t
  term.open(host.body)
  t.fit.fit()
  const { cols, rows } = term
  const res = await tie.pty.spawn({ cmd: t.cmd, cwd: t.cwd || S.cwd, cols, rows, env: { TIE_TILE: host.id } }).catch((e: Error) => ({ error: e.message }))
  // Closed while spawning: dispose had no pty to kill yet.
  if (!host.alive()) return void (typeof res === 'number' && tie.pty.kill(res))
  if (typeof res !== 'number') return host.error(res.error)
  t.pty = res
  t.ptySize = { cols, rows }
  byPty.set(t.pty, t)
  debug('pty', 'started', host.id, t.pty, cols, rows)
  term.onData((d) => t.pty !== null && tie.pty.write(t.pty, d))
  term.onResize(({ cols, rows }) => {
    if (t.pty === null) return
    tie.pty.resize(t.pty, cols, rows)
    t.ptySize = { cols, rows }
  })
  // xterm may have resized while the pty was spawning (before onResize was hooked).
  if (term.cols !== cols || term.rows !== rows) {
    tie.pty.resize(t.pty, term.cols, term.rows)
    t.ptySize = { cols: term.cols, rows: term.rows }
  }
}

function fitTerm(t: Term) {
  const body = t.host.body
  if (body.clientWidth < 10 || body.clientHeight < 10) return // collapsed/hidden
  const d = t.fit.proposeDimensions()
  if (d && (d.cols !== t.term.cols || d.rows !== t.term.rows)) t.fit.fit()
}

// pty events from main, routed by pty id. Shell tiles close when the shell dies; --cmd tiles stay
// to show the exit status.
export function initTerminals() {
  tie.pty.onData((pid, data) => {
    const t = byPty.get(pid)
    if (!t) return
    t.term.write(data)
    t.host.activity()
  })
  tie.pty.onExit((pid, code) => {
    const t = byPty.get(pid)
    if (!t) return
    t.term.write(`\r\n\x1b[90m[process exited with code ${code}]\x1b[0m`)
    t.host.exit(code)
    if (!t.cmd) t.host.close()
  })
  tie.pty.onCwd((pid, cwd) => {
    const t = byPty.get(pid)
    if (!t) return
    t.cwdNow = cwd
    t.host.changed()
  })
  tie.pty.onProcess((pid, name) => {
    const t = byPty.get(pid)
    if (!t) return
    t.proc = name
    t.host.changed()
  })
}
