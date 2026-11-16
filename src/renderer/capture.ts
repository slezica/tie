// Capture field: an input that takes key presses as a chord name (`Cmd+Shift+D`) instead of text.
// Settings: key search, binding edit. While it has focus main sends every key here (keys.ts sync →
// main/keys.ts capture mode): shortcuts don't run, and the names are the ones main will match.
// Its own keys: Escape cancels (value as at focus), Backspace empties, Enter accepts; blur
// accepts. Tab is captured like any key. docs/INPUT.md "Capture fields".
import { tie } from './state'

export interface CaptureOpts {
  change?(value: string): void // value changed while focused (live filtering)
  accept?(value: string): void // Enter or blur
  cancel?(): void // Escape
}

type Captured = { chord: string; complete: boolean }
const fields = new WeakMap<Element, (c: Captured) => void>()
let wired = false

// The value lives in `el.value` (set it freely while the field isn't focused).
export function captureField(el: HTMLInputElement, on: CaptureOpts = {}) {
  if (!wired) {
    wired = true
    tie.keys.onCapture((c) => document.activeElement && fields.get(document.activeElement)?.(c))
  }
  el.classList.add('capture-field')
  el.readOnly = true // keys arrive from main; nothing is typed
  el.spellcheck = false
  let value = el.value
  let start = value
  let cancelled = false
  // Held modifiers show while pressed (`Cmd+Shift+`), then the value again.
  const show = (pending = '') => (el.value = pending || value)
  const set = (v: string) => {
    const changed = v !== value
    value = v
    show()
    if (changed) on.change?.(v)
  }
  fields.set(el, (c) => (c.complete ? set(c.chord) : show(c.chord)))
  el.addEventListener('focus', () => {
    start = value = el.value
    cancelled = false
  })
  el.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === 'Backspace') set('')
    else if (e.key === 'Escape') {
      cancelled = true
      set(start)
      el.blur()
    } else if (e.key === 'Enter') el.blur()
    else return
    // The panel around it has its own Escape (cancel all) and Enter (save).
    e.preventDefault()
    e.stopPropagation()
  })
  el.addEventListener('blur', () => {
    show()
    if (cancelled) on.cancel?.()
    else on.accept?.(value)
  })
}
