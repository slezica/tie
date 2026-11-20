import { describe, it, expect } from 'vitest'
import { HBAR, VBAR, LIST_MIN, SCALE_MIN, defaultSizes, defaultSize, clampStored, maxSize, shownSize, barScale, barForm, narrowScale, cleanSizes, parseUiState, uiStateText, sameSizes } from './barsize'

describe('limits', () => {
  it('defaults: 40 horizontal, 160 vertical', () => {
    expect(defaultSizes()).toEqual({ top: 40, bottom: 40, left: 160, right: 160 })
    expect(defaultSize('left')).toBe(160)
    expect(defaultSize('bottom')).toBe(40)
  })
  it('stored sizes: static limits, whole px', () => {
    expect(clampStored('top', 10)).toBe(32)
    expect(clampStored('bottom', 99)).toBe(60)
    expect(clampStored('top', 45.6)).toBe(46)
    expect(clampStored('left', 3)).toBe(48)
    expect(clampStored('right', 1e9)).toBe(VBAR.max)
  })
  it('shown: vertical up to 30% of the window width, never below the minimum', () => {
    expect(maxSize('left', 1000)).toBe(300)
    expect(maxSize('top', 1000)).toBe(60)
    expect(shownSize('left', 400, 1000)).toBe(300)
    expect(shownSize('left', 400, 2000)).toBe(400)
    expect(shownSize('right', 160, 100)).toBe(48) // 30% under the minimum: the minimum
    expect(shownSize('bottom', 80, 500)).toBe(60)
    expect(shownSize('top', 20, 500)).toBe(32)
  })
})

describe('scale and forms', () => {
  it('horizontal: 1x at 40, 1.5x at 60, a floor of 0.875x from 35 down; vertical: 1', () => {
    expect(barScale('top', 40)).toBe(1)
    expect(barScale('bottom', 60)).toBe(1.5)
    expect(barScale('top', 50)).toBe(1.25)
    expect(barScale('top', 36)).toBe(0.9)
    expect(barScale('top', 35)).toBe(SCALE_MIN)
    expect(barScale('top', 32)).toBe(SCALE_MIN)
    expect(barScale('top', 90)).toBe(1.5)
    expect(barScale('left', 300)).toBe(1)
  })
  it('narrow vertical: SCALE_MIN at the minimum width, 1/40 per px, 1.5x from 73 px', () => {
    expect(narrowScale(VBAR.min)).toBe(SCALE_MIN)
    expect(narrowScale(VBAR.min)).toBe(barScale('top', HBAR.min)) // as a horizontal bar at its minimum
    expect(narrowScale(52)).toBe(0.975)
    expect(narrowScale(53)).toBe(1)
    expect(narrowScale(60)).toBe(1.175)
    expect(narrowScale(72)).toBe(1.475)
    expect(narrowScale(73)).toBe(1.5)
    expect(narrowScale(LIST_MIN - 1)).toBe(1.5)
    expect(narrowScale(30)).toBe(SCALE_MIN)
  })
  it('vertical forms: narrow below LIST_MIN, list from it', () => {
    expect(barForm(48)).toBe('narrow')
    expect(barForm(LIST_MIN - 1)).toBe('narrow')
    expect(barForm(LIST_MIN)).toBe('list')
    expect(barForm(VBAR.def)).toBe('list')
    expect(HBAR.max).toBe(HBAR.def * 1.5)
  })
})

describe('cleanSizes (untrusted input)', () => {
  const base = defaultSizes()
  it('known bars with finite numbers, clamped; the rest dropped and named', () => {
    const r = cleanSizes({ top: 50, left: 1e12, right: NaN, bottom: '44', evil: 3, __proto__x: 1 }, base)!
    expect(r.sizes).toEqual({ top: 50, bottom: 40, left: VBAR.max, right: 160 })
    expect(r.dropped.sort()).toEqual(['__proto__x', 'bottom', 'evil', 'right'])
    expect(cleanSizes({ top: Infinity, bottom: -Infinity }, base)!.sizes).toEqual(base)
  })
  it('not an object: null', () => {
    for (const v of [null, undefined, 5, 'x', [40, 40], true]) expect(cleanSizes(v, base)).toBe(null)
  })
  it('never mutates the base', () => {
    const b = defaultSizes()
    cleanSizes({ top: 60 }, b)
    expect(b).toEqual(defaultSizes())
  })
})

describe('parseUiState (the file)', () => {
  it('missing: defaults, no problem', () => {
    expect(parseUiState(null)).toEqual({ bars: defaultSizes(), problem: null })
  })
  it('garbage, wrong shape: defaults with a problem', () => {
    expect(parseUiState('{nope').bars).toEqual(defaultSizes())
    expect(parseUiState('{nope').problem).toMatch(/not JSON/)
    expect(parseUiState('[1,2]').problem).toBe('not an object')
    expect(parseUiState('{"bars": 3}').problem).toMatch(/bars/)
    expect(parseUiState('{}')).toEqual({ bars: defaultSizes(), problem: null })
  })
  it('values cleaned field by field', () => {
    const r = parseUiState('{"bars": {"top": 55, "bottom": 999, "left": "wide", "right": 30, "x": 1}}')
    expect(r.bars).toEqual({ top: 55, bottom: 60, left: 160, right: 48 })
    expect(r.problem).toMatch(/left/)
  })
  it('round trip through the written text', () => {
    const s = { top: 33, bottom: 60, left: 48, right: 300 }
    expect(parseUiState(uiStateText(s)).bars).toEqual(s)
    expect(JSON.parse(uiStateText(s))).toEqual({ bars: s })
    expect(sameSizes(s, { ...s })).toBe(true)
    expect(sameSizes(s, { ...s, top: 34 })).toBe(false)
  })
})
