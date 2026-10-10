// User settings: JSON file shared across instances (TIE_SETTINGS overrides path, e.g. for tests).
import { readFileSync, writeFileSync, statSync, accessSync, constants } from 'node:fs'
import { userInfo, homedir } from 'node:os'
import { join, delimiter } from 'node:path'
import { stateDir, log } from './env'

export interface Settings {
  shell: string // terminal tiles: command line for new terminals; '' = default
  theme: string // app-wide: theme id (renderer/themes.ts)
  lineHeight: number // all tiles: content line height
  fontFamily: string // all tiles: content font, '' = default monospace stack
  fontSize: number // all tiles: content font size (px)
  cellWidth: number // all tiles: character width, percent (kitty cell_width)
}

const DEFAULTS: Settings = { shell: '', theme: 'tie-dark', lineHeight: 1.15, fontFamily: '', fontSize: 12, cellWidth: 100 }
export const settingsPath = process.env.TIE_SETTINGS || join(stateDir, 'settings.json')

const THEME_ALIASES: Record<string, string> = { 'elegant-dark': 'tie-dark' }

let current: Settings = load()

function load(): Settings {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(readFileSync(settingsPath, 'utf8')) }
    s.theme = THEME_ALIASES[s.theme] ?? s.theme
    return s
  } catch (e) {
    // Missing file is normal on first run; anything else must not pass silently.
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.error(`tie: cannot load settings (${settingsPath}):`, e)
    return { ...DEFAULTS }
  }
}

export const getSettings = (): Settings => ({ ...current })

export function setSettings(patch: Partial<Settings>): Settings {
  current = { ...current, ...patch }
  current.lineHeight = Math.min(2, Math.max(1, Number(current.lineHeight) || DEFAULTS.lineHeight))
  current.fontSize = Math.min(32, Math.max(8, Number(current.fontSize) || DEFAULTS.fontSize))
  current.cellWidth = Math.min(150, Math.max(70, Number(current.cellWidth) || DEFAULTS.cellWidth))
  current.fontFamily = String(current.fontFamily ?? '').trim()
  writeFileSync(settingsPath, JSON.stringify(current, null, 2) + '\n')
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
  field: keyof Settings
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
