// User settings: JSON file shared across instances (TIE_SETTINGS overrides path, e.g. for tests).
import { readFileSync, writeFileSync, copyFileSync, existsSync, statSync, accessSync, chmodSync, constants } from 'node:fs'
import { userInfo, homedir } from 'node:os'
import { join, delimiter } from 'node:path'
import { stateDir, instance, log, PRIVATE } from './env'
import { untrusted } from '../core/log'
import { DEFAULTS, sanitize, parseCommand, parseSettings, fileChanged as changedSince, validateSettings as validate, type FileSnapshot, type Settings, type SettingsError } from '../core/settings'
import { watchFile, revision, type Watch } from './watch'

export { TERMINAL_TITLES, parseCommand, type Settings, type SettingsError, type TerminalTitle } from '../core/settings'

// `default` (installed app): settings.json; other instances: settings.<instance>.json.
export const settingsPath =
  process.env.TIE_SETTINGS || join(stateDir, instance === 'default' ? 'settings.json' : `settings.${instance}.json`)

// First dev run: start from the installed app's settings rather than blank. The one exception to
// the RULE below (author's decision): a one-time seed of a new dev instance's own file, never the
// installed app's file. Runs before the baseline is taken: the seeded content is the baseline (no banner).
if (!process.env.TIE_SETTINGS && instance === 'dev' && !existsSync(settingsPath) && existsSync(join(stateDir, 'settings.json')))
  copyFileSync(join(stateDir, 'settings.json'), settingsPath)

// The file is read once, at startup, and never re-read on its own: a hand edit while Tie runs is
// only reported (watchSettings → banner in the panel); the user picks Reload or Ignore.
// Baseline: the file as last loaded or written by Tie. "Changed" = the disk differs from it.
let baseline: FileSnapshot = snapshot()
// The startup load failed (syntax / unreadable): Tie runs on defaults and Save stays blocked (it
// would overwrite a file the user may want to fix) until Reload, Ignore or Recreate.
export type LoadError = { kind: 'syntax' | 'unreadable'; message: string }
let broken: LoadError | null = null
let current: Settings = initial()

function snapshot(): FileSnapshot {
  try {
    return { text: readFileSync(settingsPath, 'utf8') }
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ENOENT' ? { missing: true } : { unreadable: e instanceof Error ? e.message : String(e) }
  }
}

// Snapshot → settings (missing: defaults), or why not.
function settingsOf(snap: FileSnapshot): { ok: true; settings: Settings } | { ok: false; error: LoadError } {
  if ('missing' in snap) return { ok: true, settings: { ...DEFAULTS } }
  if ('unreadable' in snap) return { ok: false, error: { kind: 'unreadable', message: snap.unreadable } }
  const r = parseSettings(snap.text)
  return r.ok ? r : { ok: false, error: { kind: 'syntax', message: r.message } }
}

function initial(): Settings {
  const r = settingsOf(baseline)
  if (r.ok) return r.settings
  broken = r.error
  log('app', 'settings file not loaded, running on defaults', r.error.kind, untrusted(r.error.message))
  return { ...DEFAULTS }
}

export const getSettings = (): Settings => ({ ...current })

// Fresh from disk (a synchronous read: the panel shows it at once, Save checks it at the click).
export const fileChanged = (): boolean => changedSince(baseline, snapshot())
export const loadError = (): LoadError | null => broken && { ...broken }

// Why Save is blocked by the startup load, or null (panel status line).
export function loadRefusal(): string | null {
  if (!broken) return null
  return broken.kind === 'syntax'
    ? `Syntax errors in the settings file, fix it (or recreate it) before saving: ${broken.message}`
    : `Settings file unreadable, fix it before saving: ${broken.message}`
}

// Why Save may not write now, or null. Main's guard, not the button state (closes the race between
// an edit on disk and the click).
export const saveRefusal = (): string | null => loadRefusal() ?? (fileChanged() ? `Settings changed in ${settingsPath}` : null)

// RULE: the settings file is written only by an explicit user action: the panel's Save
// (setSettings) and "Recreate with defaults" in the startup dialog (recreateSettings). Never by
// startup, load / sanitize (adjusted values stay in memory), the panel opening or cancelling,
// previews, Ignore, Reload or the watcher. One exception: the first dev run's seed copy above.
function write(text: string) {
  writeFileSync(settingsPath, text, { mode: PRIVATE })
  chmodSync(settingsPath, PRIVATE) // SECURITY: a file made by an editor keeps its own mode on overwrite
  baseline = { text } // same tick as the write: no watcher event can see it as a change
}
const json = (s: Settings) => JSON.stringify(s, null, 2) + '\n'

// The panel's Save (callers check saveRefusal first).
export function setSettings(patch: Partial<Settings>): Settings {
  current = sanitize({ ...current, ...patch })
  write(json(current))
  log('app', 'settings saved', untrusted(current))
  return getSettings()
}

// Ignore (banner): the disk content becomes the baseline, nothing loaded; Save unblocked (the
// user's explicit choice to overwrite what is there).
export function ignoreSettingsFile() {
  baseline = snapshot()
  broken = null
}

// Reload (banner): adopt the file as it is now. Reads, never writes (what sanitize adjusted stays
// in memory, the file keeps its text).
// SECURITY: the file may have been written by anything; it goes through the startup parse
// (parseSettings: sanitize, allowExternalControl only on a real true), exactly startup's trust
// level: no more (no validateSettings, which startup doesn't run either), no less. Adopted only on
// the user's click.
export function reloadSettings(): { ok: true; settings: Settings } | { ok: false; message: string } {
  const snap = snapshot()
  const r = settingsOf(snap)
  if (!r.ok) {
    log('app', 'settings reload failed', r.error.kind, untrusted(r.error.message))
    return { ok: false, message: r.error.kind === 'syntax' ? `Syntax errors in the file: ${r.error.message}` : `Can't read the file: ${r.error.message}` }
  }
  current = r.settings
  baseline = snap
  broken = null
  log('app', 'settings reloaded', untrusted(current))
  return { ok: true, settings: getSettings() }
}

// "Recreate with defaults" (startup dialog, unparseable file only): the file's bytes copied to
// <name>.bak (0600, replacing an older one), then defaults written.
export const backupPath = `${settingsPath}.bak`
export function recreateSettings(): { ok: true; settings: Settings; backup: string } | { ok: false; message: string } {
  if (broken?.kind !== 'syntax') return { ok: false, message: 'Nothing to recreate' }
  try {
    writeFileSync(backupPath, readFileSync(settingsPath), { mode: PRIVATE })
    chmodSync(backupPath, PRIVATE) // an older .bak keeps its mode on overwrite
    current = { ...DEFAULTS }
    write(json(current))
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
  broken = null
  log('app', 'settings recreated with defaults, backup', untrusted(backupPath))
  return { ok: true, settings: getSettings(), backup: backupPath }
}

// The file watched for the whole run (survives editors' rename saves: watch.ts). Each change
// recomputes "changed" fresh (a synchronous read, so a Tie write in between can't be misread) and
// reports it, also when it flips back. Nothing is applied.
export function watchSettings(onChange: (changed: boolean) => void): Watch {
  const rev = 'text' in baseline ? revision(baseline.text) : ''
  return watchFile(settingsPath, rev, () => onChange(fileChanged()))
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
