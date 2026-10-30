// Drop on a tile's center zone (25% rectangle) = swap: slot ↔ slot (sizes kept), shelf item ↔ slot, float ↔ slot, onto a collapsed tile
// (anywhere); own tile: nothing. Title bar: no swap, the top band (split above).
export default async (ctx, h) => {
  const leafIds = (n) => (!n ? [] : n.type === 'leaf' ? [n.id] : n.children.flatMap(leafIds))
  const state = () => ctx.tie('state')
  const shown = (sel) => ctx.page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (getComputedStyle(el).display === 'none') return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }, sel)
  const near = (p, r) => p && Math.abs(p.x - r.x) < 2 && Math.abs(p.y - r.y) < 2 && Math.abs(p.w - r.w) < 2 && Math.abs(p.h - r.h) < 2

  const [a, b, c] = await h.threeWaySplit(ctx) // a | b over c
  let s = await state()
  const sizes = JSON.stringify(s.tree.sizes)
  const ra = await h.rectOf(ctx, a)
  const rc = await h.rectOf(ctx, c)

  const center = (id) => h.sidePoint(ctx, id, 'c')

  // Own tile (its center): no target.
  const pa = await h.titlePoint(ctx, a)
  await h.drag(ctx, pa, await center(a), {
    during: async () => h.assert(!(await shown('#preview')), 'own tile: no preview'),
  })
  h.assert(leafIds((await state()).tree).join() === [a, b, c].join(), 'own tile: unchanged')

  // Slot ↔ slot: a onto c's center. Preview: c's rect, and a's own (second rect).
  await h.drag(ctx, pa, await center(c), {
    during: async () => {
      h.assert(near(await shown('#preview'), rc), 'preview: target rect')
      h.assert(near(await shown('#preview2'), ra), 'preview2: source rect')
      await ctx.shot('swap-preview')
    },
  })
  h.assert(!(await shown('#preview')) && !(await shown('#preview2')), 'previews cleared')
  s = await state()
  h.assert(leafIds(s.tree).join() === [c, b, a].join(), `slot swap: c | b over a (got ${leafIds(s.tree)})`)
  h.assert(JSON.stringify(s.tree.sizes) === sizes && s.active === a, 'sizes kept, a active')
  h.assert(near(await h.rectOf(ctx, a), rc) && near(await h.rectOf(ctx, c), ra), 'rects exchanged')
  await h.assertPtySizes(ctx)
  await ctx.shot('swapped')

  // Shelf item ↔ slot: d onto b's center; b shelved at d's index.
  await ctx.tie('add', 'terminal', '--shelved')
  const d = (await ctx.tie('add', 'terminal', '--shelved')).id
  await ctx.sleep(300)
  const idx = (await state()).shelf.indexOf(d)
  await ctx.page.mouse.move(400, 400)
  await h.drag(ctx, await h.shelfItem(ctx, d), await center(b), {
    during: async () => {
      h.assert(!!(await shown('#preview')) && !(await shown('#preview2')), 'shelf source: target preview only')
    },
  })
  s = await state()
  h.assert(leafIds(s.tree).join() === [c, d, a].join(), `shelf swap: d in b's slot (got ${leafIds(s.tree)})`)
  h.assert(s.shelf.indexOf(b) === idx && !s.shelf.includes(d), `b shelved at d's index ${idx} (${s.shelf})`)
  h.assert(s.active === d, 'd active')
  await h.assertPtySizes(ctx)

  // Float ↔ slot: f onto c's center; c floats with f's rect.
  const f = (await ctx.tie('add', 'terminal', '--float')).id
  await ctx.sleep(400)
  const fr = (await state()).floats.find((x) => x.id === f)
  await h.drag(ctx, await h.titlePoint(ctx, f), await center(c))
  s = await state()
  const cf = s.floats.find((x) => x.id === c)
  h.assert(leafIds(s.tree).join() === [f, d, a].join(), `float swap: f in c's slot (got ${leafIds(s.tree)})`)
  h.assert(cf && cf.x === fr.x && cf.y === fr.y && cf.w === fr.w && cf.h === fr.h, 'c floats with f\'s rect')
  h.assert(s.active === f, 'f active')
  await h.assertPtySizes(ctx)

  // Onto a collapsed tile (all title bar): swap with it, anywhere on it (here near its end, outside
  // the center zone).
  await h.clickButton(ctx, a, 'collapse')
  h.assert((await state()).collapsed.includes(a), 'a collapsed')
  const ra2 = await h.rectOf(ctx, a)
  await h.drag(ctx, await h.titlePoint(ctx, f), { x: ra2.x + ra2.w / 2, y: ra2.y + ra2.h * 0.9 }, {
    during: async () => h.assert(near(await shown('#preview'), ra2), 'collapsed target: swap preview'),
  })
  s = await state()
  h.assert(leafIds(s.tree).join() === [a, d, f].join(), `collapsed target: swapped (got ${leafIds(s.tree)})`)
  await h.assertPtySizes(ctx)

  // Shift held: a float drop, even over a center.
  await h.drag(ctx, await h.titlePoint(ctx, d), await center(f), { shift: true })
  s = await state()
  h.assert(s.floats.some((x) => x.id === d) && leafIds(s.tree).join() === [a, f].join(), 'shift: floated, not swapped')

  // Onto a title bar: no swap, the top band: d split above f.
  const rf = await h.rectOf(ctx, f)
  await h.drag(ctx, await h.titlePoint(ctx, d), { x: rf.x + rf.w / 2, y: rf.y + 12 })
  s = await state()
  h.assert(leafIds(s.tree).join() === [a, d, f].join() && !s.floats.some((x) => x.id === d), `title bar: d split above f (got ${leafIds(s.tree)})`)
  await ctx.shot('after')

  // Center zone boundary (25% of width and height): just inside swaps, just outside splits.
  let rf2 = await h.rectOf(ctx, f)
  await h.drag(ctx, await h.titlePoint(ctx, d), { x: rf2.x + rf2.w * 0.39, y: rf2.y + rf2.h / 2 }, {
    during: async () => h.assert(near(await shown('#preview'), rf2) && !!(await shown('#preview2')), 'inside center: swap preview'),
  })
  s = await state()
  h.assert(leafIds(s.tree).join() === [a, f, d].join(), `inside center: swapped (got ${leafIds(s.tree)})`)
  rf2 = await h.rectOf(ctx, d) // d now sits below f
  await h.drag(ctx, await h.titlePoint(ctx, f), { x: rf2.x + rf2.w * 0.36, y: rf2.y + rf2.h / 2 }, {
    during: async () => {
      const p = await shown('#preview')
      h.assert(p && p.w < rf2.w * 0.6 && !(await shown('#preview2')), `outside center: split preview (${JSON.stringify(p)})`)
    },
  })
  const [rF, rD] = [await h.rectOf(ctx, f), await h.rectOf(ctx, d)]
  h.assert(rF.x < rD.x && Math.abs(rF.y - rD.y) < 2, `outside center: f split left of d (${JSON.stringify([rF, rD])})`)
}
