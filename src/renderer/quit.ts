// Hold ⌘Q to quit (like Chrome) while any tile is open; with no tiles, a press is enough.
// Tie quits on *release*: if it quit while ⌘Q is still held, key repeats would reach (and quit)
// the app behind it.
import { S, tie } from './state'

export const HOLD_MS = 1000
let timer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null
let armed = false

const overlay = () => document.getElementById('quit-hold')!
const label = (text: string) => (overlay().querySelector('span')!.textContent = text)

function arm() {
  armed = true
  timer = null
  overlay().classList.add('armed')
  label('Release to quit')
}

export function quitPressed() {
  if (armed || timer) return
  if (S.tiles.size === 0) return arm() // nothing to lose: no hold, still quit on release
  if (hideTimer) clearTimeout(hideTimer)
  const el = overlay()
  label('Hold ⌘Q to quit')
  el.classList.remove('show', 'released', 'armed')
  void el.offsetWidth // restart the progress animation
  el.classList.add('show')
  timer = setTimeout(arm, HOLD_MS)
}

// Focus lost (another app's popup, etc.): the release won't reach us. Cancel, never quit.
export function quitCancelled() {
  if (timer) clearTimeout(timer)
  timer = null
  armed = false
  overlay().classList.remove('show', 'released', 'armed')
}

export function quitReleased() {
  if (armed) return tie.quit()
  if (!timer) return
  clearTimeout(timer)
  timer = null
  // Keep the hint briefly so a tap still teaches the gesture.
  overlay().classList.add('released')
  hideTimer = setTimeout(() => overlay().classList.remove('show', 'released'), 1200)
}
