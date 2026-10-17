// Mermaid diagrams for the markdown viewer: ```mermaid fences render as SVG, in this frame (no
// other frame). The library (markdown-mermaid.js: @mermaid-js/tiny, pinned) is a separate viewer
// asset, loaded only when a document has a diagram. docs/MARKDOWN.md "Diagrams".
import DOMPurify from 'dompurify'

interface Mermaid {
  initialize(config: Record<string, unknown>): void
  render(id: string, text: string): Promise<{ svg: string }>
}

// The page's script nonce: a script added later must carry it (CSP: scripts by nonce only).
const NONCE = (document.currentScript as HTMLScriptElement | null)?.nonce ?? ''

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

// Render every diagram block in `root` (<div class="diagram"><pre><code>source</code></pre></div>,
// from the fence rule). Rendered: SVG shown, source hidden. Error: source stays, plus one line.
// A newer call (new document, theme) makes older ones stop.
let gen = 0
export async function renderDiagrams(root: HTMLElement, vars: Vars, dark: boolean) {
  const g = ++gen
  const blocks = [...root.querySelectorAll<HTMLElement>('div.diagram')]
  if (!blocks.length) return
  let m: Mermaid
  try {
    m = await load()
  } catch (e) {
    if (g === gen) blocks.forEach((b) => fail(b, e))
    return
  }
  if (g !== gen) return
  diagrams.config = config(vars, dark)
  m.initialize(diagrams.config)
  for (const [i, block] of blocks.entries()) {
    const src = block.querySelector('pre.diagram-src')?.textContent ?? ''
    try {
      const { svg } = await m.render(`diagram-${g}-${i}`, src)
      if (g !== gen) return
      let out = block.querySelector<HTMLElement>('.diagram-svg')
      if (!out) block.append((out = Object.assign(document.createElement('div'), { className: 'diagram-svg' })))
      out.innerHTML = sanitizeSvg(svg)
      block.querySelector('.diagram-error')?.remove()
      block.classList.add('rendered')
      diagrams.renders++
    } catch (e) {
      if (g !== gen) return
      fail(block, e)
    }
  }
}

// Short error line under the source: first line of Mermaid's message, plus its last (the
// "Expecting ..." part of parse errors).
function fail(block: HTMLElement, e: unknown) {
  diagrams.errors++
  const lines = String((e as Error)?.message ?? e).split('\n').map((l) => l.trim()).filter(Boolean)
  const msg = (lines.length > 1 ? `${lines[0]} ${lines[lines.length - 1]}` : (lines[0] ?? 'unknown error')).slice(0, 240)
  block.classList.remove('rendered')
  block.querySelector('.diagram-svg')?.remove()
  let line = block.querySelector('.diagram-error')
  if (!line) block.append((line = Object.assign(document.createElement('div'), { className: 'diagram-error' })))
  line.textContent = `Diagram error: ${msg}`
}
