// Text viewer: the pipeline only (runtime.ts: handshake, theme, keys, guards; live.ts: live
// updates). Any UTF-8 file: highlighted by its extension (highlight.ts, small files), line numbers,
// shown literally: the text is escaped (or highlight.js-escaped), control characters and bidi
// overrides are made visible, links are not clickable. Read-only. docs/VIEWERS.md "Text".
import { startViewer, type Message } from './runtime'
import { createLive, type How } from './live'
import { highlight } from './highlight'

// Highlighting cost grows with the file: larger files show plain (still numbered, still live).
const HIGHLIGHT_MAX = 512 * 1024

// File name → highlight.js language: these names and extensions; other extensions are tried as
// language names or aliases as they are (ts, py, rs, go, json, yaml, sh, html, css, sql...).
const BY_NAME: Record<string, string> = { makefile: 'makefile', gnumakefile: 'makefile', dockerfile: 'dockerfile', '.bashrc': 'bash', '.zshrc': 'bash', '.profile': 'bash', '.gitconfig': 'ini', '.editorconfig': 'ini' }
const BY_EXT: Record<string, string> = { mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', tsx: 'typescript', mts: 'typescript', cts: 'typescript', h: 'c', hpp: 'cpp', hh: 'cpp', cc: 'cpp', cxx: 'cpp', zsh: 'bash', toml: 'ini', cfg: 'ini', conf: 'ini', htm: 'xml', svg: 'xml', plist: 'xml', mk: 'makefile', yml: 'yaml', jsonc: 'json', patch: 'diff' }
function langOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  if (Object.hasOwn(BY_NAME, name)) return BY_NAME[name]
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot + 1) : ''
  return Object.hasOwn(BY_EXT, ext) ? BY_EXT[ext] : ext
}

// SECURITY: shown literally. Control characters (escape sequences, NUL...) become their visible
// Control Pictures (U+2400 block) and bidi overrides/isolates (Trojan Source) a visible ⟨U+XXXX⟩;
// CRLF line ends are line ends. Then everything is escaped: no markup from the file, ever.
const CTL = /[\x00-\x08\x0b-\x1f\x7f]/g
const BIDI = /[‪-‮⁦-⁩]/g
const visible = (text: string) =>
  text
    .replace(/\r\n/g, '\n')
    .replace(CTL, (c) => String.fromCharCode(c === '\x7f' ? 0x2421 : 0x2400 + c.charCodeAt(0)))
    .replace(BIDI, (c) => `⟨U+${c.charCodeAt(0).toString(16).toUpperCase()}⟩`)
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// Mark the visible controls (only in text: tags are plain ASCII).
const markControls = (html: string) => html.replace(/[␀-␡]|⟨U\+[0-9A-F]{4}⟩/g, '<span class="ctl">$&</span>')

// Highlighted HTML → one string per line, spans closed at each line end and reopened on the next
// (multi-line comments and strings stay colored). Input: highlight.js output (spans + escaped text).
function splitLines(html: string): string[] {
  const out: string[] = []
  const open: string[] = []
  let cur = ''
  for (const [t] of html.matchAll(/<span[^>]*>|<\/span>|\n|[^<\n]+/g)) {
    if (t === '\n') {
      out.push(cur + '</span>'.repeat(open.length))
      cur = open.join('')
    } else {
      if (t.startsWith('<span')) open.push(t)
      else if (t === '</span>') open.pop()
      cur += t
    }
  }
  out.push(cur)
  return out
}

const linesEl = document.getElementById('lines')!
const gutter = document.getElementById('gutter')!
const live = createLive(linesEl)

const state = startViewer(
  { name: 'text', onMessage, keys: { n: live.next } },
  {
    rev: '',
    key: '',
    text: '',
    lang: '',
    highlighted: false,
    lines: 0,
    get renders() {
      return live.renders
    },
    scrolls: new Map<string, number>(),
    marks: live.marks,
  },
)

// The document, built off-screen: one <div> per line (keyed by live.ts), highlighted when small.
function build(text: string, lang: string): HTMLElement {
  const v = visible(text)
  const hl = v.length <= HIGHLIGHT_MAX ? highlight(v, lang) : ''
  const lines = splitLines(markControls(hl || escape(v)))
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop() // final newline: no extra line
  state.highlighted = !!hl
  state.lines = text ? lines.length : 0
  const next = document.createElement('div')
  next.innerHTML = text ? lines.map((l) => `<div>${l}</div>`).join('') : '<div id="empty">(empty file)</div>'
  live.key(next)
  return next
}

function show(text: string, how: How) {
  const next = build(text, state.lang)
  gutter.textContent = Array.from({ length: state.lines }, (_, i) => i + 1).join('\n')
  live.place(next, how)
}

type Doc = { type: 'doc'; key: string; text: string; rev: string; scroll: 'keep' | 'top' | 'restore'; hash: string }

function onMessage(msg: Message) {
  if (msg.type !== 'doc') return
  const m = msg as unknown as Doc
  // Same file, changed on disk: live update (the view doesn't move, changed lines marked). Else a
  // page: top, or where this file was (reload).
  const isLive = m.key === state.key && m.scroll === 'keep'
  if (state.key && !isLive) state.scrolls.set(state.key, scrollY)
  state.key = m.key
  state.text = typeof m.text === 'string' ? m.text : ''
  state.rev = m.rev
  state.lang = langOf(m.key)
  show(state.text, isLive ? 'live' : 'page')
  if (!isLive) scrollTo(0, m.scroll === 'restore' ? (state.scrolls.get(m.key) ?? 0) : 0)
}
