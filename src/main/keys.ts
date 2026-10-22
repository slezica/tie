// Shortcuts in main. before-input-event sees every real key for the window's webContents (keys
// typed into content frames included) before any page does. docs/INPUT.md.
import type { BrowserWindow, WebContents } from 'electron'
import { actionFor, type Action, type KeyInput } from '../core/keymap'
import { log } from './env'

export type KeyAction = Action

// The UI has a text field or modal focused: its keys stay its own (⌘Q excepted).
let suspended = false
export function setKeysSuspended(on: unknown) {
  suspended = on === true
}

// SECURITY: shortcuts act only on real input (synthetic KeyboardEvents never reach main) and are
// blocked here, so neither the UI page, a content frame nor a browser guest ever sees them:
// content can't swallow, fake or observe them. Esc and editing combos are never in the keymap (they
// pass). ⌘Q (`quit`: the UI asks first) works even while suspended; repeats are blocked too.
// Guests (<webview>) are their own webContents: keys typed there reach only their own
// before-input-event, so each guest gets the same matcher (watchKeys, main/guest.ts).
let send: (action: KeyAction) => void = () => {}
function onInput(e: Electron.Event, input: Electron.Input) {
  if (input.type !== 'keyDown') return
  const k: KeyInput = { key: input.key, meta: input.meta, control: input.control, alt: input.alt, shift: input.shift }
  const action = actionFor(k)
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
