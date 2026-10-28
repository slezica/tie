// Drop on a title bar = swap: slot ↔ slot (sizes kept), shelf item ↔ slot, float ↔ slot, onto a collapsed tile; own title bar: nothing.
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

  // Own title bar: no target.
  const pa = await h.titlePoint(ctx, a)
  await h.drag(ctx, pa, { x: pa.x + 60, y: pa.y }, {
    during: async () => h.assert(!(await shown('#preview')), 'own title bar: no preview'),
  })
  h.assert(leafIds((await state()).tree).join() === [a, b, c].join(), 'own title bar: unchanged')

  // Slot ↔ slot: a onto c's title bar. Preview: c's rect, and a's own (second rect).
  await h.drag(ctx, pa, await h.titlePoint(ctx, c), {
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

  // Shelf item ↔ slot: d onto b's title bar; b shelved at d's index.
  await ctx.tie('open', 'terminal', '--shelved')
  const d = (await ctx.tie('open', 'terminal', '--shelved')).id
  await ctx.sleep(300)
  const idx = (await state()).shelf.indexOf(d)
  await ctx.page.mouse.move(400, 400)
  await h.drag(ctx, await h.shelfItem(ctx, d), await h.titlePoint(ctx, b), {
    during: async () => {
      h.assert(!!(await shown('#preview')) && !(await shown('#preview2')), 'shelf source: target preview only')
    },
  })
  s = await state()
  h.assert(leafIds(s.tree).join() === [c, d, a].join(), `shelf swap: d in b's slot (got ${leafIds(s.tree)})`)
  h.assert(s.shelf.indexOf(b) === idx && !s.shelf.includes(d), `b shelved at d's index ${idx} (${s.shelf})`)
  h.assert(s.active === d, 'd active')
  await h.assertPtySizes(ctx)

  // Float ↔ slot: f onto c's title bar; c floats with f's rect.
  const f = (await ctx.tie('open', 'terminal', '--float')).id
  await ctx.sleep(400)
  const fr = (await state()).floats.find((x) => x.id === f)
  await h.drag(ctx, await h.titlePoint(ctx, f), await h.titlePoint(ctx, c))
  s = await state()
  const cf = s.floats.find((x) => x.id === c)
  h.assert(leafIds(s.tree).join() === [f, d, a].join(), `float swap: f in c's slot (got ${leafIds(s.tree)})`)
  h.assert(cf && cf.x === fr.x && cf.y === fr.y && cf.w === fr.w && cf.h === fr.h, 'c floats with f\'s rect')
  h.assert(s.active === f, 'f active')
  await h.assertPtySizes(ctx)

  // Onto a collapsed tile (all title bar): swap with it.
  await h.clickButton(ctx, a, 'collapse')
  h.assert((await state()).collapsed.includes(a), 'a collapsed')
  await h.drag(ctx, await h.titlePoint(ctx, f), await h.sidePoint(ctx, a, 'c'))
  s = await state()
  h.assert(leafIds(s.tree).join() === [a, d, f].join(), `collapsed target: swapped (got ${leafIds(s.tree)})`)
  await h.assertPtySizes(ctx)

  // Shift held: a float drop, even over a title bar.
  await h.drag(ctx, await h.titlePoint(ctx, d), await h.titlePoint(ctx, a), { shift: true })
  s = await state()
  h.assert(s.floats.some((x) => x.id === d) && leafIds(s.tree).join() === [a, f].join(), 'shift: floated, not swapped')

  // Below the title bar: the top-edge split still works.
  const rf = await h.rectOf(ctx, f)
  h.assert(rf.h * 0.1 > 30, 'top triangle reachable below the title bar')
  await h.drag(ctx, await h.titlePoint(ctx, d), await h.sidePoint(ctx, f, 't'))
  s = await state()
  h.assert(leafIds(s.tree).join() === [a, d, f].join() && !s.floats.some((x) => x.id === d), `top edge: d split above f (got ${leafIds(s.tree)})`)
  await ctx.shot('after')
}
