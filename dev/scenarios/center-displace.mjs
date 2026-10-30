// A new tile dropped on a tile's center zone (template drag, Finder file) takes that tile's exact
// leaf; the tile goes to the end of the shelf, just shelved (not revealed, not pinned); the new tile
// is active. Template near an edge still splits. INPUT.md "Drop targets".
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export default async (ctx, h) => {
  const leafIds = (n) => (!n ? [] : n.type === 'leaf' ? [n.id] : n.children.flatMap(leafIds))
  const state = () => ctx.tie('state')
  const near = (p, r) => p && Math.abs(p.x - r.x) < 2 && Math.abs(p.y - r.y) < 2 && Math.abs(p.w - r.w) < 2 && Math.abs(p.h - r.h) < 2
  const shown = (sel) => ctx.page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (getComputedStyle(el).display === 'none') return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }, sel)
  const dir = join(process.cwd(), 'tmp', `displace-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const md = join(dir, 'dropped.md')
  writeFileSync(md, '# Dropped\n')
  try {
    const [a, b, c] = await h.threeWaySplit(ctx) // a | b over c
    await ctx.tie('add', 'terminal', '--shelved')
    await ctx.sleep(200)
    const shelf0 = (await state()).shelf
    const rb = await h.rectOf(ctx, b)

    // Template onto b's center: preview = b's rect only.
    await h.drag(ctx, await h.template(ctx), await h.sidePoint(ctx, b, 'c'), {
      during: async () => {
        h.assert(near(await shown('#preview'), rb) && !(await shown('#preview2')), 'template at center: target rect only')
        await ctx.shot('displace-preview')
      },
    })
    const n = await h.waitFor(ctx, async () => leafIds((await state()).tree).find((id) => ![a, b, c].includes(id)), 'new tile slotted')
    let s = await state()
    h.assert(leafIds(s.tree).join() === [a, n, c].join(), `new tile in b's leaf (got ${leafIds(s.tree)})`)
    h.assert(near(await h.rectOf(ctx, n), rb), 'same rect')
    h.assert(s.shelf.join() === [...shelf0, b].join(), `b appended to the shelf (${s.shelf})`)
    h.assert(s.active === n && s.pinned === null && s.revealed === null, `new tile active, b not shown (active ${s.active}, pinned ${s.pinned}, revealed ${s.revealed})`)
    h.assert((await h.tileOf(ctx, b)).state === 'shelved', 'b shelved')
    await h.waitTermFit(ctx, n, 'displacing terminal')
    await h.assertPtySizes(ctx)
    await ctx.shot('displaced')

    // Template near an edge: still a split (nothing shelved).
    await h.spawnFromTemplate(ctx, c, 'b')
    s = await h.waitFor(ctx, async () => { const x = await state(); return leafIds(x.tree).length === 4 ? x : null }, 'edge: split')
    h.assert(s.shelf.join() === [...shelf0, b].join(), 'edge drop: shelf unchanged')

    // Finder file onto a (non-terminal) tile's center: the file's tile takes the leaf.
    const m = (await ctx.tie('add', md, '--at', a, '--side', 'b')).id
    await h.waitFor(ctx, () => h.mdState(ctx, m).then((x) => x.text.startsWith('Dropped')), 'markdown shown')
    const rm = await h.rectOf(ctx, m)
    const leaves = leafIds((await state()).tree)
    await h.osDrop(ctx, await h.sidePoint(ctx, m, 'c'), { files: [md] })
    const m2 = await h.waitFor(ctx, async () => leafIds((await state()).tree).find((id) => !leaves.includes(id)), 'file tile slotted')
    s = await state()
    h.assert(leafIds(s.tree).join() === leaves.map((id) => (id === m ? m2 : id)).join(), `file tile in m's leaf (got ${leafIds(s.tree)})`)
    h.assert(near(await h.rectOf(ctx, m2), rm) && s.shelf[s.shelf.length - 1] === m && s.active === m2, `m shelved last, file tile active (${s.shelf}, ${s.active})`)
    h.assert((await h.tileOf(ctx, m2)).kind === 'markdown', 'file tile is markdown')

    // Onto a terminal's center: the terminal still takes the drop (the path, pasted), nothing displaced.
    const before = leafIds((await state()).tree).join()
    await h.osDrop(ctx, await h.sidePoint(ctx, n, 'c'), { files: [md] })
    await ctx.sleep(300)
    h.assert(leafIds((await state()).tree).join() === before, 'terminal drop: no displace')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
