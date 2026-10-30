// Keyboard shortcuts: keymap (chord → action), shared by main (matches keys in before-input-event)
// and renderer (runs actions). Pure, renderer-safe, unit-tested. docs/INPUT.md.

export type Action =
  | 'split-right' | 'split-down'
  | 'file-right' | 'file-down' // the file template (picker) beside the active tile, like split-*
  | 'focus-left' | 'focus-right' | 'focus-up' | 'focus-down'
  | 'swap-left' | 'swap-right' | 'swap-up' | 'swap-down' // with the tile focus-* would reach
  | 'toggle-shelf' // shelve the active tile; shown shelved: unshelve
  | 'close-tile'
  | 'new-tab' | 'close-tab' | 'next-tab' | 'prev-tab'
  | 'nav-back' | 'nav-forward' | 'nav-reload' | 'nav-location' // active tile's navigation (Surface.nav); no-op elsewhere
  | 'quit' // asks first (renderer quit.ts); never suspended (main/keys.ts)
  | `tab-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`

// Defaults; settings will override per chord later. Chord: modifiers (Cmd, Ctrl, Alt, Shift) + key.
// Never Esc or editing combos (copy, paste, cut, select all, undo): content and text fields keep them.
export const DEFAULT_KEYMAP: Record<string, Action> = {
  'Cmd+D': 'split-right',
  'Cmd+Shift+D': 'split-down',
  'Cmd+O': 'file-right',
  'Cmd+Shift+O': 'file-down',
  'Cmd+Left': 'focus-left',
  'Cmd+Right': 'focus-right',
  'Cmd+Up': 'focus-up',
  'Cmd+Down': 'focus-down',
  'Cmd+Shift+Left': 'swap-left',
  'Cmd+Shift+Right': 'swap-right',
  'Cmd+Shift+Up': 'swap-up',
  'Cmd+Shift+Down': 'swap-down',
  'Cmd+S': 'toggle-shelf',
  'Cmd+T': 'new-tab',
  'Cmd+W': 'close-tile',
  'Cmd+Shift+W': 'close-tab',
  'Ctrl+Tab': 'next-tab',
  'Ctrl+Shift+Tab': 'prev-tab',
  'Cmd+[': 'nav-back',
  'Cmd+]': 'nav-forward',
  'Cmd+R': 'nav-reload',
  'Cmd+L': 'nav-location',
  'Cmd+Q': 'quit',
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`Cmd+${n}`, `tab-${n}` as Action])),
}

// A key as main sees it (Electron Input) or as the DOM does (mapped by the caller).
export interface KeyInput {
  key: string
  meta: boolean
  control: boolean
  alt: boolean
  shift: boolean
}

const KEY_NAMES: Record<string, string> = { ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down' }

export function chord(k: KeyInput): string {
  const key = KEY_NAMES[k.key] ?? (k.key.length === 1 ? k.key.toUpperCase() : k.key)
  return [k.meta && 'Cmd', k.control && 'Ctrl', k.alt && 'Alt', k.shift && 'Shift', key].filter(Boolean).join('+')
}

export function actionFor(k: KeyInput, keymap: Record<string, Action> = DEFAULT_KEYMAP): Action | undefined {
  const c = chord(k)
  return Object.hasOwn(keymap, c) ? keymap[c] : undefined
}
