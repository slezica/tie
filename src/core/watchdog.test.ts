import { describe, it, expect } from 'vitest'
import { watchdog, tick, pong, TICK_MS, HANG_MS, RENDER_MS } from './watchdog'

// Ticks every TICK_MS from `from` to `to` (inclusive); returns the last result.
const run = (d: ReturnType<typeof watchdog>, from: number, to: number) => {
  let r = ''
  for (let t = from; t <= to; t += TICK_MS) r = tick(d, t)
  return r
}

describe('watchdog', () => {
  it('pings, one outstanding; answered pings never hang', () => {
    const d = watchdog(0)
    expect(tick(d, 1000)).toBe('ping')
    expect(d.ping?.n).toBe(1)
    expect(tick(d, 2000)).toBe('wait')
    pong(d, 1)
    expect(tick(d, 3000)).toBe('ping')
    expect(d.ping?.n).toBe(2)
  })
  it('hangs when a ping goes unanswered past HANG_MS', () => {
    const d = watchdog(0)
    d.lastPost = -RENDER_MS
    expect(tick(d, 1000)).toBe('ping')
    expect(run(d, 2000, 1000 + HANG_MS)).toBe('wait')
    expect(tick(d, 2000 + HANG_MS)).toBe('hung')
  })
  it('ignores stale pongs', () => {
    const d = watchdog(0)
    tick(d, 1000)
    pong(d, 0)
    pong(d, 7)
    expect(d.ping?.n).toBe(1)
  })
  it('gives a render RENDER_MS after each message', () => {
    const d = watchdog(0)
    tick(d, 1000)
    d.lastPost = 1000
    expect(run(d, 2000, 1000 + RENDER_MS)).toBe('wait')
    expect(tick(d, 2000 + RENDER_MS)).toBe('hung')
  })
  it('never judges across a sleep or throttle gap', () => {
    const d = watchdog(0)
    d.lastPost = -RENDER_MS
    tick(d, 1000)
    expect(tick(d, 1000 + 60_000)).toBe('ping') // slept a minute: fresh ping, no verdict
    expect(d.ping?.at).toBe(61_000)
    pong(d, d.ping!.n)
    expect(tick(d, 62_000)).toBe('ping')
  })
})
