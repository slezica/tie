import { describe, it, expect } from 'vitest'
import { defaultBars, validBars, cleanBars, migrateToolbar, placeOf, barOf, barItems, barEmpty, isVertical, dropComponent, sameBars, moveComponent, barsSummary, barRects, barZones, barAt, gravityAt, indexAt, type Bars } from './bars'

const sz = (h: number, v: number) => ({ top: h, bottom: h, left: v, right: v })
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

describe('edit mode (S33 to S36)', () => {
  it('sameBars: structural, order matters, key order does not', () => {
    const a = defaultBars()
    const b = { right: a.right, left: a.left, bottom: { end: ['shelf', 'templates'], start: ['tabs'] }, top: a.top } as Bars
    expect(sameBars(a, b)).toBe(true)
    expect(sameBars(a, layout({ bottom: { start: ['tabs'], end: ['templates', 'shelf'] } }))).toBe(false)
    expect(sameBars(a, layout({ bottom: { start: ['tabs', 'shelf'], end: ['templates'] } }))).toBe(false)
    expect(sameBars(a, defaultBars('top'))).toBe(false)
  })
  it('moveComponent: to another bar, gravity, index; the source untouched', () => {
    const a = defaultBars()
    expect(moveComponent(a, 'shelf', 'left', 'start', 0)).toEqual(layout({ bottom: { start: ['tabs'], end: ['templates'] }, left: { start: ['shelf'], end: [] } }))
    expect(moveComponent(a, 'tabs', 'bottom', 'end', 1)).toEqual(layout({ bottom: { start: [], end: ['shelf', 'tabs', 'templates'] } }))
    expect(moveComponent(a, 'templates', 'bottom', 'end', 0)).toEqual(layout({ bottom: { start: ['tabs'], end: ['templates', 'shelf'] } }))
    expect(moveComponent(a, 'tabs', 'top', 'end', 9)).toEqual(layout({ top: { start: [], end: ['tabs'] }, bottom: { start: [], end: ['shelf', 'templates'] } })) // clamped
    expect(moveComponent(a, 'shelf', 'bottom', 'end', 0)).toEqual(a) // back where it was
    expect(a).toEqual(defaultBars())
    expect(validBars(moveComponent(a, 'shelf', 'right', 'end', 0))).toBe(true)
  })
  it('barsSummary: per bar in use, components in visual order', () => {
    expect(barsSummary(defaultBars())).toBe('Bottom: Tabs, Shelf, Templates')
    expect(barsSummary(layout({ top: { start: [], end: ['tabs'] }, left: { start: ['templates'], end: ['shelf'] } }))).toBe('Top: Tabs · Left: Templates, Shelf')
  })
  it('barRects: top / bottom full width, sides between the bars that exist (S9)', () => {
    const r = barRects(1000, 700, 28, sz(40, 160), (b) => b === 'bottom')
    expect(r.top).toEqual({ x: 0, y: 28, w: 1000, h: 40 })
    expect(r.bottom).toEqual({ x: 0, y: 660, w: 1000, h: 40 })
    expect(r.left).toEqual({ x: 0, y: 28, w: 160, h: 632 })
    expect(r.right).toEqual({ x: 840, y: 28, w: 160, h: 632 })
    expect(barRects(1000, 700, 0, sz(40, 160), (b) => b === 'top').left).toEqual({ x: 0, y: 40, w: 160, h: 660 })
  })
  it('barAt: inside a zone; existing first at corners, then the nearest edge; else null', () => {
    const r = barRects(1000, 700, 28, sz(40, 160), (b) => b === 'bottom')
    const zones = (['top', 'bottom', 'left', 'right'] as const).map((bar) => ({ bar, rect: r[bar], exists: bar === 'bottom' }))
    expect(barAt(zones, 500, 680)).toBe('bottom')
    expect(barAt(zones, 500, 40)).toBe('top')
    expect(barAt(zones, 20, 400)).toBe('left')
    expect(barAt(zones, 990, 400)).toBe('right')
    expect(barAt(zones, 500, 400)).toBeNull()
    expect(barAt(zones, 10, 680)).toBe('bottom') // corner: left's zone too, bottom exists
    expect(barAt(zones, 5, 60)).toBe('left') // top-left corner, both potential: left edge nearer
    expect(barAt(zones, 30, 32)).toBe('top')
  })
  it('barZones: existing bars as they are; potential edges never overlap them or each other', () => {
    const z = barZones(1000, 700, 28, sz(40, 160), (b) => b === 'bottom' || b === 'left')
    expect(z.bottom).toEqual({ x: 0, y: 660, w: 1000, h: 40 })
    expect(z.left).toEqual({ x: 0, y: 28, w: 160, h: 632 })
    expect(z.top).toEqual({ x: 160, y: 28, w: 840, h: 40 })
    expect(z.right).toEqual({ x: 840, y: 68, w: 160, h: 592 })
    const none = barZones(1000, 700, 28, sz(40, 160), (b) => b === 'top')
    expect(none.bottom).toEqual({ x: 0, y: 660, w: 1000, h: 40 })
    expect(none.left).toEqual({ x: 0, y: 68, w: 160, h: 592 })
  })
  it('barRects / barZones: each bar its own size', () => {
    const size = { top: 60, bottom: 32, left: 48, right: 300 }
    const r = barRects(1000, 700, 28, size, (b) => b !== 'right')
    expect(r.top).toEqual({ x: 0, y: 28, w: 1000, h: 60 })
    expect(r.bottom).toEqual({ x: 0, y: 668, w: 1000, h: 32 })
    expect(r.left).toEqual({ x: 0, y: 88, w: 48, h: 580 })
    expect(r.right).toEqual({ x: 700, y: 88, w: 300, h: 580 })
    const z = barZones(1000, 700, 28, size, (b) => b === 'left')
    expect(z.top).toEqual({ x: 48, y: 28, w: 952, h: 60 })
    expect(z.right).toEqual({ x: 700, y: 88, w: 300, h: 580 })
  })
  it('gravityAt: the half of the bar along its axis (S35)', () => {
    expect(gravityAt('bottom', { x: 0, y: 660, w: 1000, h: 40 }, 499, 680)).toBe('start')
    expect(gravityAt('bottom', { x: 0, y: 660, w: 1000, h: 40 }, 501, 680)).toBe('end')
    expect(gravityAt('left', { x: 0, y: 28, w: 160, h: 632 }, 150, 100)).toBe('start')
    expect(gravityAt('left', { x: 0, y: 28, w: 160, h: 632 }, 10, 600)).toBe('end')
  })
  it('indexAt: other components with their midpoint before the pointer (S36)', () => {
    expect(indexAt([], 50)).toBe(0)
    expect(indexAt([100, 300], 50)).toBe(0)
    expect(indexAt([100, 300], 200)).toBe(1)
    expect(indexAt([100, 300], 400)).toBe(2)
  })
})
