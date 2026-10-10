// Color themes. Terminal palette + accent; UI colors are derived from these app-wide.

export interface Palette {
  background: string
  foreground: string
  cursor: string
  selectionBackground: string
  selectionForeground?: string
  ansi: string[] // 16: black red green yellow blue magenta cyan white, then bright
}

export interface Theme {
  label: string
  dark: boolean
  accent: string
  palette: Palette
}

const ansi = (s: string) => s.trim().split(/\s+/)

export const THEMES: Record<string, Theme> = {
  'tie-dark': {
    label: 'Tie Dark',
    dark: true,
    accent: '#74c0fc',
    palette: {
      background: '#000000', foreground: '#e4e4e4', cursor: '#74c0fc', selectionBackground: '#74c0fc55',
      ansi: ansi('#1e1e1e #f47067 #8ddb8c #f0c674 #74c0fc #dcbdfb #76e3ea #d0d0d0 #6e7681 #ff938a #b4f1b4 #f8e3a1 #a5d8ff #eedcff #b3f0ff #ffffff'),
    },
  },
  'elegant-dark': {
    label: 'Elegant Dark',
    dark: true,
    accent: '#a6cdfa',
    palette: {
      // From ~/.config/kitty/kitty.conf
      background: '#22252c', foreground: '#dbded8', cursor: '#dbded8', selectionBackground: '#fefefd', selectionForeground: '#000000',
      ansi: ansi('#686966 #eb5443 #bdfc69 #f9eb77 #a6cdfa #f6caf4 #7ef9fd #fefefd #686966 #eb5443 #bdfc69 #f9eb77 #a6cdfa #f6caf4 #7ef9fd #fefefd'),
    },
  },
  dracula: {
    label: 'Dracula',
    dark: true,
    accent: '#bd93f9',
    palette: {
      background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', selectionBackground: '#44475a',
      ansi: ansi('#21222c #ff5555 #50fa7b #f1fa8c #bd93f9 #ff79c6 #8be9fd #f8f8f2 #6272a4 #ff6e6e #69ff94 #ffffa5 #d6acff #ff92df #a4ffff #ffffff'),
    },
  },
  nord: {
    label: 'Nord',
    dark: true,
    accent: '#88c0d0',
    palette: {
      background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', selectionBackground: '#434c5e',
      ansi: ansi('#3b4252 #bf616a #a3be8c #ebcb8b #81a1c1 #b48ead #88c0d0 #e5e9f0 #4c566a #bf616a #a3be8c #ebcb8b #81a1c1 #b48ead #8fbcbb #eceff4'),
    },
  },
  'gruvbox-dark': {
    label: 'Gruvbox Dark',
    dark: true,
    accent: '#83a598',
    palette: {
      background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2', selectionBackground: '#504945',
      ansi: ansi('#282828 #cc241d #98971a #d79921 #458588 #b16286 #689d6a #a89984 #928374 #fb4934 #b8bb26 #fabd2f #83a598 #d3869b #8ec07c #ebdbb2'),
    },
  },
  'one-dark': {
    label: 'One Dark',
    dark: true,
    accent: '#61afef',
    palette: {
      background: '#282c34', foreground: '#abb2bf', cursor: '#528bff', selectionBackground: '#3e4451',
      ansi: ansi('#282c34 #e06c75 #98c379 #e5c07b #61afef #c678dd #56b6c2 #abb2bf #5c6370 #e06c75 #98c379 #e5c07b #61afef #c678dd #56b6c2 #ffffff'),
    },
  },
  'tokyo-night': {
    label: 'Tokyo Night',
    dark: true,
    accent: '#7aa2f7',
    palette: {
      background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5', selectionBackground: '#33467c',
      ansi: ansi('#15161e #f7768e #9ece6a #e0af68 #7aa2f7 #bb9af7 #7dcfff #a9b1d6 #414868 #f7768e #9ece6a #e0af68 #7aa2f7 #bb9af7 #7dcfff #c0caf5'),
    },
  },
  'catppuccin-mocha': {
    label: 'Catppuccin Mocha',
    dark: true,
    accent: '#89b4fa',
    palette: {
      background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', selectionBackground: '#585b70',
      ansi: ansi('#45475a #f38ba8 #a6e3a1 #f9e2af #89b4fa #f5c2e7 #94e2d5 #bac2de #585b70 #f38ba8 #a6e3a1 #f9e2af #89b4fa #f5c2e7 #94e2d5 #a6adc8'),
    },
  },
  'solarized-dark': {
    label: 'Solarized Dark',
    dark: true,
    accent: '#268bd2',
    palette: {
      background: '#002b36', foreground: '#839496', cursor: '#93a1a1', selectionBackground: '#073642',
      ansi: ansi('#073642 #dc322f #859900 #b58900 #268bd2 #d33682 #2aa198 #eee8d5 #002b36 #cb4b16 #586e75 #657b83 #839496 #6c71c4 #93a1a1 #fdf6e3'),
    },
  },
  'solarized-light': {
    label: 'Solarized Light',
    dark: false,
    accent: '#268bd2',
    palette: {
      background: '#fdf6e3', foreground: '#657b83', cursor: '#586e75', selectionBackground: '#eee8d5',
      ansi: ansi('#073642 #dc322f #859900 #b58900 #268bd2 #d33682 #2aa198 #eee8d5 #002b36 #cb4b16 #586e75 #657b83 #839496 #6c71c4 #93a1a1 #fdf6e3'),
    },
  },
}

export const DEFAULT_THEME = 'tie-dark'

export const theme = (id: string): Theme => THEMES[id] ?? THEMES[DEFAULT_THEME]

const NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']

// xterm ITheme.
export function xtermTheme(t: Theme) {
  const p = t.palette
  const out: Record<string, string> = {
    background: p.background,
    foreground: p.foreground,
    cursor: p.cursor,
    cursorAccent: p.background,
    selectionBackground: p.selectionBackground,
  }
  if (p.selectionForeground) out.selectionForeground = p.selectionForeground
  p.ansi.forEach((c, i) => {
    const n = NAMES[i % 8]
    out[i < 8 ? n : `bright${n[0].toUpperCase()}${n.slice(1)}`] = c
  })
  return out
}
