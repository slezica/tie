// Shortcuts in main. before-input-event sees every real key for the window's webContents (keys
// typed into content frames included) before any page does. docs/INPUT.md.
import type { BrowserWindow } from 'electron'
import { actionFor, isQuitKey, type Action, type KeyInput } from '../core/keymap'
import { log } from './env'

export type KeyAction = Action | 'quit-press' | 'quit-release' | 'quit-cancel'

// The shell has a text field or modal focused: its keys stay its own (⌘Q excepted).
let suspended = false
export function setKeysSuspended(on: unknown) {
  suspended = on === true
}

// SECURITY: shortcuts act only on real input (synthetic KeyboardEvents never reach main) and are
// blocked here, so neither the shell page nor a content frame ever sees them: content can't
// swallow, fake or observe them. Esc and editing combos are never in the keymap (they pass).
// ⌘Q (hold to quit): reported on press, release (q or ⌘ up) and window blur. Its keydown is not
// blocked: Chromium then drops the matching keyup, and the release is what quits.
export function initKeys(win: BrowserWindow, send: (action: KeyAction) => void) {
  let quitHeld = false
  win.webContents.on('before-input-event', (e, input) => {
    const k: KeyInput = { key: input.key, meta: input.meta, control: input.control, alt: input.alt, shift: input.shift }
    if (input.type === 'keyUp') {
      if (quitHeld && (input.key.toLowerCase() === 'q' || input.key === 'Meta')) {
        quitHeld = false
        send('quit-release')
      }
      return
    }
    if (input.type !== 'keyDown') return
    if (isQuitKey(k)) {
      if (!input.isAutoRepeat) {
        quitHeld = true
        send('quit-press')
      }
      return
    }
    if (suspended) return
    const action = actionFor(k)
    if (!action) return
    e.preventDefault()
    log('keys', action)
    send(action)
  })
  // Focus may sit in a content frame, where the shell page sees no blur: cancel from here too.
  win.on('blur', () => {
    if (!quitHeld) return
    quitHeld = false
    send('quit-cancel')
  })
}
