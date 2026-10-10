// Look: theme colors (app-wide) and line height (tile content only) applied to CSS tokens and terminals.
import { S } from './state'
import { theme, xtermTheme, DEFAULT_THEME } from './themes'

export interface Appearance {
  theme: string
  lineHeight: number
}

let current: Appearance = { theme: DEFAULT_THEME, lineHeight: 1.15 }

export const appearance = () => current

export function termOptions() {
  return { theme: xtermTheme(theme(current.theme)), lineHeight: current.lineHeight }
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
  root.setProperty('color-scheme', t.dark ? 'dark' : 'light')
  document.documentElement.classList.toggle('light', !t.dark)
  const opts = termOptions()
  for (const tile of S.tiles.values()) {
    tile.term.options.theme = opts.theme
    tile.term.options.lineHeight = opts.lineHeight
  }
}
