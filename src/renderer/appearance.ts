// Look: theme colors (app-wide) and line height (tile content only) applied to CSS tokens and terminals.
import { S } from './state'
import { fitTile } from './tile'
import { theme, xtermTheme, DEFAULT_THEME } from './themes'

export interface Appearance {
  theme: string
  lineHeight: number
  fontFamily: string // '' = default stack
  fontSize: number
  cellWidth: number // percent of natural character width (kitty's cell_width)
  borderless?: boolean // window controls hidden: tab bar starts at the left edge
}

const FALLBACK_FONTS = '"Hack", "JetBrains Mono", "SF Mono", Menlo, monospace'

let current: Appearance = { theme: DEFAULT_THEME, lineHeight: 1.15, fontFamily: '', fontSize: 12, cellWidth: 100 }

export const fontStack = (family: string) => (family ? `"${family.replace(/"/g, '')}", ${FALLBACK_FONTS}` : FALLBACK_FONTS)

const CANDIDATES = ['MesloLGS Nerd Font Mono', 'JetBrains Mono', 'SF Mono', 'Menlo', 'Monaco', 'Courier New', 'Hack', 'Fira Code', 'Iosevka', 'Cascadia Code', 'Source Code Pro', 'IBM Plex Mono', 'Ubuntu Mono', 'Roboto Mono', 'Inconsolata', 'Andale Mono', 'PT Mono']

function isMonospace(family: string): boolean {
  measure.font = `20px "${family.replace(/"/g, '')}", serif`
  return Math.abs(measure.measureText('iiiiiiii').width - measure.measureText('WWWWWWWW').width) < 0.5
}

// Installed monospace families: system font list when available, else known candidates.
let fontCache: Promise<string[]> | null = null
export function monospaceFonts(): Promise<string[]> {
  return (fontCache ??= queryMonospaceFonts())
}

async function queryMonospaceFonts(): Promise<string[]> {
  let families: string[] = []
  try {
    const q = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts
    if (q) families = [...new Set((await q()).map((f) => f.family))]
  } catch {}
  if (!families.length) families = CANDIDATES.filter(fontInstalled)
  return families.filter(isMonospace).sort((a, b) => a.localeCompare(b))
}

// Whether a font family is installed: an installed font renders differently from the bare fallback.
export function fontInstalled(family: string): boolean {
  if (!family) return true
  const c = document.createElement('canvas').getContext('2d')!
  const sample = 'mmmmmmmmmmlli10OO@#'
  c.font = '40px serif' // proportional baseline: monospace fonts (Meslo ≈ Menlo) differ from it
  const base = c.measureText(sample).width
  c.font = `40px "${family.replace(/"/g, '')}", serif`
  return c.measureText(sample).width !== base
}

export const appearance = () => current

const measure = document.createElement('canvas').getContext('2d')!

// xterm has no cell-width scale; emulate it with letterSpacing. xterm adds Math.round(letterSpacing)
// to the cell width in *device* pixels, so pass the delta in device px (nearest achievable width).
function letterSpacing(a: Appearance): number {
  measure.font = `${a.fontSize}px ${fontStack(a.fontFamily)}`
  const deviceW = measure.measureText('W').width * devicePixelRatio
  return Math.round(deviceW * (a.cellWidth / 100 - 1))
}

export function termOptions() {
  return {
    theme: xtermTheme(theme(current.theme)),
    lineHeight: current.lineHeight,
    fontFamily: fontStack(current.fontFamily),
    fontSize: current.fontSize,
    letterSpacing: letterSpacing(current),
  }
}

// Cell width depends on device pixels: re-apply when the window moves to a display with another DPR.
function watchDpr() {
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => {
    applyAppearance(current)
    watchDpr()
  }, { once: true })
}
watchDpr()

export function applyAppearance(a: Appearance) {
  current = a
  const t = theme(a.theme)
  const p = t.palette
  const root = document.documentElement.style
  root.setProperty('--bg', p.background)
  root.setProperty('--text', p.foreground)
  root.setProperty('--accent', t.accent)
  root.setProperty('--red', p.ansi[1])
  root.setProperty('--green', p.ansi[2])
  root.setProperty('--yellow', p.ansi[3])
  root.setProperty('--tile-line-height', String(a.lineHeight))
  root.setProperty('--tile-font', fontStack(a.fontFamily))
  root.setProperty('--tile-font-size', `${a.fontSize}px`)
  root.setProperty('color-scheme', t.dark ? 'dark' : 'light')
  document.documentElement.classList.toggle('light', !t.dark)
  document.documentElement.classList.toggle('borderless', !!a.borderless)
  const opts = termOptions()
  for (const tile of S.tiles.values()) {
    tile.term.options.theme = opts.theme
    tile.term.options.lineHeight = opts.lineHeight
    tile.term.options.fontFamily = opts.fontFamily
    tile.term.options.fontSize = opts.fontSize
    tile.term.options.letterSpacing = opts.letterSpacing
    if (tile.term.element) fitTile(tile) // cell size changed
  }
}
