// User settings: JSON file shared across instances (TIE_SETTINGS overrides path, e.g. for tests).
import { readFileSync, writeFileSync, copyFileSync, existsSync, statSync, accessSync, constants } from 'node:fs'
import { userInfo, homedir } from 'node:os'
import { join, delimiter } from 'node:path'
import { stateDir, instance, log, PRIVATE } from './env'

export interface Settings {
  shell: string // terminal tiles: command line for new terminals; '' = default
  theme: string // app-wide: theme id (renderer/themes.ts)
  lineHeight: number // all tiles: content line height
  fontFamily: string // all tiles: content font, '' = default monospace stack
  fontSize: number // all tiles: content font size (px)
  cellWidth: number // all tiles: character width, percent (kitty cell_width)
  borderless: boolean // app-wide: hide window controls (kitty hide_window_decorations)
  tabBar: 'top' | 'bottom' // app-wide: tab bar position
  shelfStyle: 'normal' | 'compact' // app-wide: compact = narrow, icons only
  warnPasteControl: boolean // terminal tiles: confirm pastes/drops containing control characters
  warnPasteRun: boolean // terminal tiles: confirm pastes that would run commands (newline, no bracketed paste)
  htmlScripts: boolean // html tiles: run the page's scripts by default (off: static page, pill in the title bar turns them on)
  confirmExternal: boolean // all tiles: confirm before a link opens in the system browser
}

const DEFAULTS: Settings = { shell: '', theme: 'tie-dark', lineHeight: 1.15, fontFamily: '', fontSize: 12, cellWidth: 100, borderless: false, tabBar: 'top', shelfStyle: 'normal', warnPasteControl: true, warnPasteRun: true, htmlScripts: false, confirmExternal: true }
// `default` (installed app): settings.json; other instances: settings.<instance>.json.
export const settingsPath =
  process.env.TIE_SETTINGS || join(stateDir, instance === 'default' ? 'settings.json' : `settings.${instance}.json`)

// First dev run: start from the installed app's settings rather than blank.
if (!process.env.TIE_SETTINGS && instance === 'dev' && !existsSync(settingsPath) && existsSync(join(stateDir, 'settings.json')))
  copyFileSync(join(stateDir, 'settings.json'), settingsPath)

const THEME_ALIASES: Record<string, string> = { 'elegant-dark': 'tie-dark' }

let loadError: string | null = null
let current: Settings = load()

function load(): Settings {
  loadError = null
  try {
    const s = sanitize({ ...DEFAULTS, ...JSON.parse(readFileSync(settingsPath, 'utf8')) })
    s.theme = THEME_ALIASES[s.theme] ?? s.theme
    return s
  } catch (e) {
    // Missing file is normal on first run; anything else must not pass silently.
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`tie: cannot load settings (${settingsPath}):`, e)
      loadError = `Settings file unreadable, fix it before saving: ${e instanceof Error ? e.message : e}`
    }
    return { ...DEFAULTS }
  }
}

export const getSettings = (): Settings => ({ ...current })

// An existing file that can't be read is never overwritten: saving waits until it's fixed (re-read here).
export function settingsFileError(): string | null {
  if (loadError) current = load()
  return loadError
}

// Clamp numbers into range; wrongly typed strings fall back to defaults (hand-edited files).
function sanitize(s: Settings): Settings {
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
    tabBar: s.tabBar === 'bottom' ? 'bottom' : 'top',
    shelfStyle: s.shelfStyle === 'compact' ? 'compact' : 'normal',
    warnPasteControl: typeof s.warnPasteControl === 'boolean' ? s.warnPasteControl : DEFAULTS.warnPasteControl,
    warnPasteRun: typeof s.warnPasteRun === 'boolean' ? s.warnPasteRun : DEFAULTS.warnPasteRun,
    htmlScripts: typeof s.htmlScripts === 'boolean' ? s.htmlScripts : DEFAULTS.htmlScripts,
    confirmExternal: typeof s.confirmExternal === 'boolean' ? s.confirmExternal : DEFAULTS.confirmExternal,
  }
}

export function setSettings(patch: Partial<Settings>): Settings {
  current = sanitize({ ...current, ...patch })
  writeFileSync(settingsPath, JSON.stringify(current, null, 2) + '\n', { mode: PRIVATE })
  log('app', 'settings saved', current)
  return getSettings()
}

// Account login shell as a login shell (macOS convention). Ignores $SHELL, which the
// launching shell's rc files may have overridden.
export function defaultShell(): string {
  let shell = ''
  try {
    shell = userInfo().shell ?? ''
  } catch {}
  return `${shell || process.env.SHELL || '/bin/zsh'} -l`
}

// Split a command line into argv: whitespace-separated, single/double quotes group.
export function parseCommand(line: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

export function shellArgv(): string[] {
  const argv = parseCommand(current.shell.trim())
  return argv.length ? argv : parseCommand(defaultShell())
}

// Absolute path of an executable (path or bare name searched in PATH), or null.
export function resolveExecutable(cmd: string): string | null {
  if (!cmd) return null
  const isExec = (p: string) => {
    try {
      if (!statSync(p).isFile()) return false
      accessSync(p, constants.X_OK)
      return true
    } catch {
      return false
    }
  }
  if (cmd.includes('/')) {
    const p = cmd.startsWith('~/') ? join(homedir(), cmd.slice(2)) : cmd
    return isExec(p) ? p : null
  }
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir && isExec(join(dir, cmd))) return join(dir, cmd)
  }
  return null
}

export interface SettingsError {
  field: keyof Settings | 'file'
  message: string
}

// Problems that would make a setting unusable. Extend with more checks as settings grow.
export function validateSettings(s: Partial<Settings>): SettingsError[] {
  const errors: SettingsError[] = []
  if (s.shell !== undefined && s.shell.trim()) {
    const [bin] = parseCommand(s.shell.trim())
    if (!resolveExecutable(bin)) errors.push({ field: 'shell', message: `Shell not found or not executable: ${bin}` })
  }
  return errors
}
