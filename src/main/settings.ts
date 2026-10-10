// User settings: JSON file shared across instances (TIE_SETTINGS overrides path, e.g. for tests).
import { readFileSync, writeFileSync } from 'node:fs'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import { stateDir, log } from './env'

export interface Settings {
  shell: string // terminal tiles: command line for new terminals; '' = default
  theme: string // app-wide: theme id (renderer/themes.ts)
  lineHeight: number // all tiles: content line height
  fontFamily: string // all tiles: content font, '' = default monospace stack
  fontSize: number // all tiles: content font size (px)
}

const DEFAULTS: Settings = { shell: '', theme: 'tie-dark', lineHeight: 1.15, fontFamily: '', fontSize: 12 }
export const settingsPath = process.env.TIE_SETTINGS || join(stateDir, 'settings.json')

let current: Settings = load()

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(settingsPath, 'utf8')) }
  } catch {
    return { ...DEFAULTS }
  }
}

export const getSettings = (): Settings => ({ ...current })

export function setSettings(patch: Partial<Settings>): Settings {
  current = { ...current, ...patch }
  current.lineHeight = Math.min(2, Math.max(1, Number(current.lineHeight) || DEFAULTS.lineHeight))
  current.fontSize = Math.min(32, Math.max(8, Number(current.fontSize) || DEFAULTS.fontSize))
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
