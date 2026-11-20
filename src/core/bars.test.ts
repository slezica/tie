import { describe, it, expect } from 'vitest'
import { defaultBars, validBars, cleanBars, migrateToolbar, placeOf, barOf, barItems, barEmpty, isVertical, dropComponent, type Bars } from './bars'

const layout = (patch: Partial<Bars>): Bars => ({ top: { start: [], end: [] }, bottom: { start: [], end: [] }, left: { start: [], end: [] }, right: { start: [], end: [] }, ...patch })

describe('default and validity', () => {
  it('default: everything at the bottom, tabs at the start, shelf then templates at the end', () => {
    expect(defaultBars()).toEqual(layout({ bottom: { start: ['tabs'], end: ['shelf', 'templates'] } }))
    expect(defaultBars('top').top).toEqual({ start: ['tabs'], end: ['shelf', 'templates'] })
    expect(validBars(defaultBars())).toBe(true)
  })
  it('any arrangement with each component once is valid', () => {
    expect(validBars(layout({ top: { start: [], end: ['tabs'] }, left: { start: ['templates', 'shelf'], end: [] } }))).toBe(true)
  })
  it('invalid: missing, twice, unknown, wrong shape, extra keys', () => {
    expect(validBars(layout({ bottom: { start: ['tabs'], end: ['shelf'] } }))).toBe(false) // templates missing
    expect(validBars(layout({ bottom: { start: ['tabs', 'tabs'], end: ['shelf', 'templates'] } }))).toBe(false)
    expect(validBars(layout({ bottom: { start: ['tabs', 'brand' as never], end: ['shelf', 'templates'] } }))).toBe(false)
    const { left: _, ...three } = defaultBars()
    expect(validBars(three)).toBe(false)
    expect(validBars({ ...defaultBars(), middle: { start: [], end: [] } })).toBe(false)
    expect(validBars({ ...defaultBars(), top: { start: [] } })).toBe(false)
    expect(validBars({ ...defaultBars(), top: { start: [], end: [], size: 3 } })).toBe(false)
    expect(validBars({ ...defaultBars(), top: { start: 'tabs', end: [] } })).toBe(false)
    for (const v of [null, undefined, 'bottom', [], 5]) expect(validBars(v)).toBe(false)
  })
  it('cleanBars: a copy when valid, the default otherwise', () => {
    const v = defaultBars('left')
    const c = cleanBars(v)
    expect(c).toEqual(v)
    expect(c.left.start).not.toBe(v.left.start)
    expect(cleanBars({ nope: 1 })).toEqual(defaultBars())
  })
})

describe('migrateToolbar', () => {
  it('toolbar top and no bars: the default on the top bar', () => {
    expect(migrateToolbar({ toolbar: 'top' }).bars).toEqual(defaultBars('top'))
  })
  it('otherwise untouched', () => {
    expect(migrateToolbar({ toolbar: 'bottom' })).toEqual({ toolbar: 'bottom' })
    const bars = defaultBars('right')
    expect(migrateToolbar({ toolbar: 'top', bars }).bars).toBe(bars)
    expect(migrateToolbar({})).toEqual({})
  })
})

describe('lookups', () => {
  const l = layout({ top: { start: ['tabs'], end: [] }, right: { start: [], end: ['templates', 'shelf'] } })
  it('placeOf, barOf', () => {
    expect(placeOf(l, 'shelf')).toEqual({ bar: 'right', gravity: 'end', index: 1 })
    expect(barOf(l, 'tabs')).toBe('top')
  })
  it('barItems: start then end; barEmpty', () => {
    expect(barItems(l, 'right')).toEqual(['templates', 'shelf'])
    expect(barEmpty(l, 'bottom')).toBe(true)
    expect(barEmpty(l, 'top')).toBe(false)
  })
  it('isVertical', () => {
    expect(isVertical('left') && isVertical('right') && !isVertical('top') && !isVertical('bottom')).toBe(true)
  })
})

describe('dropComponent (S25, S26)', () => {
  // [tabs 10..200] ... [shelf 600..700][templates 706..800]
  const spans = [
    { c: 'tabs' as const, lo: 10, hi: 200 },
    { c: 'shelf' as const, lo: 600, hi: 700 },
    { c: 'templates' as const, lo: 706, hi: 800 },
  ]
  it('on a component: that one (templates too: they take nothing)', () => {
    expect(dropComponent(spans, 100)).toEqual({ c: 'tabs', inside: true })
    expect(dropComponent(spans, 650)).toEqual({ c: 'shelf', inside: true })
    expect(dropComponent(spans, 750)).toEqual({ c: 'templates', inside: true })
  })
  it('empty space: the nearest drop-taking component', () => {
    expect(dropComponent(spans, 390)).toEqual({ c: 'tabs', inside: false })
    expect(dropComponent(spans, 410)).toEqual({ c: 'shelf', inside: false })
    expect(dropComponent(spans, 703)).toEqual({ c: 'shelf', inside: false }) // between shelf and templates
    expect(dropComponent(spans, 900)).toEqual({ c: 'shelf', inside: false }) // past templates: shelf, not templates
    expect(dropComponent(spans, 2)).toEqual({ c: 'tabs', inside: false })
  })
  it('a bar with templates only: nothing', () => {
    expect(dropComponent([{ c: 'templates', lo: 10, hi: 100 }], 300)).toBeNull()
    expect(dropComponent([], 300)).toBeNull()
  })
  it('ties: the first in order', () => {
    expect(dropComponent([{ c: 'tabs', lo: 0, hi: 100 }, { c: 'shelf', lo: 200, hi: 300 }], 150)).toEqual({ c: 'tabs', inside: false })
  })
})
