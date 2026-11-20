// UI state (LAYOUT.md "Bar sizes"; design S24): what the user sets outside the settings panel and
// Tie keeps across restarts. Today: bar sizes. File `<stateDir>/<instance>.ui.json` (0600), owned by
// main: read once at start, written when the renderer reports a resize's end. Not settings: no
// panel, no banner, no Save; a bad file means defaults, never a dialog. Rules: core/barsize.ts.
import { readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { stateDir, instance, log, PRIVATE } from './env'
import { untrusted } from '../core/log'
import { cleanSizes, parseUiState, sameSizes, uiStateText, type BarSizes } from '../core/barsize'

// Per instance, beside its socket and info file. Never from the renderer.
export const uiStatePath = join(stateDir, `${instance}.ui.json`)

function read(): string | null {
  try {
    return readFileSync(uiStatePath, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') log('app', 'ui state unreadable, defaults', untrusted(e instanceof Error ? e.message : String(e)))
    return null
  }
}

let bars: BarSizes = load()

function load(): BarSizes {
  const r = parseUiState(read())
  if (r.problem) log('app', 'ui state', untrusted(uiStatePath), untrusted(r.problem))
  return r.bars
}

export const uiState = () => ({ bars: { ...bars } })

// A resize ended (renderer: one bar's new size, or a reset). Returns the sizes in force.
// SECURITY: the payload is the renderer's; main trusts only its shape: a plain object of known bar
// names → finite numbers, clamped to the static limits (cleanSizes). Anything else in it is dropped
// and logged; not an object: refused, nothing written. The path is main's (uiStatePath), never the
// payload's; the file holds exactly `{bars: {top, bottom, left, right}}` numbers, 0600.
export function setBarSizes(patch: unknown): BarSizes {
  const c = cleanSizes(patch, bars)
  if (!c) {
    log('security', 'refused ui state, not an object:', patch === null ? 'null' : Array.isArray(patch) ? 'array' : typeof patch)
    return { ...bars }
  }
  if (c.dropped.length) log('security', 'ui state: dropped', untrusted(c.dropped.join(', ')))
  if (sameSizes(c.sizes, bars)) return { ...bars }
  bars = c.sizes
  try {
    writeFileSync(uiStatePath, uiStateText(bars), { mode: PRIVATE })
    chmodSync(uiStatePath, PRIVATE) // a file made by something else keeps its own mode on overwrite
  } catch (e) {
    log('app', 'ui state not written', untrusted(e instanceof Error ? e.message : String(e)))
  }
  return { ...bars }
}
