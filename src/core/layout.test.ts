import { describe, expect, it } from 'vitest'
import { compute, dropSide, insert, leaf, leaves, move, normalize, parentDir, remove, resize, type Node } from './layout'

const opts = { gap: 0, bar: 10, collapsed: new Set<string>() }
const area = { x: 0, y: 0, w: 100, h: 100 }

describe('insert', () => {
  it('creates root leaf on empty tree', () => {
    expect(insert(null, null, 'r', 'a')).toEqual(leaf('a'))
  })

  it('splits a leaf in half', () => {
    const t = insert(leaf('a'), 'a', 'r', 'b')
    expect(t).toEqual({ type: 'split', dir: 'row', children: [leaf('a'), { ...leaf('b'), donor: 'a' }], sizes: [0.5, 0.5] })
  })

  it('inserts before on left/top', () => {
    const t = insert(leaf('a'), 'a', 't', 'b') as any
    expect(t.dir).toBe('col')
    expect(leaves(t)).toEqual(['b', 'a'])
  })

  it('adds sibling in same-direction parent, taking half of target', () => {
    let t: Node = insert(leaf('a'), 'a', 'r', 'b')
    t = insert(t, 'b', 'r', 'c') as any
    expect(t).toMatchObject({ dir: 'row', sizes: [0.5, 0.25, 0.25] })
    expect(leaves(t)).toEqual(['a', 'b', 'c'])
  })

  it('nests on perpendicular side', () => {
    let t: Node = insert(leaf('a'), 'a', 'r', 'b')
    t = insert(t, 'b', 'b', 'c')
    expect(t).toMatchObject({ dir: 'row', children: [leaf('a'), { dir: 'col', children: [leaf('b'), leaf('c')] }] })
  })
})

describe('remove', () => {
  it('collapses single-child split', () => {
    const t = insert(leaf('a'), 'a', 'r', 'b')
    expect(remove(t, 'b')).toEqual(leaf('a'))
  })

  it('returns null when last leaf removed', () => {
    expect(remove(leaf('a'), 'a')).toBeNull()
  })

  it('keeps tree identity when the id is absent', () => {
    const t = insert(leaf('a'), 'a', 'r', 'b')
    expect(remove(t, 'x')).toBe(t)
  })

  it('redistributes proportionally', () => {
    const t: Node = { type: 'split', dir: 'row', children: [leaf('a'), leaf('b'), leaf('c')], sizes: [0.5, 0.25, 0.25] }
    const r = remove(t, 'c') as any
    expect(r.sizes[0]).toBeCloseTo(2 / 3)
    expect(r.sizes[1]).toBeCloseTo(1 / 3)
  })

  it('split then close restores sizes, every side', () => {
    const t: Node = { type: 'split', dir: 'row', children: [leaf('a'), leaf('b'), leaf('c')], sizes: [0.5, 0.3, 0.2] }
    for (const side of ['l', 'r', 't', 'b'] as const) {
      const r = remove(insert(t, 'b', side, 'n'), 'n') as any
      expect(leaves(r), side).toEqual(['a', 'b', 'c'])
      r.sizes.forEach((s: number, i: number) => expect(s, `${side} ${i}`).toBeCloseTo(t.sizes[i]))
    }
  })

  it('gives the space back to the subtree now holding the donor', () => {
    // row[a, n] (n split from a), then a split down: row[col[a, d], n]. Close n: col gets it all.
    let t: Node = { type: 'split', dir: 'row', children: [leaf('a'), leaf('b')], sizes: [0.6, 0.4] }
    t = insert(t, 'a', 'r', 'n') // row[a .3, n .3, b .4]
    t = insert(t, 'a', 'b', 'd')
    const r = remove(t, 'n') as any
    expect(r.sizes[0]).toBeCloseTo(0.6)
    expect(r.sizes[1]).toBeCloseTo(0.4)
  })

  it('falls back to proportional when the donor is gone', () => {
    let t: Node = { type: 'split', dir: 'row', children: [leaf('a'), leaf('b'), leaf('c')], sizes: [0.5, 0.25, 0.25] }
    t = insert(t, 'a', 'r', 'n') // a .25, n .25, b .25, c .25
    t = remove(t, 'a') as Node // donor of n gone: proportional, n b c = 1/3 each
    const r = remove(t, 'n') as any // n's donor gone too: proportional
    expect(r.sizes[0]).toBeCloseTo(0.5)
    expect(r.sizes[1]).toBeCloseTo(0.5)
  })

  it('merges same-direction splits after removal', () => {
    // row[a, col[b, row[c, d]]] minus b => row[a, c, d]
    let t: Node = insert(leaf('a'), 'a', 'r', 'b')
    t = insert(t, 'b', 'b', 'c')
    t = insert(t, 'c', 'r', 'd')
    const r = remove(t, 'b') as any
    expect(r.dir).toBe('row')
    expect(leaves(r)).toEqual(['a', 'c', 'd'])
    expect(r.sizes.reduce((x: number, y: number) => x + y)).toBeCloseTo(1)
  })
})

describe('move', () => {
  it('moves a leaf next to another', () => {
    let t: Node = insert(leaf('a'), 'a', 'r', 'b')
    t = insert(t, 'b', 'r', 'c')
    const m = move(t, 'a', 'c', 'b')!
    expect(leaves(m)).toEqual(['b', 'c', 'a'])
    expect(parentDir(m, 'a')).toBe('col')
  })

  it('is a no-op onto itself', () => {
    const t = insert(leaf('a'), 'a', 'r', 'b')
    expect(move(t, 'a', 'a', 'l')).toBe(t)
  })
})

describe('normalize', () => {
  it('merges nested same-direction splits with scaled sizes', () => {
    const t: Node = {
      type: 'split', dir: 'row', sizes: [0.5, 0.5],
      children: [leaf('a'), { type: 'split', dir: 'row', sizes: [0.5, 0.5], children: [leaf('b'), leaf('c')] }],
    }
    expect(normalize(t)).toMatchObject({ dir: 'row', sizes: [0.5, 0.25, 0.25] })
  })
})

describe('dropSide', () => {
  const r = { x: 0, y: 0, w: 200, h: 100 }
  it('picks nearest edge', () => {
    expect(dropSide(r, 10, 50)).toBe('l')
    expect(dropSide(r, 190, 50)).toBe('r')
    expect(dropSide(r, 100, 5)).toBe('t')
    expect(dropSide(r, 100, 95)).toBe('b')
  })
})

describe('compute', () => {
  it('lays out a row with gaps', () => {
    const t = insert(leaf('a'), 'a', 'r', 'b')
    const l = compute(t, area, { ...opts, gap: 10 })
    expect(l.tiles.get('a')).toMatchObject({ x: 0, w: 45 })
    expect(l.tiles.get('b')).toMatchObject({ x: 55, w: 45 })
    expect(l.borders).toHaveLength(1)
    expect(l.borders[0].rect).toMatchObject({ x: 45, w: 10 })
  })

  it('gives collapsed tiles bar thickness, siblings take the rest', () => {
    let t: Node = insert(leaf('a'), 'a', 'b', 'b')
    t = insert(t, 'b', 'b', 'c')
    const l = compute(t, area, { ...opts, collapsed: new Set(['b']) })
    expect(l.tiles.get('b')).toMatchObject({ h: 10, collapsed: 'horizontal' })
    expect(l.tiles.get('a')!.h + l.tiles.get('c')!.h).toBeCloseTo(90)
    expect(l.borders).toHaveLength(0) // both borders touch the collapsed tile
  })

  it('collapses as vertical strip in a row', () => {
    const t = insert(leaf('a'), 'a', 'r', 'b')
    const l = compute(t, area, { ...opts, collapsed: new Set(['a']) })
    expect(l.tiles.get('a')).toMatchObject({ w: 10, collapsed: 'vertical' })
    expect(l.tiles.get('b')).toMatchObject({ x: 10, w: 90 })
  })

  it('keeps last child expanded if all are collapsed', () => {
    const t = insert(leaf('a'), 'a', 'r', 'b')
    const l = compute(t, area, { ...opts, collapsed: new Set(['a', 'b']) })
    expect(l.tiles.get('b')!.collapsed).toBe('none')
  })
})

describe('resize', () => {
  it('moves border by px and clamps to min', () => {
    const t = insert(leaf('a'), 'a', 'r', 'b')
    const r = resize(t, [], 0, 20, 100, 10) as any
    expect(r.sizes[0]).toBeCloseTo(0.7)
    const c = resize(t, [], 0, 100, 100, 10) as any
    expect(c.sizes[0]).toBeCloseTo(0.9)
  })
})
