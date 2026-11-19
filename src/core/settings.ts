// Settings: shape, defaults and the pure rules (sanitize at load / save, validation before a save,
// command line parsing). The file itself: main/settings.ts. docs/SETTINGS.md.
import { bindingErrors, cleanBindings, type Bindings } from './keymap'

// Terminal tile title: program's own (OSC) else command | foreground command | working directory.
export const TERMINAL_TITLES = ['auto', 'command', 'directory'] as const
export type TerminalTitle = (typeof TERMINAL_TITLES)[number]

export interface Settings {
  shell: string // terminal tiles: command line for new terminals; '' = default
  theme: string // app-wide: theme id (renderer/themes.ts)
  lineHeight: number // all tiles: content line height
  fontFamily: string // all tiles: content font, '' = default monospace stack
  fontSize: number // all tiles: content font size (px)
  cellWidth: number // all tiles: character width, percent (kitty cell_width)
  borderless: boolean // app-wide: hide window controls (kitty hide_window_decorations)
  toolbar: 'top' | 'bottom' // app-wide: toolbar (tabs, shelf, templates) position
  terminalTitle: TerminalTitle // terminal tiles: what the title shows (TERMINALS.md)
  warnPasteControl: boolean // terminal tiles: confirm pastes/drops containing control characters
  warnPasteRun: boolean // terminal tiles: confirm pastes that would run commands (newline, no bracketed paste)
  confirmExternal: boolean // all tiles: confirm before a link opens in the system browser
  allowExternalControl: boolean // app-wide: socket callers outside Tie terminals may run commands
  gitignore: boolean // file picker: the walk skips what git ignores
  bindings: Bindings // app-wide: key binding overrides, sparse (action → chord, null = unbound; core/keymap.ts)
}

export const DEFAULTS: Settings = { shell: '', theme: 'tie-dark', lineHeight: 1.15, fontFamily: '', fontSize: 12, cellWidth: 100, borderless: false, toolbar: 'bottom', terminalTitle: 'command', warnPasteControl: true, warnPasteRun: true, confirmExternal: true, allowExternalControl: false, gitignore: true, bindings: {} }
export const THEME_ALIASES: Record<string, string> = { 'elegant-dark': 'tie-dark' }

// Clamp numbers into range; wrongly typed strings fall back to defaults (hand-edited files).
export function sanitize(s: Settings): Settings {
  const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d)
  const num = (v: unknown, min: number, max: number, d: number) => Math.min(max, Math.max(min, Number(v) || d))
  return {
    ...s,
    shell: str(s.shell, DEFAULTS.shell),
    theme: str(s.theme, DEFAULTS.theme),
    lineHeight: num(s.lineHeight, 1, 2, DEFAULTS.lineHeight),
    fontSize: num(s.fontSize, 8, 32, DEFAULTS.fontSize),
    cellWidth: num(s.cellWidth, 70, 150, DEFAULTS.cellWidth),
    fontFamily: str(s.fontFamily, DEFAULTS.fontFamily).trim(),
    borderless: typeof s.borderless === 'boolean' ? s.borderless : DEFAULTS.borderless,
    toolbar: s.toolbar === 'top' ? 'top' : 'bottom',
    terminalTitle: TERMINAL_TITLES.includes(s.terminalTitle) ? s.terminalTitle : DEFAULTS.terminalTitle,
    warnPasteControl: typeof s.warnPasteControl === 'boolean' ? s.warnPasteControl : DEFAULTS.warnPasteControl,
    warnPasteRun: typeof s.warnPasteRun === 'boolean' ? s.warnPasteRun : DEFAULTS.warnPasteRun,
    confirmExternal: typeof s.confirmExternal === 'boolean' ? s.confirmExternal : DEFAULTS.confirmExternal,
    // SECURITY: only a real true opens the socket to external callers.
    allowExternalControl: s.allowExternalControl === true,
    gitignore: typeof s.gitignore === 'boolean' ? s.gitignore : DEFAULTS.gitignore,
    // Unknown actions, malformed / reserved chords dropped (those actions keep their defaults).
    bindings: cleanBindings(s.bindings),
  }
}

// Split a command line into argv: whitespace-separated, single/double quotes group.
export function parseCommand(line: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

export interface SettingsError {
  field: keyof Settings | 'file'
  message: string
}

// Problems that would make a setting unusable. Extend with more checks as settings grow.
// `executable(cmd)`: absolute path of an executable, or null (main: `resolveExecutable`).
export function validateSettings(s: Partial<Settings>, executable: (cmd: string) => string | null): SettingsError[] {
  const errors: SettingsError[] = []
  if (s.shell !== undefined && s.shell.trim()) {
    const [bin] = parseCommand(s.shell.trim())
    if (!executable(bin)) errors.push({ field: 'shell', message: `Shell not found or not executable: ${bin}` })
  }
  if (s.terminalTitle !== undefined && !TERMINAL_TITLES.includes(s.terminalTitle))
    errors.push({ field: 'terminalTitle', message: `Unknown terminal title mode: ${String(s.terminalTitle)}` })
  if (s.gitignore !== undefined && typeof s.gitignore !== 'boolean')
    errors.push({ field: 'gitignore', message: `Not a boolean: gitignore = ${String(s.gitignore)}` })
  // Replaced whole by a save (setSettings merges top-level keys), so conflicts are checked within it.
  if (s.bindings !== undefined) for (const message of bindingErrors(s.bindings)) errors.push({ field: 'bindings', message })
  return errors
}

// The settings file as read: its text, missing, or unreadable (permissions...). main/settings.ts
// keeps the one last loaded or written by Tie (the baseline) and compares the disk against it.
export type FileSnapshot = { text: string } | { missing: true } | { unreadable: string }

// Changed on disk since the baseline: by content (a touch or an identical rewrite is no change);
// missing vs present is; two unreadable reads are the same (the reason may vary).
export function fileChanged(baseline: FileSnapshot, now: FileSnapshot): boolean {
  if ('text' in baseline || 'text' in now) return !('text' in baseline && 'text' in now && baseline.text === now.text)
  return 'missing' in baseline !== 'missing' in now
}

// File text → settings: JSON object, merged over the defaults, sanitized, theme aliases mapped.
// The one parse for startup and the panel's Reload (same trust level: sanitize only, no
// validateSettings). Never writes anything: what sanitize changed stays in memory.
export function parseSettings(text: string): { ok: true; settings: Settings } | { ok: false; message: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Not a JSON object' }
  // SECURITY: sanitize is the gate for hand-edited (or foreign) files: allowExternalControl only on a real true.
  const s = sanitize({ ...DEFAULTS, ...(raw as Partial<Settings>) })
  s.theme = THEME_ALIASES[s.theme] ?? s.theme
  return { ok: true, settings: s }
}
