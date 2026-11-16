// Shortcuts in main. before-input-event sees every real key for the window's webContents (keys
// typed into content frames included) before any page does. docs/INPUT.md.
import type { BrowserWindow, WebContents } from 'electron'
import { actionFor, resolveKeymap, chordsOf, type Action, type Bindings, type KeyInput, type Keymap } from '../core/keymap'
import { log } from './env'
import { untrusted } from '../core/log'

export type KeyAction = Action

// Keymap from the settings' `bindings` (validated by settings.ts): set at startup and after each
// save, so changes apply live.
let keymap: Keymap = resolveKeymap()
let bindings: Bindings = {}
export function setBindings(b: Bindings) {
  bindings = b
  keymap = resolveKeymap(b)
  log('keys', 'bindings', untrusted(b))
}

// The chord the Quit menu item shows (null: unbound).
export const quitChord = (): string | undefined => chordsOf('quit', bindings)[0]

// The UI has a text field or modal focused: its keys stay its own (⌘Q excepted).
let suspended = false
export function setKeysSuspended(on: unknown) {
  suspended = on === true
}

// SECURITY: shortcuts act only on real input (synthetic KeyboardEvents never reach main) and are
// blocked here, so neither the UI page, a content frame nor a browser guest ever sees them:
// content can't swallow, fake or observe them. Esc and editing combos are never in the keymap (they
// pass; user bindings can't take them: core/keymap.ts validBinding). `quit` (the action, whatever
// chord the user bound it to; the UI asks first) works even while suspended; repeats are blocked too.
// Guests (<webview>) are their own webContents: keys typed there reach only their own
// before-input-event, so each guest gets the same matcher (watchKeys, main/guest.ts).
let send: (action: KeyAction) => void = () => {}
function onInput(e: Electron.Event, input: Electron.Input) {
  if (input.type !== 'keyDown') return
  const k: KeyInput = { key: input.key, meta: input.meta, control: input.control, alt: input.alt, shift: input.shift }
  const action = actionFor(k, keymap)
  if (!action || (suspended && action !== 'quit')) return
  e.preventDefault()
  if (input.isAutoRepeat && action === 'quit') return
  log('keys', action)
  send(action)
}

export function watchKeys(wc: WebContents) {
  wc.on('before-input-event', onInput)
}

export function initKeys(win: BrowserWindow, push: (action: KeyAction) => void) {
  send = push
  watchKeys(win.webContents)
}
