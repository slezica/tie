// Shelf ghost slots and the empty shelf, per form (bottom 32 / 40 / 60, top start group, left list 160, left narrow 48 / 73): a ghost has a real item's box (size, radius, icon, title in the list form) and nothing moves at the drop: a board tile, an item reordered, a template, a group (each tile's own title); the empty shelf: one slot / item long (= the shelf holding one), every bar; the "+" hint fills it at rest, muted (every form); the "+" hint (accent) fills it during a drag, the ghost at the end the first item lands at.
const E = () => ({ start: [], end: [] })
const layout = (patch) => ({ top: E(), bottom: E(), left: E(), right: E(), ...patch })
const GAP = 2 // --slot-gap

const FORMS = [
  { name: 'bottom-40', bar: 'bottom', size: 40, bars: layout({ bottom: { start: ['tabs'], end: ['shelf', 'templates'] } }) },
  { name: 'bottom-32', bar: 'bottom', size: 32, bars: layout({ bottom: { start: ['tabs'], end: ['shelf', 'templates'] } }) },
  { name: 'bottom-60', bar: 'bottom', size: 60, bars: layout({ bottom: { start: ['tabs'], end: ['shelf', 'templates'] } }) },
  { name: 'top-start', bar: 'top', size: 40, bars: layout({ top: { start: ['shelf', 'templates'], end: [] }, bottom: { start: ['tabs'], end: [] } }) },
  { name: 'left-list', bar: 'left', size: 160, bars: layout({ left: { start: [], end: ['shelf', 'templates'] }, bottom: { start: ['tabs'], end: [] } }) },
  { name: 'left-48', bar: 'left', size: 48, bars: layout({ left: { start: [], end: ['shelf', 'templates'] }, bottom: { start: ['tabs'], end: [] } }) },
  { name: 'left-73', bar: 'left', size: 73, bars: layout({ left: { start: [], end: ['shelf', 'templates'] }, bottom: { start: ['tabs'], end: [] } }) },
]

export default async (ctx, h) => {
  const page = ctx.page
  const m = page.mouse
  const L = () => h.list(ctx)
  const a = (await L()).tiles[0].id
  const near = (x, y, what, d = 0.5) => h.assert(Math.abs(x - y) <= d, `${what}: ${x} vs ${y}`)
  const away = async () => {
    const { board } = await L()
    await m.move(board.x + board.w / 2, board.y + board.h / 2, { steps: 4 })
    await h.waitRevealed(ctx, null)
    await h.settle(ctx)
  }

  // Items' looks (every match of `sel`, in order): box, radius, icon box, glyph box, title (when
  // shown: the list form).
  const looks = (sel) =>
    page.$$eval(sel, (els) =>
      els.map((e) => {
        const r = (x) => x.getBoundingClientRect().toJSON()
        const l = e.querySelector('.lbl')
        const shown = getComputedStyle(l).display !== 'none'
        return { r: r(e), radius: getComputedStyle(e).borderRadius, ico: r(e.querySelector('.ico')), svg: r(e.querySelector('svg')), lbl: shown ? { text: l.textContent, r: r(l) } : null }
      }),
    )
  const look = async (sel) => (await looks(sel))[0]
  const sameBox = (p, q, what) => ['x', 'y', 'width', 'height'].forEach((k) => near(p[k], q[k], `${what} ${k}`))
  // Ghost vs the item after the drop: same box, radius, icon and glyph place; title shown alike
  // (`text`: the same title too, and its box).
  const sameLook = (g, it, what, text = true) => {
    sameBox(g.r, it.r, `${what}: box`)
    h.assert(g.radius === it.radius, `${what}: radius ${g.radius} vs ${it.radius}`)
    sameBox(g.ico, it.ico, `${what}: icon`)
    sameBox(g.svg, it.svg, `${what}: glyph`)
    h.assert(!!g.lbl === !!it.lbl, `${what}: title shown alike (${!!g.lbl}, ${!!it.lbl})`)
    if (g.lbl && text) {
      h.assert(g.lbl.text === it.lbl.text, `${what}: title ${g.lbl.text} vs ${it.lbl.text}`)
      sameBox(g.lbl.r, it.lbl.r, `${what}: title`)
    }
  }
  const ghosts = () => page.$$eval('#shelf > .item.ghost', (els) => els.length)
  const ghostLooks = () => looks('#shelf > .item.ghost')
  // Drag from `from` over the board, then to visual slot `k` of the strip (along its axis; pitch from
  // a shown item); `during` with the ghosts' looks, then released.
  const dragToSlot = async (from, k, during, v) => {
    await m.move(from.x, from.y)
    await m.down()
    const { board } = await L()
    await m.move(board.x + board.w / 2, board.y + board.h / 2, { steps: 6 })
    await h.settle(ctx)
    const sb = (await h.boxOf(ctx, '#shelf')).box
    const one = await page.$('#shelf > .item:not(.drag-source)')
    const pitch = one ? (await one.evaluate((e, v) => (v ? e.offsetHeight : e.offsetWidth), v)) + GAP : 0
    const at = one ? k * pitch + pitch / 2 : 4
    await m.move(v ? sb.x + sb.width / 2 : sb.x + at, v ? sb.y + at : sb.y + sb.height / 2, { steps: 8 })
    await h.eventually(ctx, async () => h.assert((await ghosts()) > 0, 'ghost shown'))
    await h.settle(ctx)
    await during(await ghostLooks())
    await m.up()
    await h.settle(ctx)
  }
  const fresh = async (titles) => {
    for (const t of (await L()).tiles.filter((t) => t.id !== a)) await ctx.tie('close', '--tile', t.id)
    await h.waitFor(ctx, async () => (await L()).tiles.length === 1, 'only a left')
    const ids = []
    for (const t of titles) ids.push((await ctx.tie('add', 'terminal', '--shelved', '--title', t)).id)
    const b = (await ctx.tie('add', 'terminal', '--at', a, '--side', 'r', '--title', 'board b')).id
    await h.waitShell(ctx, b)
    await away()
    return { ids, b }
  }

  let applied = JSON.stringify(layout({ bottom: { start: ['tabs'], end: ['shelf', 'templates'] } })) // the default
  for (const f of FORMS) {
    if (JSON.stringify(f.bars) !== applied) await h.setBars(ctx, f.bars) // an unchanged file raises no banner
    applied = JSON.stringify(f.bars)
    await h.setBarSize(ctx, f.bar, f.size)
    const v = f.bar === 'left' || f.bar === 'right'
    const list = f.name === 'left-list'
    const { ids: [one, two], b } = await fresh(['one', 'two'])

    // A board tile onto slot 1: the ghost is the item to be (its title in the list form).
    let g
    await dragToSlot(await h.titlePoint(ctx, b), 1, async ([x]) => {
      g = x
      if (list) h.assert(g.lbl?.text === 'board b', `${f.name}: ghost titled (${g.lbl?.text})`)
      await ctx.shot(`${f.name}-tile-ghost`)
    }, v)
    h.assert((await L()).shelf.join() === [one, b, two].join(), `${f.name}: b at slot 1`)
    sameLook(g, await look(`.item[data-id="${b}"]`), `${f.name}: tile`)

    // An item reordered to the end: its ghost shows it (the source hidden), lands in place.
    await dragToSlot(await h.shelfItem(ctx, one), 2, async ([x]) => {
      g = x
      if (list) h.assert(g.lbl?.text === 'one', `${f.name}: reorder ghost titled (${g.lbl?.text})`)
    }, v)
    h.assert((await L()).shelf.join() === [b, two, one].join(), `${f.name}: one moved to the end`)
    sameLook(g, await look(`.item[data-id="${one}"]`), `${f.name}: reorder`)

    // A template onto slot 0: its glyph and label; the new tile's item takes the same box.
    await dragToSlot(await h.template(ctx), 0, async ([x]) => {
      g = x
      if (list) h.assert(g.lbl?.text === 'terminal', `${f.name}: template ghost labelled (${g.lbl?.text})`)
      await ctx.shot(`${f.name}-template-ghost`)
    }, v)
    const t = await h.waitFor(ctx, async () => { const l = await L(); return l.shelf.length === 4 && l.shelf[0] }, 'template shelved at slot 0')
    sameLook(g, await look(`.item[data-id="${t}"]`), `${f.name}: template`, false)
    await away()

    // A group (two and one) to the strip's start: a ghost per tile, its own title; both in place.
    await h.selectShelf(ctx, two, one)
    let gs
    await dragToSlot(await h.shelfItem(ctx, two), 0, async (x) => {
      gs = x
      h.assert(gs.length === 2, `${f.name}: two ghosts`)
      if (list) h.assert(gs.map((x) => x.lbl?.text).join() === 'two,one', `${f.name}: group ghosts titled (${gs.map((x) => x.lbl?.text)})`)
      await ctx.shot(`${f.name}-group-ghosts`)
    }, v)
    h.assert((await L()).shelf.slice(0, 2).join() === [two, one].join(), `${f.name}: group at the start`)
    sameLook(gs[0], await look(`.item[data-id="${two}"]`), `${f.name}: group first`)
    sameLook(gs[1], await look(`.item[data-id="${one}"]`), `${f.name}: group second`)
    await away()

    // The empty shelf: one slot long along the bar (feel round 6; vertical: one item). Every form: the
    // "+" hint fills it at rest, muted (not the accent).
    for (const s of (await L()).shelf.filter((s) => s !== b)) await ctx.tie('close', '--tile', s)
    await ctx.tie('move', '--tile', b, '--at', a, '--side', 'r')
    await h.waitFor(ctx, async () => !(await L()).shelf.length, 'shelf empty')
    await away()
    await h.settle(ctx)
    const item = await page.$eval('#templates .template', (e, v) => e.getBoundingClientRect()[v ? 'height' : 'width'], v) // a template: an item's size here
    const slot = list ? 28 : item
    const strip = () => page.$eval('#shelf', (e) => {
      const cs = getComputedStyle(e)
      const hint = getComputedStyle(e, '::before')
      const probe = document.createElement('div')
      probe.style.color = 'var(--accent)'
      document.body.append(probe)
      const accent = getComputedStyle(probe).color
      probe.remove()
      return { r: e.getBoundingClientRect().toJSON(), bg: cs.backgroundColor, border: cs.borderTopWidth, accent, hint: { display: hint.display, w: parseFloat(hint.width), h: parseFloat(hint.height), color: hint.color, line: hint.borderTopColor } }
    })
    const rest = await strip()
    h.assert(rest.bg === 'rgba(0, 0, 0, 0)' && rest.border === '0px', `${f.name}: empty shelf: no fill, no border of its own (${JSON.stringify(rest)})`)
    if (v) {
      near(rest.r.height, slot, `${f.name}: empty shelf one item long`)
      near(rest.hint.h, slot, `${f.name}: "+" one item tall`)
    } else {
      near(rest.r.width, slot, `${f.name}: empty shelf one slot long`)
      near(rest.hint.w, rest.r.width, `${f.name}: "+" fills the empty shelf at rest`)
      near(rest.hint.h, slot, `${f.name}: "+" one slot tall`)
    }
    h.assert(rest.hint.display === 'grid', `${f.name}: "+" shown at rest`)
    h.assert(rest.hint.color !== rest.accent && rest.hint.line !== rest.accent, `${f.name}: "+" muted at rest (${rest.hint.color}, ${rest.hint.line} vs ${rest.accent})`)
    await ctx.shot(`${f.name}-empty-rest`)
    // A drag: the "+" hint fills it; over it, the ghost at the end the first item lands at (an end
    // group: the strip's end), the strip's size held; after the drop, the item there.
    const from = await h.titlePoint(ctx, b)
    await m.move(from.x, from.y)
    await m.down()
    const { board } = await L()
    await m.move(board.x + board.w / 2, board.y + board.h / 2, { steps: 6 })
    await h.settle(ctx)
    const hinted = await strip()
    h.assert(hinted.hint.display === 'grid', `${f.name}: hint during a drag`)
    h.assert(hinted.hint.color === hinted.accent && hinted.hint.line === hinted.accent, `${f.name}: hint in the accent during a drag (${hinted.hint.color} vs ${hinted.accent})`)
    sameBox(hinted.r, rest.r, `${f.name}: empty shelf: same box at rest and during a drag`)
    near(v ? hinted.hint.h : hinted.hint.w, v ? hinted.r.height : hinted.r.width, `${f.name}: the hint fills the empty shelf`)
    await ctx.shot(`${f.name}-empty-hint`)
    const sb = hinted.r
    await m.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 6 })
    await h.eventually(ctx, async () => h.assert((await ghosts()) === 1, 'ghost on the empty shelf'))
    await h.settle(ctx)
    const landing = await strip()
    sameBox(landing.r, sb, `${f.name}: empty shelf keeps its size under the ghost`)
    ;[g] = await ghostLooks()
    const end = f.bars[f.bar].end.includes('shelf')
    if (v) near(end ? g.r.bottom : g.r.top, end ? sb.bottom : sb.top, `${f.name}: ghost at the strip's ${end ? 'end' : 'start'}`)
    else near(end ? g.r.right : g.r.left, end ? sb.right : sb.left, `${f.name}: ghost at the strip's ${end ? 'end' : 'start'}`)
    await ctx.shot(`${f.name}-empty-ghost`)
    await m.up()
    await h.waitFor(ctx, async () => (await L()).shelf.join() === b, 'b shelved')
    await h.settle(ctx)
    sameLook(g, await look(`.item[data-id="${b}"]`), `${f.name}: first item`)
    near(v ? (await strip()).r.height : (await strip()).r.width, v ? rest.r.height : rest.r.width, `${f.name}: one item: as long as the empty shelf`)
    await h.setBarSize(ctx, f.bar, null)
  }
  await h.assertPtySizes(ctx)
}
