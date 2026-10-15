// Markdown viewer: runs in the tile's sandboxed content frame (opaque origin, strict CSP). Text,
// theme and scroll requests arrive over the host's port; links and task toggles go back as
// requests, posted from the click handler only (the host also requires frame focus).
// Pipeline: markdown-it (raw HTML escaped) → highlight.js → DOMPurify on the final HTML.
// docs/MARKDOWN.md.
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import makefile from 'highlight.js/lib/languages/makefile'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

// Common languages only (bundle size); aliases come with each (js, ts, sh, py, html, toml...).
const LANGS = { bash, c, cpp, css, diff, dockerfile, go, ini, java, javascript, json, makefile, markdown, python, ruby, rust, shell, sql, swift, typescript, xml, yaml }
for (const [name, lang] of Object.entries(LANGS)) hljs.registerLanguage(name, lang)

// SECURITY: raw HTML in the document is escaped (html: false), never parsed as markup.
const md = new MarkdownIt({
  html: false,
  linkify: true,
  highlight: (code, lang) => (lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value : ''),
})

// Task list items (`- [ ] x`): a checkbox token carrying the item's source line.
md.core.ruler.after('inline', 'tasks', (state) => {
  const tokens = state.tokens
  for (let i = 2; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open' || !t.map) continue
    const first = t.children?.[0]
    const m = first?.type === 'text' ? /^\[([ xX])\](?=\s|$)\s*/.exec(first.content) : null
    if (!first || !m) continue
    first.content = first.content.slice(m[0].length)
    const box = new state.Token('task_box', 'input', 0)
    box.meta = { checked: m[1] !== ' ', line: t.map[0] }
    t.children!.unshift(box)
    tokens[i - 2].attrJoin('class', 'task')
  }
})
md.renderer.rules.task_box = (tokens, idx) => {
  const { checked, line } = tokens[idx].meta as { checked: boolean; line: number }
  return `<input type="checkbox" class="task-box" data-line="${line}"${checked ? ' checked' : ''}>`
}

// Heading ids for in-page anchors (GitHub-style slugs; DOMPurify prefixes them `user-content-`).
md.core.ruler.push('anchors', (state) => {
  const seen = new Map<string, number>()
  state.tokens.forEach((t, i) => {
    if (t.type !== 'heading_open') return
    const base = slug(state.tokens[i + 1]?.content ?? '')
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    t.attrSet('id', n ? `${base}-${n}` : base)
  })
})
const slug = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')

// Images: only relative paths inside the file's folder, through this tile's own tie-content
// origin (root = the file's directory). Remote / data / out-of-folder images become a placeholder:
// no <img>, no request (the CSP would block them anyway).
const ROOT = 'https://root.invalid/r/'
function localImage(src: string): string | null {
  if (!src || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//') || src.startsWith('\\')) return null
  try {
    const u = new URL(src, ROOT)
    if (u.origin !== 'https://root.invalid' || !u.pathname.startsWith('/r/')) return null // left the folder
    return `${location.protocol}//${location.host}/${u.pathname.slice(3)}`
  } catch {
    return null
  }
}
const image = md.renderer.rules.image!
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const t = tokens[idx]
  const src = String(t.attrGet('src') ?? '')
  const local = localImage(src)
  if (local) {
    t.attrSet('src', local)
    return image(tokens, idx, options, env, self)
  }
  const alt = self.renderInlineAsText(t.children ?? [], options, env)
  const esc = md.utils.escapeHtml
  return `<span class="img-blocked" title="${esc(src)}">🖼 ${esc(alt || src)}</span>`
}

// SECURITY: DOMPurify on the final HTML (after every plugin and the highlighter), as a backstop if
// any of them ever emits markup from the document. Named ids prefixed (no DOM clobbering); style
// attributes and forms out; URLs: http(s), this tile's tie-content, relative.
const PURIFY = {
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ['style', 'form'],
  FORBID_ATTR: ['style'],
  ALLOWED_URI_REGEXP: /^(?:https?:|tie-content:\/\/|#|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
}

// Harness view (scenarios read it, like the probe's). Nothing here is trusted by the host.
const state = { port: null as MessagePort | null, rev: '', key: '', text: '', renders: 0, removed: 0, scrolls: new Map<string, number>(), md, sanitize: (html: string) => DOMPurify.sanitize(html, PURIFY) }
;(window as unknown as { markdown: typeof state }).markdown = state

const docEl = document.getElementById('doc')!

function render(text: string) {
  docEl.innerHTML = state.sanitize(md.render(text))
  state.removed += DOMPurify.removed.length
  state.renders++
}

function scrollToHash(hash: string) {
  let id = hash.replace(/^#/, '')
  try {
    id = decodeURIComponent(id)
  } catch {}
  const el = document.getElementById(`user-content-${id}`) ?? document.getElementById(`user-content-${slug(id)}`)
  el?.scrollIntoView()
}

type Msg =
  | { type: 'theme'; dark: boolean; vars: Record<string, string> }
  | { type: 'doc'; key: string; text: string; rev: string; scroll: 'keep' | 'top' | 'restore'; hash: string }
  | { type: 'scroll'; hash: string }

function onMessage(m: Msg) {
  if (m.type === 'theme') {
    const s = document.documentElement.style
    for (const [k, v] of Object.entries(m.vars)) if (/^--[a-z0-9-]+$/.test(k) && typeof v === 'string') s.setProperty(k, v)
    s.colorScheme = m.dark ? 'dark' : 'light'
  } else if (m.type === 'doc') {
    if (state.key) state.scrolls.set(state.key, scrollY)
    const keep = m.key === state.key && m.scroll === 'keep' ? scrollY : null
    state.key = m.key
    state.text = m.text
    state.rev = m.rev
    render(m.text)
    if (m.hash) scrollToHash(m.hash)
    else if (keep !== null) scrollTo(0, keep)
    else scrollTo(0, m.scroll === 'restore' ? (state.scrolls.get(m.key) ?? 0) : 0)
  } else if (m.type === 'scroll') scrollToHash(m.hash)
}

// Handshake: the host posts tie:init with one port after load; everything after goes over it.
addEventListener('message', (e) => {
  if (state.port || e.source !== parent || (e.data as { type?: string })?.type !== 'tie:init' || !e.ports[0]) return
  state.port = e.ports[0]
  state.port.onmessage = (m) => onMessage(m.data as Msg)
  state.port.postMessage({ verb: 'ready' })
})

// Clicks: links and task boxes become requests (only from here: a real click). Nothing navigates.
addEventListener('click', (e) => {
  const target = e.target as Element
  const box = target.closest?.('input.task-box') as HTMLInputElement | null
  if (box) {
    e.preventDefault() // the file decides: the box flips when the change comes back
    const line = Number(box.dataset.line)
    const expected = state.text.split('\n')[line]
    if (expected !== undefined) state.port?.postMessage({ verb: 'toggleTask', line, expected, rev: state.rev })
    return
  }
  const a = target.closest?.('a[href]')
  if (!a) return
  e.preventDefault()
  const href = a.getAttribute('href') ?? ''
  if (href.startsWith('#')) return scrollToHash(href)
  state.port?.postMessage({ verb: 'followLink', href, newTile: e.metaKey })
})
// Middle clicks, drops: never navigate (the nav lock would refuse anyway).
addEventListener('auxclick', (e) => (e.target as Element).closest?.('a') && e.preventDefault())
addEventListener('dragover', (e) => e.preventDefault())
addEventListener('drop', (e) => e.preventDefault())
