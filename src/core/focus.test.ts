import { describe, expect, it } from 'vitest'
import type { Rect, Side } from './layout'
import { neighbor } from './focus'

const FROM: Rect = { x: 0, y: 0, w: 100, h: 100 } // center (50, 50)
const r = (x: number, y: number, w = 100, h = 100): Rect => ({ x, y, w, h })
const near = (cands: Record<string, Rect>, dir: Side = 'r', mru: string[] = [], from = FROM) =>
  neighbor(from, Object.entries(cands).map(([id, rect]) => ({ id, rect })), mru, dir)

describe('neighbor', () => {
  it('nothing in that direction: undefined', () => {
    expect(near({}, 'r')).toBeUndefined()
    expect(near({ a: r(100, 0) }, 'l')).toBeUndefined()
    expect(near({ a: r(100, 0) }, 't')).toBeUndefined()
    expect(near({ a: r(100, 0) }, 'b')).toBeUndefined()
  })

  it('each direction', () => {
    const grid = { r: r(100, 0), l: r(-100, 0), t: r(0, -100), b: r(0, 100) }
    for (const d of ['l', 'r', 't', 'b'] as const) expect(near(grid, d)).toBe(d)
  })

  it('only tiles whose center is more than 1 px past the center count', () => {
    expect(near({ a: r(1, 200) }, 'r')).toBeUndefined() // center 51: 1 px past
    expect(near({ a: r(2, 200) }, 'r')).toBe('a') // center 52
    expect(near({ a: r(-1, 200) }, 'l')).toBeUndefined() // center 49
    expect(near({ a: r(-2, 200) }, 'l')).toBe('a')
    expect(near({ a: r(0, 0, 100, 100) }, 'r')).toBeUndefined() // same center (a float right on top)
  })

  it('direct neighbor beats a far one', () => {
    expect(near({ far: r(300, 0), direct: r(100, 0) })).toBe('direct')
    expect(near({ far: r(0, -400), direct: r(0, -100) }, 't')).toBe('direct')
  })

  it('overlap on the perpendicular axis beats no overlap, whatever the gap', () => {
    expect(near({ below: r(100, 200), far: r(500, 0) })).toBe('far')
    // Touching at a corner: overlap 0 = none.
    expect(near({ corner: r(100, 100), far: r(500, 50) })).toBe('far')
    // Neither overlaps: the gap decides.
    expect(near({ a: r(300, 200), b: r(150, 300) })).toBe('b')
  })

  it('overlapping rects (a float over the board) count with gap 0, not less', () => {
    // A float overlapping `from` (gap -50 → 0) ties on gap with an adjacent tile; offset decides.
    expect(near({ float: r(50, 40), adjacent: r(100, 0) })).toBe('adjacent')
    expect(near({ float: r(50, 0), adjacent: r(100, 30) })).toBe('float')
  })

  it('same overlap class and gap: the smaller perpendicular offset wins, before MRU', () => {
    expect(near({ off: r(100, 60), level: r(100, 0) }, 'r', ['off'])).toBe('level')
    expect(near({ off: r(60, 100), level: r(0, 100) }, 'b', ['off'])).toBe('level')
  })

  it('full tie broken by most recently used', () => {
    const cands = { up: r(100, -50), down: r(100, 50) } // both overlap 50, gap 0, offset 50
    expect(near(cands, 'r', ['down', 'up'])).toBe('down')
    expect(near(cands, 'r', ['up', 'down'])).toBe('up')
    expect(near(cands, 'r', ['x', 'down'])).toBe('down') // in MRU beats absent
    expect(near(cands, 'r', [])).toBe('up') // neither: candidate order
  })

  it('offsets compare rounded: sub-pixel differences fall to MRU', () => {
    const cands = { a: r(100, 10.2), b: r(100, 10.4) } // offsets 10.2, 10.4 → 10
    expect(near(cands, 'r', ['b'])).toBe('b')
    expect(near(cands, 'r', ['a'])).toBe('a')
  })
})
