// Mermaid diagrams for the markdown viewer: ```mermaid fences render as SVG, in this frame (no
// other frame). The library (markdown-mermaid.js: @mermaid-js/tiny, pinned) is a separate viewer
// asset, loaded only when a document has a diagram. docs/MARKDOWN.md "Diagrams".
import DOMPurify from 'dompurify'
import { NONCE } from './runtime'
import { hash } from './live'

interface Mermaid {
  initialize(config: Record<string, unknown>): void
  render(id: string, text: string): Promise<{ svg: string }>
}

// SECURITY: settings a diagram can never change through `%%{init: ...}%%` directives (Mermaid's
// `secure` list). strict: labels sanitized by Mermaid, no click callbacks, no javascript: links.
// htmlLabels off: labels are SVG text, never HTML (no foreignObject). Limits bound the work a
// document can ask for (the frame watchdog covers the rest).
const SECURE = ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'suppressErrorRendering', 'htmlLabels', 'flowchart', 'theme', 'themeVariables', 'themeCSS', 'fontFamily', 'altFontFamily', 'fontSize', 'darkMode', 'deterministicIds', 'deterministicIDSeed', 'arrowMarkerAbsolute']
export const LIMITS = { maxTextSize: 50_000, maxEdges: 500 }

// SECURITY: Mermaid's output is sanitized again before it reaches the page: SVG only (no HTML, no
// foreignObject, no <use>, no scripts or handlers), no <image> (no resource loads), links only
// http(s) / relative (clicks go through the host like any link). <style> stays: the diagram's
// colors live there (scoped to its id; inline CSS is all the frame's CSP allows).
const PURIFY_SVG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  FORBID_TAGS: ['image', 'feImage'],
  ALLOWED_URI_REGEXP: /^(?:https?:|#|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
}
export const sanitizeSvg = (svg: string) => DOMPurify.sanitize(svg, PURIFY_SVG)

// Harness view (window.markdown.diagrams).
export const diagrams = { loaded: false, renders: 0, errors: 0, config: null as Record<string, unknown> | null }

let lib: Promise<Mermaid> | null = null
function load(): Promise<Mermaid> {
  return (lib ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.nonce = NONCE
    s.src = './markdown-mermaid.js' // tie-content://<token>/_tie/: served to markdown tiles only
    s.onload = () => {
      const m = (globalThis as { mermaid?: Mermaid }).mermaid
      if (typeof m?.render !== 'function') return reject(new Error('diagram library missing'))
      diagrams.loaded = true
      resolve(m)
    }
    s.onerror = () => reject(new Error('diagram library failed to load'))
    document.head.append(s)
  }))
}

// Theme → Mermaid's "base" theme. Mermaid computes shades itself, so it needs real colors: the
// host's hex values, mixed here (CSS color-mix can't reach it).
type Vars = Record<string, string>
const rgb = (c: string | undefined) => {
  const m = /^#([0-9a-f]{6})$/i.exec((c ?? '').trim())
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null
}
const mix = (a: string | undefined, b: string | undefined, t: number) => {
  const x = rgb(a)
  const y = rgb(b)
  if (!x || !y) return a ?? b ?? ''
  return '#' + x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('')
}

function config(vars: Vars, dark: boolean): Record<string, unknown> {
  const v = (k: string) => vars[k]
  const bg = v('--bg')
  const fg = v('--fg')
  const accent = v('--accent')
  const a = (i: number) => v(`--a${i}`)
  const series = [4, 5, 2, 3, 6, 1, 12, 13, 10, 11, 14, 9].map(a)
  const tv: Record<string, unknown> = {
    darkMode: dark,
    background: bg,
    fontFamily: v('--font'),
    fontSize: v('--size'),
    textColor: fg,
    primaryColor: mix(accent, bg, 0.2),
    primaryTextColor: fg,
    primaryBorderColor: mix(accent, bg, 0.7),
    secondaryColor: mix(a(5), bg, 0.18),
    secondaryTextColor: fg,
    secondaryBorderColor: mix(a(5), bg, 0.6),
    tertiaryColor: mix(fg, bg, 0.06),
    tertiaryTextColor: fg,
    tertiaryBorderColor: mix(fg, bg, 0.3),
    lineColor: mix(fg, bg, 0.6),
    mainBkg: mix(accent, bg, 0.2),
    nodeBorder: mix(accent, bg, 0.7),
    nodeTextColor: fg,
    clusterBkg: mix(fg, bg, 0.05),
    clusterBorder: mix(fg, bg, 0.3),
    titleColor: fg,
    edgeLabelBackground: bg,
    noteBkgColor: mix(a(3), bg, 0.2),
    noteTextColor: fg,
    noteBorderColor: mix(a(3), bg, 0.6),
    errorBkgColor: mix(a(1), bg, 0.25),
    errorTextColor: fg,
    pieStrokeColor: bg,
    pieOuterStrokeColor: mix(fg, bg, 0.3),
    pieSectionTextColor: bg,
    pieTitleTextColor: fg,
    pieLegendTextColor: fg,
    commitLabelColor: fg,
    commitLabelBackground: mix(fg, bg, 0.1),
    tagLabelColor: fg,
    tagLabelBackground: mix(accent, bg, 0.2),
    tagLabelBorder: mix(accent, bg, 0.7),
  }
  series.forEach((c, i) => {
    tv[`pie${i + 1}`] = c
    tv[`cScale${i}`] = mix(c, bg, 0.35)
    if (i < 8) {
      tv[`git${i}`] = c
      tv[`gitBranchLabel${i}`] = bg
      tv[`gitInv${i}`] = bg
    }
  })
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    suppressErrorRendering: true,
    deterministicIds: true,
    ...LIMITS,
    theme: 'base',
    themeVariables: tv,
    fontFamily: v('--font'),
    darkMode: dark,
    secure: SECURE,
  }
}

export const diagramSource = (block: Element) => block.querySelector('pre.diagram-src')?.textContent ?? ''

// Results by render id: same source (and occurrence, theme) → same id → same SVG, so an unchanged
// diagram is byte-identical across live updates (the DOM diff keeps it). Errors are cached too.
type Result = { svg: string } | { error: string }
const cache = new Map<string, Result>()
let themeGen = 0
export function themeChanged() {
  themeGen++
  cache.clear()
}

function blocksOf(root: HTMLElement) {
  const seen = new Map<string, number>()
  return [...root.querySelectorAll<HTMLElement>('div.diagram')].map((block) => {
    const src = diagramSource(block)
    const h = hash(src)
    const n = seen.get(h) ?? 0
    seen.set(h, n + 1)
    return { block, src, id: `d${h}${n ? `-${n}` : ''}t${themeGen}` }
  })
}

// Fill diagram blocks in `root` (usually off-document) from the cache. True if some still need
// Mermaid. Drops cache entries the document no longer uses.
export function fillDiagrams(root: HTMLElement): boolean {
  const all = blocksOf(root)
  const used = new Set(all.map((d) => d.id))
  for (const id of cache.keys()) if (!used.has(id)) cache.delete(id)
  let pending = false
  for (const d of all) {
    const r = cache.get(d.id)
    if (r) show(d.block, r)
    else pending = true
  }
  return pending
}

// Render the blocks the cache didn't fill. `current()` false: superseded (newer document or theme),
// stop. Mermaid draws in its own scratch element; `root` may be off-document.
export async function renderDiagrams(root: HTMLElement, vars: Vars, dark: boolean, current: () => boolean) {
  const todo = blocksOf(root).filter((d) => !cache.has(d.id))
  if (!todo.length) return
  let m: Mermaid
  try {
    m = await load()
  } catch (e) {
    if (current()) todo.forEach((d) => show(d.block, { error: message(e) }))
    return
  }
  if (!current()) return
  diagrams.config = config(vars, dark)
  m.initialize(diagrams.config)
  for (const d of todo) {
    let r: Result
    try {
      r = { svg: sanitizeSvg((await m.render(d.id, d.src)).svg) }
      diagrams.renders++
    } catch (e) {
      r = { error: message(e) }
      diagrams.errors++
    }
    if (!current()) return
    cache.set(d.id, r)
    show(d.block, r)
  }
}

// Rendered: SVG shown, source hidden. Error: source stays, plus one line under it.
function show(block: HTMLElement, r: Result) {
  block.querySelector('.diagram-svg')?.remove()
  block.querySelector('.diagram-error')?.remove()
  block.classList.toggle('rendered', 'svg' in r)
  if ('svg' in r) {
    const out = Object.assign(document.createElement('div'), { className: 'diagram-svg' })
    out.innerHTML = r.svg // sanitized (sanitizeSvg)
    block.append(out)
  } else block.append(Object.assign(document.createElement('div'), { className: 'diagram-error', textContent: `Diagram error: ${r.error}` }))
}

// First line of Mermaid's message, plus its last (the "Expecting ..." part of parse errors).
function message(e: unknown): string {
  const lines = String((e as Error)?.message ?? e).split('\n').map((l) => l.trim()).filter(Boolean)
  return (lines.length > 1 ? `${lines[0]} ${lines[lines.length - 1]}` : (lines[0] ?? 'unknown error')).slice(0, 240)
}
