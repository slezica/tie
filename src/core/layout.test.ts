import { describe, expect, it } from 'vitest'
import { CENTER_ZONE, compute, dropZone, equalize, inRevealZone, insert, leaf, leaves, move, normalize, parentDir, remove, replaceLeaf, resize, insertGroup, nearestEdge, swapLeaves, type Node } from './layout'

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

describe('replaceLeaf', () => {
  // a | (b over c), sizes 0.5 / 0.5, inner 0.5 / 0.5
  const tree = () => insert(insert(leaf('a'), 'a', 'r', 'b'), 'b', 'b', 'c')

  it('new id takes the leaf, sizes stay', () => {
    const t = resize(tree(), [], 0, -20, 100, 10)
    const r = replaceLeaf(t, 'c', 'x') as any
    expect(leaves(r)).toEqual(['a', 'b', 'x'])
    expect(r.sizes).toEqual((t as any).sizes)
    expect(r.children[1].sizes).toEqual((t as any).children[1].sizes)
  })

  it('returns a new tree, input untouched', () => {
    const t = tree()
    const before = structuredClone(t)
    expect(replaceLeaf(t, 'a', 'x')).not.toBe(t)
    expect(t).toEqual(before)
  })

  it('keeps its donor; donor links to it follow', () => {
    const r = replaceLeaf(tree(), 'b', 'x')! // c had donor b
    expect(leaves(r)).toEqual(['a', 'x', 'c'])
    expect(remove(r, 'c')).toMatchObject({ sizes: [0.5, 0.5] }) // c's space back to x
    expect(remove(remove(r, 'c'), 'x')).toEqual(leaf('a')) // x had donor a (b's)
  })

  it('root leaf', () => {
    expect(replaceLeaf(leaf('a'), 'a', 'x')).toEqual(leaf('x'))
  })

  it('absent target, empty tree, same id: unchanged', () => {
    const t = tree()
    expect(replaceLeaf(t, 'z', 'x')).toBe(t)
    expect(replaceLeaf(null, 'a', 'x')).toBe(null)
    expect(replaceLeaf(t, 'a', 'a')).toBe(t)
  })

  it('new id already in the tree: moved into the place', () => {
    const r = replaceLeaf(tree(), 'a', 'c')!
    expect(leaves(r)).toEqual(['c', 'b'])
  })
})

describe('swapLeaves', () => {
  // a | (b over c), sizes 0.5 / 0.5, inner 0.5 / 0.5
  const tree = () => insert(insert(leaf('a'), 'a', 'r', 'b'), 'b', 'b', 'c')

  it('exchanges two leaves, sizes stay with the positions', () => {
    const t = resize(tree(), [], 0, -20, 100, 10)
    const s = swapLeaves(t, 'a', 'c') as any
    expect(leaves(s)).toEqual(['c', 'b', 'a'])
    expect(s.sizes).toEqual((t as any).sizes)
    expect(s.children[1].sizes).toEqual((t as any).children[1].sizes)
  })

  it('returns a new tree, input untouched', () => {
    const t = tree()
    const before = structuredClone(t)
    const s = swapLeaves(t, 'a', 'b')
    expect(s).not.toBe(t)
    expect(t).toEqual(before)
  })

  it('donor links follow the positions', () => {
    const s = swapLeaves(tree(), 'b', 'c')! // c had donor b; now b sits there with donor c
    expect(leaves(s)).toEqual(['a', 'c', 'b'])
    expect(leaves(remove(s, 'b'))).toEqual(['a', 'c'])
    expect(remove(s, 'b')).toMatchObject({ sizes: [0.5, 0.5] })
  })

  it('swapping twice restores the tree', () => {
    const t = tree()
    expect(swapLeaves(swapLeaves(t, 'a', 'c'), 'a', 'c')).toEqual(t)
  })

  it('one present: that leaf takes the other id', () => {
    expect(leaves(swapLeaves(tree(), 'b', 'x'))).toEqual(['a', 'x', 'c'])
    expect(leaves(swapLeaves(tree(), 'x', 'c'))).toEqual(['a', 'b', 'x'])
  })

  it('neither present, same id, or empty: unchanged', () => {
    const t = tree()
    expect(swapLeaves(t, 'x', 'y')).toBe(t)
    expect(swapLeaves(t, 'a', 'a')).toBe(t)
    expect(swapLeaves(null, 'a', 'b')).toBe(null)
  })

  it('root leaf', () => {
    expect(swapLeaves(leaf('a'), 'a', 'b')).toEqual(leaf('b'))
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

describe('dropZone', () => {
  const wide = { x: 100, y: 50, w: 400, h: 100 }
  const tall = { x: 0, y: 0, w: 100, h: 400 }
  // Point at normalized (nx, ny) inside r.
  const at = (r: typeof wide, nx: number, ny: number) => dropZone(r, r.x + nx * r.w, r.y + ny * r.h)

  it('center rectangle: CENTER_ZONE of width and height', () => {
    expect(CENTER_ZONE).toBe(0.25)
    for (const r of [wide, tall]) {
      expect(at(r, 0.5, 0.5)).toBe('center')
      expect(at(r, 0.38, 0.38)).toBe('center')
      expect(at(r, 0.62, 0.62)).toBe('center')
      expect(at(r, 0.38, 0.62)).toBe('center')
      // Just outside each side of the center rectangle: that side's band.
      expect(at(r, 0.37, 0.5)).toBe('l')
      expect(at(r, 0.63, 0.5)).toBe('r')
      expect(at(r, 0.5, 0.37)).toBe('t')
      expect(at(r, 0.5, 0.63)).toBe('b')
    }
  })

  it('edge bands: nearest edge', () => {
    for (const r of [wide, tall]) {
      expect(at(r, 0.05, 0.5)).toBe('l')
      expect(at(r, 0.95, 0.5)).toBe('r')
      expect(at(r, 0.5, 0.05)).toBe('t')
      expect(at(r, 0.5, 0.95)).toBe('b')
      // The whole band, edge to edge along it.
      expect(at(r, 0.2, 0.3)).toBe('l')
      expect(at(r, 0.3, 0.2)).toBe('t')
    }
  })

  it('corners: split by the diagonal (normalized, any aspect)', () => {
    for (const r of [wide, tall]) {
      expect(at(r, 0.1, 0.12)).toBe('l')
      expect(at(r, 0.12, 0.1)).toBe('t')
      expect(at(r, 0.9, 0.12)).toBe('r')
      expect(at(r, 0.88, 0.1)).toBe('t')
      expect(at(r, 0.9, 0.88)).toBe('r')
      expect(at(r, 0.88, 0.9)).toBe('b')
      expect(at(r, 0.1, 0.88)).toBe('l')
      expect(at(r, 0.12, 0.9)).toBe('b')
    }
  })

  it('title bar: no special role (top band, or center by geometry)', () => {
    const r = { x: 0, y: 0, w: 400, h: 300 }
    expect(dropZone(r, 200, 10)).toBe('t')
    const short = { x: 0, y: 0, w: 400, h: 24 } // a tile about as tall as its bar
    expect(dropZone(short, 200, 12)).toBe('center')
  })
})

describe('inRevealZone', () => {
  // Side by side: reveal left of the item, a 20 px gap between.
  const reveal = { x: 100, y: 100, w: 400, h: 300 }
  const item = { x: 520, y: 230, w: 60, h: 40 }
  it('covers item, reveal and the band between', () => {
    expect(inRevealZone(550, 250, item, reveal)).toBe(true) // item
    expect(inRevealZone(300, 120, item, reveal)).toBe(true) // reveal
    expect(inRevealZone(510, 250, item, reveal)).toBe(true) // gap, level with the item
    expect(inRevealZone(510, 110, item, reveal)).toBe(true) // gap, diagonal toward the reveal's top
  })
  it('excludes the rest', () => {
    expect(inRevealZone(550, 300, item, reveal)).toBe(false) // below the item
    expect(inRevealZone(550, 200, item, reveal)).toBe(false) // above the item
    expect(inRevealZone(90, 250, item, reveal)).toBe(false) // left of the reveal
    expect(inRevealZone(510, 420, item, reveal)).toBe(false) // band x, below both
    expect(inRevealZone(300, 401, item, reveal, 0)).toBe(false)
  })
  // Reveal above the item (toolbar at the bottom), a 20 px gap between.
  const above = { x: 100, y: 100, w: 400, h: 300 }
  const below = { x: 280, y: 420, w: 40, h: 30 }
  it('vertical: covers item, reveal and the band between', () => {
    expect(inRevealZone(300, 430, below, above)).toBe(true) // item
    expect(inRevealZone(120, 110, below, above)).toBe(true) // reveal
    expect(inRevealZone(300, 410, below, above)).toBe(true) // gap, over the item
    expect(inRevealZone(110, 410, below, above)).toBe(true) // gap, diagonal toward the reveal's left
  })
  it('vertical: excludes the rest', () => {
    expect(inRevealZone(350, 430, below, above)).toBe(false) // toolbar beside the item
    expect(inRevealZone(300, 90, below, above)).toBe(false) // above the reveal
    expect(inRevealZone(510, 410, below, above)).toBe(false) // band y, right of both
  })
  // Shelf in a left bar: the item at the bar's top, the reveal right of it, clamped to the board's top
  // (it starts level with the item's top and reaches far below it), a 16 px gap between.
  const leftItem = { x: 10, y: 40, w: 140, h: 28 }
  const rightReveal = { x: 166, y: 40, w: 400, h: 300 }
  it('left bar: covers item, reveal and the band between', () => {
    expect(inRevealZone(80, 54, leftItem, rightReveal)).toBe(true) // item
    expect(inRevealZone(158, 54, leftItem, rightReveal)).toBe(true) // gap, level with the item
    expect(inRevealZone(158, 300, leftItem, rightReveal)).toBe(true) // gap, level with the reveal's lower part
    expect(inRevealZone(400, 330, leftItem, rightReveal)).toBe(true) // reveal, far below the item
  })
  it('left bar: excludes the rest', () => {
    expect(inRevealZone(80, 100, leftItem, rightReveal)).toBe(false) // the bar below the item (next items)
    expect(inRevealZone(80, 30, leftItem, rightReveal)).toBe(false) // the bar above the item
    expect(inRevealZone(158, 350, leftItem, rightReveal)).toBe(false) // band x, below both
    expect(inRevealZone(580, 200, leftItem, rightReveal)).toBe(false) // right of the reveal
  })
  // Shelf in a right bar: the reveal left of the item, centred on it (the item level with its middle).
  const rightItem = { x: 1000, y: 386, w: 28, h: 28 }
  const leftReveal = { x: 584, y: 250, w: 400, h: 300 }
  it('right bar: covers item, reveal and the band between', () => {
    expect(inRevealZone(1014, 400, rightItem, leftReveal)).toBe(true) // item
    expect(inRevealZone(992, 400, rightItem, leftReveal)).toBe(true) // gap, level with the item
    expect(inRevealZone(992, 260, rightItem, leftReveal)).toBe(true) // gap, diagonal toward the reveal's top
    expect(inRevealZone(600, 540, rightItem, leftReveal)).toBe(true) // reveal
  })
  it('right bar: excludes the rest', () => {
    expect(inRevealZone(1014, 440, rightItem, leftReveal)).toBe(false) // the bar below the item
    expect(inRevealZone(1014, 360, rightItem, leftReveal)).toBe(false) // the bar above the item
    expect(inRevealZone(992, 560, rightItem, leftReveal)).toBe(false) // band x, below both
    expect(inRevealZone(570, 400, rightItem, leftReveal)).toBe(false) // left of the reveal
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

  it('zoom: siblings squashed to bars along the path, subtree leaves share one bar', () => {
    // row[a, col[b, row[c, d]]], zoomed c
    let t: Node = insert(leaf('a'), 'a', 'r', 'b')
    t = insert(t, 'b', 'b', 'c')
    t = insert(t, 'c', 'r', 'd')
    const l = compute(t, area, { ...opts, zoomed: 'c', collapsed: new Set(['c', 'd']) })
    expect(l.tiles.get('a')).toMatchObject({ x: 0, y: 0, w: 10, h: 100, collapsed: 'vertical' })
    expect(l.tiles.get('b')).toMatchObject({ x: 10, y: 0, w: 90, h: 10, collapsed: 'horizontal' })
    expect(l.tiles.get('c')).toMatchObject({ x: 10, y: 10, w: 80, h: 90, collapsed: 'none' })
    expect(l.tiles.get('d')).toMatchObject({ x: 90, y: 10, w: 10, h: 90, collapsed: 'vertical' })
    expect(l.borders).toHaveLength(0)
    // zoomed a: the col[b, row[c, d]] subtree is one strip, its three leaves stacked equally
    const m = compute(t, area, { ...opts, zoomed: 'a' })
    expect(m.tiles.get('a')).toMatchObject({ x: 0, w: 90, h: 100, collapsed: 'none' })
    for (const [i, id] of ['b', 'c', 'd'].entries()) {
      expect(m.tiles.get(id)).toMatchObject({ x: 90, w: 10, collapsed: 'vertical' })
      expect(m.tiles.get(id)!.y).toBeCloseTo((i * 100) / 3)
      expect(m.tiles.get(id)!.h).toBeCloseTo(100 / 3)
    }
  })

  it('zoom: a tile not in the tree (floating) leaves the layout alone', () => {
    const t = insert(leaf('a'), 'a', 'r', 'b')
    expect(compute(t, area, { ...opts, zoomed: 'f' })).toEqual(compute(t, area, opts))
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

  // compute's border (`path`, `index`, `length`) fed back to resize: the border moves by exactly
  // the dragged px, whatever the nesting, gaps and collapsed siblings (drag.ts attachBorder).
  it('round-trips compute borders: nested, gaps, collapsed', () => {
    // row[a, col[b, c, d]], d collapsed, gap 10.
    let t: Node = insert(leaf('a'), 'a', 'r', 'b')
    t = insert(t, 'b', 'b', 'c')
    t = insert(t, 'c', 'b', 'd')
    const board = { x: 0, y: 0, w: 1000, h: 600 }
    const o = { gap: 10, bar: 10, collapsed: new Set(['d']) }
    const l = compute(t, board, o)
    // Borders only between non-collapsed siblings: a | col, b / c; none at d.
    expect(l.borders.map((b) => [b.path.join('.'), b.index, b.dir])).toEqual([['', 0, 'row'], ['1', 0, 'col']])
    const [row, col] = l.borders
    // length: px per size fraction (gaps and collapsed bars excluded).
    expect(row.length).toBeCloseTo(990)
    expect(col.length).toBeCloseTo((600 - 20 - 10) / (1 - 0.25))
    expect(row.rect).toMatchObject({ x: l.tiles.get('a')!.w, w: 10, h: 600 })
    expect(col.rect.y).toBeCloseTo(l.tiles.get('b')!.y + l.tiles.get('b')!.h)

    for (const [br, before, after, axis] of [[row, 'a', 'b', 'w'], [col, 'b', 'c', 'h']] as const) {
      for (const d of [37, -52]) {
        const m = compute(resize(t, br.path, br.index, d, br.length, 80), board, o)
        expect(m.tiles.get(before)![axis]).toBeCloseTo(l.tiles.get(before)![axis] + d)
        expect(m.tiles.get(after)![axis]).toBeCloseTo(l.tiles.get(after)![axis] - d)
        expect(m.tiles.get('d')!.h).toBe(10) // the collapsed bar keeps its thickness
      }
    }
    // Clamped at min px on both sides (here b / c: 80 px minimum).
    const far = compute(resize(t, col.path, col.index, 10000, col.length, 80), board, o)
    expect(far.tiles.get('c')!.h).toBeCloseTo(80)
  })
})

describe('equalize', () => {
  it('gives every child of the split at path the same size', () => {
    let t = insert(insert(leaf('a'), 'a', 'r', 'b'), 'b', 'r', 'c')
    t = resize(t, [], 0, 30, 100, 10)
    const e = equalize(t, []) as any
    expect(e.sizes).toEqual([1 / 3, 1 / 3, 1 / 3])
    expect(equalize(t, [0])).toBe(t) // not a split: unchanged
  })
})

describe('nearestEdge', () => {
  const r = { x: 0, y: 0, w: 400, h: 100 }
  it('center: still the nearest edge (normalized)', () => {
    expect(nearestEdge(r, 199, 50)).toBe('l')
    expect(nearestEdge(r, 201, 50)).toBe('r')
    expect(nearestEdge(r, 200, 40)).toBe('t')
    expect(nearestEdge(r, 200, 60)).toBe('b')
  })
  it('agrees with dropZone outside the center', () => {
    for (const [x, y] of [[20, 50], [380, 50], [200, 5], [200, 95]]) expect(nearestEdge(r, x, y)).toBe(dropZone(r, x, y))
  })
})

describe('insertGroup', () => {
  const board = { x: 0, y: 0, w: 1000, h: 600 }
  const o = { gap: 0, bar: 10, collapsed: new Set<string>() }
  const rects = (t: Node | null, gap = 0) => compute(t, board, { ...o, gap }).tiles

  it('N = 1 equals a single insert', () => {
    const t = insert(leaf('a'), 'a', 'r', 'b')
    expect(insertGroup(t, 'b', 'b', ['g'], board, o)).toEqual(insert(t, 'b', 'b', 'g'))
    expect(insertGroup(null, null, 'r', ['g'], board, o)).toEqual(leaf('g'))
  })

  it('wide area: side by side, in order, even', () => {
    // a over b; g1..g3 below b: b's lower half is 1000 x 150, wide.
    const t = insert(leaf('a'), 'a', 'b', 'b')
    const g = insertGroup(t, 'b', 'b', ['g1', 'g2', 'g3'], board, o)!
    const r = rects(g)
    expect(['g1', 'g2', 'g3'].map((id) => r.get(id)!.x)).toEqual([0, 1000 / 3, 2000 / 3])
    for (const id of ['g1', 'g2', 'g3']) expect(r.get(id)).toMatchObject({ y: 450, h: 150, w: 1000 / 3 })
  })

  it('tall area: stacked, in order, even', () => {
    // right of a lone tile: 500 x 600, tall.
    const g = insertGroup(leaf('a'), 'a', 'r', ['g1', 'g2'], board, o)!
    const r = rects(g)
    expect(r.get('g1')).toMatchObject({ x: 500, y: 0, w: 500, h: 300 })
    expect(r.get('g2')).toMatchObject({ x: 500, y: 300, w: 500, h: 300 })
  })

  it('empty board: fills it, along the longer side', () => {
    const g = insertGroup(null, null, 'r', ['g1', 'g2'], board, o)!
    expect(g).toMatchObject({ dir: 'row', sizes: [0.5, 0.5] })
    expect(leaves(g)).toEqual(['g1', 'g2'])
    const tall = insertGroup(null, null, 'r', ['g1', 'g2'], { x: 0, y: 0, w: 300, h: 600 }, o)!
    expect(tall).toMatchObject({ dir: 'col' })
  })

  it('same direction as the parent: merged (normalized), the others keep their shares', () => {
    // a | b, group right of b in a wide board: area b's right half (250 x 600, tall) → stacked, nested.
    const t = insert(leaf('a'), 'a', 'r', 'b')
    const tall = insertGroup(t, 'b', 'r', ['g1', 'g2'], board, o) as any
    expect(tall.sizes).toEqual([0.5, 0.25, 0.25])
    expect(tall.children[2]).toMatchObject({ dir: 'col', sizes: [0.5, 0.5] })
    // Wide board for it: 4000 x 600 → b's half 1000 x 600, wide → side by side, merged into the row.
    const wide = insertGroup(t, 'b', 'r', ['g1', 'g2'], { x: 0, y: 0, w: 4000, h: 600 }, o) as any
    expect(wide).toMatchObject({ dir: 'row', sizes: [0.5, 0.25, 0.125, 0.125] })
    expect(leaves(wide)).toEqual(['a', 'b', 'g1', 'g2'])
    // Shares outside the group: as a single insert.
    const single = insert(t, 'b', 'r', 'g') as any
    expect(wide.sizes.slice(0, 2)).toEqual(single.sizes.slice(0, 2))
  })

  it('before the target on l / t', () => {
    const g = insertGroup(insert(leaf('a'), 'a', 'b', 'b'), 'a', 't', ['g1', 'g2'], board, o)!
    expect(leaves(g)).toEqual(['g1', 'g2', 'a', 'b'])
  })

  it('donors: closing one shares its space within the group; closing all restores the target', () => {
    const t = insert(leaf('a'), 'a', 'b', 'b')
    const g = insertGroup(t, 'b', 'b', ['g1', 'g2', 'g3'], board, o)!
    const r = rects(remove(g, 'g2'))
    expect(r.get('g1')!.w).toBeCloseTo(500)
    expect(r.get('g3')!.w).toBeCloseTo(500)
    for (const order of [['g1', 'g2', 'g3'], ['g3', 'g1', 'g2']]) expect(order.reduce<Node | null>((n, id) => remove(n, id), g)).toEqual(t)
    // Merged into the parent (wide area beside b): closing all gives b its space back too.
    const w = insertGroup(insert(leaf('a'), 'a', 'r', 'b'), 'b', 'r', ['g1', 'g2'], { x: 0, y: 0, w: 4000, h: 600 }, o)!
    expect(remove(remove(w, 'g2'), 'g1')).toEqual(insert(leaf('a'), 'a', 'r', 'b'))
  })

  it('gaps: the group shares the measured area evenly', () => {
    const g = insertGroup(insert(leaf('a'), 'a', 'b', 'b'), 'b', 'b', ['g1', 'g2'], board, { ...o, gap: 10 })!
    const r = rects(g, 10)
    expect(r.get('g1')!.w).toBeCloseTo(r.get('g2')!.w)
    expect(r.get('g1')!.w + r.get('g2')!.w + 10).toBeCloseTo(1000)
  })

  it('ids already in the tree are moved', () => {
    const t = insert(insert(leaf('a'), 'a', 'r', 'g1'), 'a', 'b', 'b')
    const g = insertGroup(t, 'b', 'b', ['g1', 'g2'], board, o)!
    expect(leaves(g).filter((x) => x === 'g1')).toHaveLength(1)
    // g1 left its slot (a over b now fills the board); the group below b: 1000 x 150, side by side.
    expect(leaves(g)).toEqual(['a', 'b', 'g1', 'g2'])
    const r = rects(g)
    expect(r.get('g1')).toMatchObject({ x: 0, y: 450, w: 500, h: 150 })
    expect(r.get('g2')).toMatchObject({ x: 500, y: 450, w: 500, h: 150 })
  })

  it('zoom ignored: the area is measured as the unzoomed board', () => {
    const t = insert(leaf('a'), 'a', 'b', 'b')
    // Zoomed a: b would be a squashed bar; the group still takes b's lower half, side by side.
    expect(insertGroup(t, 'b', 'b', ['g1', 'g2'], board, { ...o, zoomed: 'a' })).toEqual(insertGroup(t, 'b', 'b', ['g1', 'g2'], board, o))
  })

  it('collapsed siblings count; a moved collapsed first id does not', () => {
    // a over b, b collapsed: right of a is 500 x 590 (tall: stacked); expanded b, 500 x 300 (wide).
    const t = insert(leaf('a'), 'a', 'b', 'b')
    const bar = insertGroup(t, 'a', 'r', ['g1', 'g2'], board, { ...o, collapsed: new Set(['b']) }) as any
    expect(bar.children[0].children[1]).toMatchObject({ dir: 'col' })
    const open = insertGroup(t, 'a', 'r', ['g1', 'g2'], board, o) as any
    expect(open.children[0]).toMatchObject({ dir: 'row' })
    expect(leaves(open.children[0])).toEqual(['a', 'g1', 'g2'])
    // g1 collapsed where it was (under a): measured expanded at its new place (500 x 300 on a
    // 1000 x 300 board: side by side), not as a 10 px strip (stacked).
    const wide = { x: 0, y: 0, w: 1000, h: 300 }
    const moved = insertGroup(insert(leaf('a'), 'a', 'b', 'g1'), 'a', 'r', ['g1', 'g2'], wide, { ...o, collapsed: new Set(['g1']) })
    expect(moved).toMatchObject({ dir: 'row' })
    expect(leaves(moved)).toEqual(['a', 'g1', 'g2'])
  })
})
