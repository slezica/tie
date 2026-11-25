import { describe, it, expect } from 'vitest'
import { HBAR, VBAR, LIST_MIN, TABS_MIN, TAB_CHARS, TAB_CHAR_PX, TAB_ELLIPSIS_PX, NARROW_PAD, NARROW_TAB_PAD, defaultSizes, defaultSize, clampStored, minSize, maxSize, shownSize, barScale, barForm, narrowScale, cleanSizes, parseUiState, uiStateText, sameSizes } from './barsize'

describe('limits', () => {
  it('defaults: 40 horizontal, 160 vertical', () => {
    expect(defaultSizes()).toEqual({ top: 40, bottom: 40, left: 160, right: 160 })
    expect(defaultSize('left')).toBe(160)
    expect(defaultSize('bottom')).toBe(40)
  })
  it('minimums: 40 for every bar', () => {
    expect(HBAR.min).toBe(40)
    expect(VBAR.min).toBe(40)
  })
  it('stored sizes: static limits, whole px; under 40 (an older minimum) clamped up', () => {
    expect(clampStored('top', 10)).toBe(40)
    expect(clampStored('top', 32)).toBe(40)
    expect(clampStored('left', 48)).toBe(48)
    expect(clampStored('bottom', 99)).toBe(60)
    expect(clampStored('top', 45.6)).toBe(46)
    expect(clampStored('left', 3)).toBe(40)
    expect(clampStored('right', 1e9)).toBe(VBAR.max)
  })
  it('shown: vertical up to 30% of the window width, never below the minimum', () => {
    expect(maxSize('left', 1000)).toBe(300)
    expect(maxSize('top', 1000)).toBe(60)
    expect(shownSize('left', 400, 1000)).toBe(300)
    expect(shownSize('left', 400, 2000)).toBe(400)
    expect(shownSize('right', 160, 100)).toBe(40) // 30% under the minimum: the minimum
    expect(shownSize('bottom', 80, 500)).toBe(60)
    expect(shownSize('top', 20, 500)).toBe(40)
  })
})

describe('tabs in a side bar: TABS_MIN', () => {
  it('fits TAB_CHARS characters and the ellipsis in a narrow-form tab row: 65 px', () => {
    expect(TAB_CHARS).toBe(5)
    expect(TABS_MIN).toBe(Math.ceil(TAB_CHARS * TAB_CHAR_PX + TAB_ELLIPSIS_PX) + 2 * NARROW_TAB_PAD + 2 * NARROW_PAD)
    expect(TABS_MIN).toBe(65)
    expect(barForm(TABS_MIN)).toBe('narrow') // the insets counted are the narrow form's
    expect(TABS_MIN).toBeGreaterThan(VBAR.min)
  })
  it('the minimum of a side bar holding the tabs; others unchanged', () => {
    expect(minSize('left', true)).toBe(TABS_MIN)
    expect(minSize('right', false)).toBe(VBAR.min)
    expect(minSize('right')).toBe(VBAR.min)
    expect(minSize('top', true)).toBe(HBAR.min) // horizontal: tabs never shrink below 5 characters there (not a bar size)
    expect(minSize('bottom')).toBe(HBAR.min)
  })
  it('shown: a smaller stored size shown at TABS_MIN while the bar holds the tabs', () => {
    expect(shownSize('left', 48, 2000, true)).toBe(TABS_MIN)
    expect(shownSize('left', 48, 2000, false)).toBe(48)
    expect(shownSize('right', 80, 2000, true)).toBe(80)
    expect(shownSize('right', 400, 1000, true)).toBe(300)
  })
  it('a window too small for both: the minimum wins over the 30% cap', () => {
    expect(maxSize('left', 200, true)).toBe(TABS_MIN)
    expect(shownSize('left', 160, 200, true)).toBe(TABS_MIN)
    expect(shownSize('left', 160, 200, false)).toBe(60)
    expect(maxSize('left', 100, false)).toBe(VBAR.min)
    expect(VBAR.min).toBe(40)
  })
  it('stored sizes keep the static minimum (a bar may hold the tabs later, or no longer)', () => {
    expect(clampStored('left', 50)).toBe(50)
  })
})

describe('scale and forms', () => {
  it('horizontal: size / 40, 1x at 40, 1.5x at 60 and over; vertical: 1', () => {
    expect(barScale('top', 40)).toBe(1)
    expect(barScale('bottom', 60)).toBe(1.5)
    expect(barScale('top', 50)).toBe(1.25)
    expect(barScale('top', 45)).toBe(1.125)
    expect(barScale('top', 90)).toBe(1.5)
    expect(barScale('left', 300)).toBe(1)
  })
  it('narrow vertical: the horizontal scale at the same size (1x at 40, 1.5x from 60)', () => {
    for (const n of [40, 45, 50, 54, 59, 60]) expect(narrowScale(n)).toBe(barScale('top', n))
    expect(narrowScale(VBAR.min)).toBe(1)
    expect(narrowScale(50)).toBe(1.25)
    expect(narrowScale(54)).toBe(1.35)
    expect(narrowScale(60)).toBe(1.5)
    expect(narrowScale(LIST_MIN - 1)).toBe(1.5)
  })
  it('vertical forms: narrow below LIST_MIN, list from it', () => {
    expect(barForm(40)).toBe('narrow')
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
    const r = parseUiState('{"bars": {"top": 32, "bottom": 999, "left": "wide", "right": 30, "x": 1}}')
    expect(r.bars).toEqual({ top: 40, bottom: 60, left: 160, right: 40 })
    expect(r.problem).toMatch(/left/)
  })
  it('round trip through the written text', () => {
    const s = { top: 43, bottom: 60, left: 40, right: 300 }
    expect(parseUiState(uiStateText(s)).bars).toEqual(s)
    expect(JSON.parse(uiStateText(s))).toEqual({ bars: s })
    expect(sameSizes(s, { ...s })).toBe(true)
    expect(sameSizes(s, { ...s, top: 44 })).toBe(false)
  })
})
