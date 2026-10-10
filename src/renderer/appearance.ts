// Look: theme colors (app-wide) and line height (tile content only) applied to CSS tokens and terminals.
import { S } from './state'
import { fitTile } from './tile'
import { theme, xtermTheme, DEFAULT_THEME } from './themes'

export interface Appearance {
  theme: string
  lineHeight: number
  fontFamily: string // '' = default stack
  fontSize: number
}

const FALLBACK_FONTS = '"Hack", "JetBrains Mono", "SF Mono", Menlo, monospace'

let current: Appearance = { theme: DEFAULT_THEME, lineHeight: 1.15, fontFamily: '', fontSize: 12 }

export const fontStack = (family: string) => (family ? `"${family.replace(/"/g, '')}", ${FALLBACK_FONTS}` : FALLBACK_FONTS)

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

export function termOptions() {
  return {
    theme: xtermTheme(theme(current.theme)),
    lineHeight: current.lineHeight,
    fontFamily: fontStack(current.fontFamily),
    fontSize: current.fontSize,
  }
}

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
  root.setProperty('--tile-line-height', String(a.lineHeight))
  root.setProperty('--tile-font', fontStack(a.fontFamily))
  root.setProperty('--tile-font-size', `${a.fontSize}px`)
  root.setProperty('color-scheme', t.dark ? 'dark' : 'light')
  document.documentElement.classList.toggle('light', !t.dark)
  const opts = termOptions()
  for (const tile of S.tiles.values()) {
    tile.term.options.theme = opts.theme
    tile.term.options.lineHeight = opts.lineHeight
    tile.term.options.fontFamily = opts.fontFamily
    tile.term.options.fontSize = opts.fontSize
    if (tile.term.element) fitTile(tile) // cell size changed
  }
}
