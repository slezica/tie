// Shortcuts in main. before-input-event sees every real key for the window's webContents (keys
// typed into content frames included) before any page does. docs/INPUT.md.
import type { BrowserWindow, WebContents } from 'electron'
import { decideKey, resolveKeymap, chordsOf, type Captured, type Action, type Bindings, type KeyEvent, type KeyMode, type Keymap } from '../core/keymap'
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

// What the UI has focused. `fields`: a text field or modal, its keys stay its own (quit excepted).
// `capture`: a capture field (settings: key search, binding edit), every key goes to it, quit included.
let mode: KeyMode = 'off'
export function setKeysSuspended(on: unknown) {
  mode = on === 'capture' ? 'capture' : on === true ? 'fields' : 'off'
}
// Current mode, read-only (dev socket `key-mode`: the harness waits on it instead of sleeping).
export const keyMode = () => mode

// SECURITY: shortcuts act only on real input (synthetic KeyboardEvents never reach main) and are
// blocked here, so neither the UI page, a content frame nor a browser guest ever sees them:
// content can't swallow, fake or observe them. Esc and editing combos are never in the keymap (they
// pass; user bindings can't take them: core/keymap.ts validBinding). `quit` (the action, whatever
// chord the user bound it to; the UI asks first) works even while suspended; repeats are blocked too.
// Guests (<webview>) are their own webContents: keys typed there reach only their own
// before-input-event, so each guest gets the same matcher (watchKeys, main/guest.ts).
//
// SECURITY: capture mode. Only the UI page can ask for it (keys:suspend, uiIpc), and it holds only
// while a capture field has focus there (renderer/keys.ts derives it from the focused element on
// every focus change, so it can't stick). Keys go to the UI as chord names, and only keys of the
// UI's own webContents: a guest's keys are never forwarded (there capture counts as `fields`).
// Bare modifier keys also pass to the UI page (else Chromium drops their key-ups: decideKey).
// Nothing runs meanwhile, quit included (the menu's Quit still asks).
let send: (action: KeyAction) => void = () => {}
let capture: (c: Captured) => void = () => {}
let ui: WebContents | null = null
function onInput(wc: WebContents, e: Electron.Event, input: Electron.Input) {
  const k: KeyEvent = { key: input.key, code: input.code, meta: input.meta, control: input.control, alt: input.alt, shift: input.shift, down: input.type === 'keyDown', repeat: input.isAutoRepeat }
  // Raw input, for diagnosing key names (layouts, Alt). Only in capture mode: never a log of what is typed elsewhere.
  if (mode === 'capture' && wc === ui) log('keys', 'raw', input.type, untrusted(k))
  const d = decideKey(k, mode, wc === ui, keymap) // the rules: core/keymap.ts
  if (d.capture) capture(d.capture) // bare modifiers pass too (their key-ups must reach here)
  if (d.pass) return
  e.preventDefault() // the page sees nothing; menu accelerators don't fire either
  if (d.action) {
    log('keys', d.action)
    send(d.action)
  }
}

export function watchKeys(wc: WebContents) {
  wc.on('before-input-event', (e, input) => onInput(wc, e, input))
}

export function initKeys(win: BrowserWindow, push: (action: KeyAction) => void, pushCapture: (c: Captured) => void) {
  send = push
  capture = pushCapture
  ui = win.webContents
  watchKeys(ui)
}
