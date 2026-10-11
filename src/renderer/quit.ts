// Hold ⌘Q to quit (like Chrome) while any tile is open; quit right away otherwise.
import { S, tie } from './state'

export const HOLD_MS = 1000
let timer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

const overlay = () => document.getElementById('quit-hold')!

export function quitPressed() {
  if (S.tiles.size === 0) return tie.quit()
  if (timer) return
  if (hideTimer) clearTimeout(hideTimer)
  const el = overlay()
  el.classList.remove('show')
  void el.offsetWidth // restart the progress animation
  el.classList.add('show')
  timer = setTimeout(() => tie.quit(), HOLD_MS)
}

export function quitReleased() {
  if (!timer) return
  clearTimeout(timer)
  timer = null
  // Keep the hint briefly so a tap still teaches the gesture.
  hideTimer = setTimeout(() => overlay().classList.remove('show'), 1200)
  overlay().classList.add('released')
  setTimeout(() => overlay().classList.remove('released'), 1200)
}
