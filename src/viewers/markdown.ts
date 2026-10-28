// Markdown viewer: the pipeline only (runtime.ts does the frame side: handshake, theme, links,
// keys, guards; live.ts the live updates). Read-only: nothing here can write.
// Pipeline: markdown-it (raw HTML escaped; footnotes, deflists, emoji, front matter) → highlight.js
// → DOMPurify on the final HTML → ```mermaid diagrams (mermaid.ts, library loaded on demand).
// docs/MARKDOWN.md.
import MarkdownIt from 'markdown-it'
import footnote from 'markdown-it-footnote'
import deflist from 'markdown-it-deflist'
import { full as emoji } from 'markdown-it-emoji'
import DOMPurify from 'dompurify'
import { renderDiagrams, fillDiagrams, themeChanged, diagrams, sanitizeSvg, diagramSource } from './mermaid'
import { startViewer, scrollToHash, type Message } from './runtime'
import { createLive, hash, type How } from './live'
import { highlight } from './highlight'

// SECURITY: raw HTML in the document is escaped (html: false), never parsed as markup.
const md = new MarkdownIt({
  html: false,
  linkify: true,
  highlight,
})
// Footnote ids (fn1, fnref1) get DOMPurify's prefix like headings: scrollToHash finds them.
// Emoji: :name: shortcodes only, no emoticons (`:)`, `:p`, `<3` stay text).
md.use(footnote).use(deflist).use(emoji, { shortcuts: {} })

// Front matter: a leading `---` block up to `---` / `...`. Shown as-is (muted, monospace), never
// parsed. No closing line: not front matter.
md.block.ruler.before('table', 'front_matter', (state, start, end, silent) => {
  const line = (l: number) => state.src.slice(state.bMarks[l], state.eMarks[l]).trimEnd()
  if (start !== 0 || state.parentType !== 'root' || line(0) !== '---') return false
  for (let l = 1; l < end; l++) {
    if (line(l) !== '---' && line(l) !== '...') continue
    if (silent) return true
    const t = state.push('front_matter', 'pre', 0)
    t.content = state.getLines(1, l, 0, true)
    t.map = [0, l + 1]
    state.line = l + 1
    return true
  }
  return false
})
// ```mermaid fences: a diagram block holding its source (escaped text). mermaid.ts renders it after
// the page is in place; until then, or on error, the source shows as code.
const fence = md.renderer.rules.fence!
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const t = tokens[idx]
  if (t.info.trim().split(/\s+/)[0].toLowerCase() !== 'mermaid') return fence(tokens, idx, options, env, self)
  return `<div class="diagram"><pre class="diagram-src"><code>${md.utils.escapeHtml(t.content)}</code></pre></div>\n`
}

md.renderer.rules.front_matter = (tokens, idx) => `<pre class="front-matter"><code>${md.utils.escapeHtml(tokens[idx].content)}</code></pre>\n`

// Task list items (`- [ ] x`): a display-only checkbox (disabled: not clickable, not focusable).
// Read-only tiles: the file is changed in an editor, never from here.
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
    box.meta = { checked: m[1] !== ' ' }
    t.children!.unshift(box)
    tokens[i - 2].attrJoin('class', 'task')
  }
})
md.renderer.rules.task_box = (tokens, idx) => {
  const { checked } = tokens[idx].meta as { checked: boolean }
  return `<input type="checkbox" class="task-box" disabled${checked ? ' checked' : ''}>`
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

const docEl = document.getElementById('doc')!
const live = createLive(docEl, {
  blockHash: (el) => (el.classList.contains('diagram') ? `d${hash(diagramSource(el))}` : hash(el.outerHTML)),
  volatile: (el) => el.classList.contains('diagram'),
})

const sanitize = (html: string) => DOMPurify.sanitize(html, PURIFY)

// Anchors: ids carry DOMPurify's prefix; GitHub slugs also match.
const anchor = (id: string) => document.getElementById(`user-content-${id}`) ?? document.getElementById(`user-content-${slug(id)}`)

// Harness view (window.markdown = window.viewer; scenarios read it). Nothing here is trusted by the host.
const state = startViewer(
  {
    name: 'markdown',
    onMessage,
    onTheme: () => {
      themeChanged() // diagrams carry their colors: render them again
      if (docEl.querySelector('.diagram')) void show(state.text, 'quiet')
    },
    anchor,
    links: true,
    keys: { n: live.next },
  },
  {
    rev: '',
    key: '',
    text: '',
    get renders() {
      return live.renders
    },
    removed: 0,
    scrolls: new Map<string, number>(),
    md,
    sanitize,
    sanitizeSvg,
    diagrams,
    marks: live.marks,
  },
)

// The document, built off-screen: sanitized HTML, top-level blocks keyed (live.ts), diagrams filled
// from the cache.
// SECURITY: the only markup entering the page is this sanitized tree (and sanitized SVG).
function build(text: string): { next: HTMLElement; pending: boolean } {
  const next = document.createElement('div')
  next.innerHTML = sanitize(md.render(text))
  state.removed += DOMPurify.removed.length
  live.key(next)
  return { next, pending: fillDiagrams(next) }
}

// Text → screen. Live updates wait for new diagrams (rendered off-screen) so a block changes once;
// a page shows at once, diagrams as code, then swaps them in quietly. A newer call wins.
let showing = 0
async function show(text: string, how: How, position?: () => void) {
  const n = ++showing
  const { next, pending } = build(text)
  if (how === 'page') {
    live.place(next.cloneNode(true) as HTMLElement, 'page')
    position?.()
    if (!pending) return
    how = 'quiet'
  }
  if (pending) await renderDiagrams(next, state.theme.vars, state.theme.dark, () => n === showing)
  if (n === showing) live.place(next, how)
}

type Doc = { type: 'doc'; key: string; text: string; rev: string; scroll: 'keep' | 'top' | 'restore'; hash: string; y?: number } // y: the host's memory (viewer reloaded)

function onMessage(msg: Message) {
  if (msg.type !== 'doc') return
  const m = msg as unknown as Doc
  // Same document, changed on disk: live update, the view doesn't move. Else a page: scroll to the
  // hash, the top, or where this document was (back/forward).
  const isLive = m.key === state.key && m.scroll === 'keep' && !m.hash
  if (state.key && !isLive) state.scrolls.set(state.key, scrollY)
  state.key = m.key
  state.text = m.text
  state.rev = m.rev
  if (isLive) void show(m.text, 'live')
  else
    void show(m.text, 'page', () => {
      if (m.hash) scrollToHash(m.hash)
      else scrollTo(0, m.scroll === 'restore' ? (state.scrolls.get(m.key) ?? m.y ?? 0) : 0)
    })
}
