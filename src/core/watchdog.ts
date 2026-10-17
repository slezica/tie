// Content frame watchdog (frame.ts): pure timing, unit-tested. The host pings the viewer over its
// port, one ping outstanding at a time; a ping unanswered too long = the viewer's thread is stuck.
// docs/TILES.md.

export const TICK_MS = 1000 // ping cadence
export const HANG_MS = 5000 // ping unanswered this long → hung
export const RENDER_MS = 10_000 // after each message to the viewer: a big render may hold pongs this long
export const SUSPEND_MS = 3000 // tick this late: machine slept or the window is throttled; don't judge

export interface Watchdog {
  ping: { n: number; at: number } | null // outstanding
  pings: number
  lastPost: number // last message to the viewer
  lastTick: number
}

export const watchdog = (now: number): Watchdog => ({ ping: null, pings: 0, lastPost: 0, lastTick: now })

// One tick: 'ping' (send ping d.ping.n), 'wait', or 'hung'. Mutates d.
export function tick(d: Watchdog, now: number): 'ping' | 'wait' | 'hung' {
  const late = now - d.lastTick > SUSPEND_MS
  d.lastTick = now
  if (late) d.ping = null // across a sleep/throttle gap, a missing pong means nothing
  if (d.ping) return now - d.ping.at > HANG_MS && now - d.lastPost > RENDER_MS ? 'hung' : 'wait'
  d.ping = { n: ++d.pings, at: now }
  return 'ping'
}

// A pong: clears the outstanding ping if it answers it (stale pongs ignored).
export function pong(d: Watchdog, n: number) {
  if (d.ping?.n === n) d.ping = null
}
