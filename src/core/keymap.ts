// Keyboard shortcuts: actions with default chords, user overrides (settings `bindings`), the
// resolved keymap (chord → action), shared by main (matches keys in before-input-event) and
// renderer (runs actions). Pure, renderer-safe, unit-tested. docs/INPUT.md "Keyboard".

export type Action =
  | 'split-right' | 'split-down'
  | 'file-right' | 'file-down' // the file template (picker) beside the active tile, like split-*
  | 'focus-left' | 'focus-right' | 'focus-up' | 'focus-down'
  | 'swap-left' | 'swap-right' | 'swap-up' | 'swap-down' // with the tile focus-* would reach
  | 'toggle-shelf' // shelve the active tile; shown shelved: unshelve
  | 'close-tile'
  | 'new-tab' | 'close-tab' | 'next-tab' | 'prev-tab'
  | 'nav-back' | 'nav-forward' | 'nav-reload' | 'nav-location' // active tile's navigation (Surface.nav); no-op elsewhere
  | 'zoom-in' | 'zoom-out' | 'zoom-reset' // active tile's page zoom (Surface.zoom: html, browser); no-op elsewhere
  | 'quit' // asks first (renderer quit.ts); never suspended (main/keys.ts)
  | `tab-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`

// One action: its default chord, hidden default-only aliases (dropped once customized), table label.
export interface ActionSpec {
  id: Action
  label: string
  chord: string
  aliases?: string[]
}

// Table order. Chord: modifiers (Cmd, Ctrl, Alt, Shift, in that order) + key, as chord() makes it.
// Never Esc or editing combos (copy, paste, cut, select all, undo): content and text fields keep them.
export const ACTIONS: readonly ActionSpec[] = [
  { id: 'split-right', label: 'Split right', chord: 'Cmd+D' },
  { id: 'split-down', label: 'Split down', chord: 'Cmd+Shift+D' },
  { id: 'file-right', label: 'Open file right', chord: 'Cmd+O' },
  { id: 'file-down', label: 'Open file down', chord: 'Cmd+Shift+O' },
  { id: 'focus-left', label: 'Focus left', chord: 'Cmd+Left' },
  { id: 'focus-right', label: 'Focus right', chord: 'Cmd+Right' },
  { id: 'focus-up', label: 'Focus up', chord: 'Cmd+Up' },
  { id: 'focus-down', label: 'Focus down', chord: 'Cmd+Down' },
  { id: 'swap-left', label: 'Swap left', chord: 'Cmd+Shift+Left' },
  { id: 'swap-right', label: 'Swap right', chord: 'Cmd+Shift+Right' },
  { id: 'swap-up', label: 'Swap up', chord: 'Cmd+Shift+Up' },
  { id: 'swap-down', label: 'Swap down', chord: 'Cmd+Shift+Down' },
  { id: 'toggle-shelf', label: 'Shelve / unshelve tile', chord: 'Cmd+S' },
  { id: 'close-tile', label: 'Close tile', chord: 'Cmd+W' },
  { id: 'new-tab', label: 'New tab', chord: 'Cmd+T' },
  { id: 'close-tab', label: 'Close tab', chord: 'Cmd+Shift+W' },
  { id: 'next-tab', label: 'Next tab', chord: 'Ctrl+Tab' },
  { id: 'prev-tab', label: 'Previous tab', chord: 'Ctrl+Shift+Tab' },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n): ActionSpec => ({ id: `tab-${n}` as Action, label: n === 9 ? 'Last tab' : `Tab ${n}`, chord: `Cmd+${n}` })),
  { id: 'nav-back', label: 'Back', chord: 'Cmd+[' },
  { id: 'nav-forward', label: 'Forward', chord: 'Cmd+]' },
  { id: 'nav-reload', label: 'Reload', chord: 'Cmd+R' },
  { id: 'nav-location', label: 'Focus location', chord: 'Cmd+L' },
  // Shift held on the = key (as browsers: cmd+shift+= too); `+` as its own key on some layouts.
  { id: 'zoom-in', label: 'Zoom in', chord: 'Cmd+=', aliases: ['Cmd+Shift++', 'Cmd++'] },
  { id: 'zoom-out', label: 'Zoom out', chord: 'Cmd+-' },
  { id: 'zoom-reset', label: 'Reset zoom', chord: 'Cmd+0' },
  { id: 'quit', label: 'Quit', chord: 'Cmd+Q' },
]

const SPECS = new Map(ACTIONS.map((a) => [a.id, a]))
export const isAction = (x: unknown): x is Action => typeof x === 'string' && SPECS.has(x as Action)

export type Keymap = Record<string, Action>

// User overrides (settings `bindings`), sparse: an action present is customized; null = unbound.
export type Bindings = Partial<Record<Action, string | null>>

// Chords an action answers to: its override (none if null), else its default + aliases.
export function chordsOf(action: Action, bindings: Bindings = {}): string[] {
  if (Object.hasOwn(bindings, action)) {
    const c = bindings[action]
    return typeof c === 'string' && !validBinding(c) ? [c] : []
  }
  const s = SPECS.get(action)
  return s ? [s.chord, ...(s.aliases ?? [])] : []
}

// Malformed overrides (bad chord) count as absent: the action keeps its default (as sanitize()).
const usable = (bindings: Bindings): Bindings => {
  const out: Bindings = {}
  for (const a of ACTIONS)
    if (Object.hasOwn(bindings, a.id) && (bindings[a.id] === null || (typeof bindings[a.id] === 'string' && !validBinding(bindings[a.id] as string)))) out[a.id] = bindings[a.id]
  return out
}

// chord → action. Deterministic on any input (conflicts are refused at save, but a hand-edited
// file may hold them): overrides claim first, in ACTIONS order, then defaults fill free chords.
export function resolveKeymap(bindings: Bindings = {}): Keymap {
  const b = usable(bindings)
  const map: Keymap = {}
  const claim = (a: Action) => {
    for (const c of chordsOf(a, b)) if (!Object.hasOwn(map, c)) map[c] = a
  }
  for (const a of ACTIONS) if (Object.hasOwn(b, a.id)) claim(a.id)
  for (const a of ACTIONS) if (!Object.hasOwn(b, a.id)) claim(a.id)
  return map
}

export interface Conflict {
  chord: string
  actions: [Action, Action] // ACTIONS order
}

// Pairs of actions answering to the same chord (default aliases included).
export function conflicts(bindings: Bindings = {}): Conflict[] {
  const b = usable(bindings)
  const owner = new Map<string, Action>()
  const out: Conflict[] = []
  for (const a of ACTIONS)
    for (const c of chordsOf(a.id, b)) {
      const o = owner.get(c)
      if (o && o !== a.id) out.push({ chord: c, actions: [o, a.id] })
      else owner.set(c, a.id)
    }
  return out
}

const MODS = ['Cmd', 'Ctrl', 'Alt', 'Shift'] as const
const NAMED = new Set(['Left', 'Right', 'Up', 'Down', 'Home', 'End', 'PageUp', 'PageDown', 'Delete', 'Insert', 'Space', 'Escape', 'Tab', 'Enter', 'Backspace'])
const FN = /^F([1-9]|1[0-9]|2[0-4])$/
// Capture fields' own keys (Escape cancels, Backspace empties, Enter accepts). Tab is a key like
// any other there (Ctrl+Tab: next tab).
const RESERVED_KEYS = new Set(['Escape', 'Enter', 'Backspace'])
// Editing combos (content and text fields keep them) and the Settings menu item.
const RESERVED_CHORDS = new Set(['Cmd+C', 'Cmd+V', 'Cmd+X', 'Cmd+A', 'Cmd+Z', 'Cmd+Shift+Z', 'Cmd+,'])

// Chord → {mods, key}, or null if malformed (not as chord() would produce it).
export function parseChord(c: string): { mods: (typeof MODS)[number][]; key: string } | null {
  if (typeof c !== 'string' || !c) return null
  const plus = c.endsWith('++') || c === '+'
  const cut = plus ? c.length - 1 : c.lastIndexOf('+') + 1
  const key = c.slice(cut)
  const head = c.slice(0, cut)
  const mods = head ? head.slice(0, -1).split('+') : []
  let i = 0
  for (const m of mods) {
    const at = MODS.indexOf(m as (typeof MODS)[number], i)
    if (at < 0) return null
    i = at + 1
  }
  const single = key.length === 1 && key.trim() === key && key === key.toUpperCase() && !/[\x00-\x1f\x7f]/.test(key)
  if (!single && !NAMED.has(key) && !FN.test(key)) return null
  return { mods: mods as (typeof MODS)[number][], key }
}

// Error text, or null if the chord may be bound.
export function validBinding(c: string): string | null {
  const p = parseChord(c)
  if (!p) return `Not a key combination: ${String(c)}`
  if (RESERVED_KEYS.has(p.key)) return `Reserved key: ${p.key}`
  if (RESERVED_CHORDS.has(c)) return `Reserved combination: ${c}`
  if (!p.mods.includes('Cmd') && !p.mods.includes('Ctrl') && !FN.test(p.key)) return `Needs Cmd or Ctrl (or a function key): ${c}`
  return null
}

const labelOf = (a: string) => SPECS.get(a as Action)?.label ?? a

// Problems with a `bindings` value, as messages naming the action(s). Empty = valid.
export function bindingErrors(x: unknown): string[] {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return ['Bindings must be an object']
  const errors: string[] = []
  for (const [a, c] of Object.entries(x)) {
    if (!isAction(a)) errors.push(`Unknown action: ${a}`)
    else if (c !== null && typeof c !== 'string') errors.push(`${labelOf(a)}: not a key combination`)
    else if (typeof c === 'string') {
      const e = validBinding(c)
      if (e) errors.push(`${labelOf(a)}: ${e}`)
    }
  }
  if (!errors.length)
    for (const { chord: c, actions: [a, b] } of conflicts(x as Bindings)) errors.push(`${labelOf(a)} and ${labelOf(b)} both use ${c}`)
  return errors
}

// Known actions with null or a valid chord; everything else dropped (hand-edited files). Never throws.
export function cleanBindings(x: unknown): Bindings {
  const out: Bindings = {}
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return out
  for (const a of ACTIONS) {
    if (!Object.hasOwn(x, a.id)) continue
    const c = (x as Record<string, unknown>)[a.id]
    if (c === null || (typeof c === 'string' && !validBinding(c))) out[a.id] = c
  }
  return out
}

// Electron accelerator for a menu label (display only), or null (unbound, or not expressible).
export function accelerator(c: string | undefined): string | null {
  const p = c ? parseChord(c) : null
  if (!p) return null
  let key = p.key
  if (key === '+') key = 'Plus'
  else if (key.length === 1 && !/^[\x21-\x7e]$/.test(key)) return null
  return [...p.mods, key].join('+')
}

// Defaults only (no overrides).
export const DEFAULT_KEYMAP: Keymap = resolveKeymap()

// A key as main sees it (Electron Input) or as the DOM does (mapped by the caller).
export interface KeyInput {
  key: string
  code?: string // physical key (DOM `code`): names the key while Alt is held
  meta: boolean
  control: boolean
  alt: boolean
  shift: boolean
}

const KEY_NAMES: Record<string, string> = { ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', ' ': 'Space' }

// Alt on macOS composes: Alt+D reports key `∂` (or `Dead`). With Alt held the key is named from
// its physical position instead (US names: KeyD → D), so Alt chords are typeable and readable.
const CODE_KEYS: Record<string, string> = {
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  Backslash: '\\', Backquote: '`',
}
function altKey(code: string | undefined): string | undefined {
  if (!code) return undefined
  const m = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(code)
  return m ? (m[1] ?? m[2]) : CODE_KEYS[code]
}

const held = (k: KeyInput) => [k.meta && 'Cmd', k.control && 'Ctrl', k.alt && 'Alt', k.shift && 'Shift'].filter(Boolean) as string[]

export function chord(k: KeyInput): string {
  const key = (k.alt && altKey(k.code)) || (KEY_NAMES[k.key] ?? (k.key.length === 1 ? k.key.toUpperCase() : k.key))
  return [...held(k), key].join('+')
}

// Capture fields (settings: key search, binding edit; renderer/capture.ts). A key press there is
// either the field's own (Escape, Enter, Backspace without Cmd / Ctrl / Alt: passes to it),
// a modifier (held ones shown live: `Cmd+Shift+`, not a chord yet) or a complete chord.
export interface Captured {
  chord: string // complete: the chord; else the held modifiers with a trailing `+` ('' = none)
  complete: boolean
}
const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Alt', 'Shift', 'AltGraph', 'CapsLock', 'Fn'])
export const capturePasses = (k: KeyInput): boolean => RESERVED_KEYS.has(k.key) && !k.meta && !k.control && !k.alt
export function captured(k: KeyInput): Captured {
  if (!MODIFIER_KEYS.has(k.key)) return { chord: chord(k), complete: true }
  const mods = held(k)
  return { chord: mods.length ? mods.join('+') + '+' : '', complete: false }
}

export function actionFor(k: KeyInput, keymap: Keymap = DEFAULT_KEYMAP): Action | undefined {
  const c = chord(k)
  return Object.hasOwn(keymap, c) ? keymap[c] : undefined
}
