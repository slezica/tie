// User settings: JSON file shared across instances (TIE_SETTINGS overrides path, e.g. for tests).
import { readFileSync, writeFileSync, copyFileSync, existsSync, statSync, accessSync, constants } from 'node:fs'
import { userInfo, homedir } from 'node:os'
import { join, delimiter } from 'node:path'
import { stateDir, instance, log, PRIVATE } from './env'
import { untrusted } from '../core/log'
import { DEFAULTS, THEME_ALIASES, sanitize, parseCommand, validateSettings as validate, type Settings, type SettingsError } from '../core/settings'

export { TERMINAL_TITLES, parseCommand, type Settings, type SettingsError, type TerminalTitle } from '../core/settings'

// `default` (installed app): settings.json; other instances: settings.<instance>.json.
export const settingsPath =
  process.env.TIE_SETTINGS || join(stateDir, instance === 'default' ? 'settings.json' : `settings.${instance}.json`)

// First dev run: start from the installed app's settings rather than blank.
if (!process.env.TIE_SETTINGS && instance === 'dev' && !existsSync(settingsPath) && existsSync(join(stateDir, 'settings.json')))
  copyFileSync(join(stateDir, 'settings.json'), settingsPath)

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

export function setSettings(patch: Partial<Settings>): Settings {
  current = sanitize({ ...current, ...patch })
  writeFileSync(settingsPath, JSON.stringify(current, null, 2) + '\n', { mode: PRIVATE })
  log('app', 'settings saved', untrusted(current))
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

// Problems that would make a setting unusable (rules: core/settings.ts).
export const validateSettings = (s: Partial<Settings>): SettingsError[] => validate(s, resolveExecutable)
