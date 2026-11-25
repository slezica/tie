// Edit layout mode, the drop preview among the other components (feel round 6): wherever a dragged
// component would land (first or last of a group, between two, a start or end group, horizontal and
// side bars, a reorder within its own group), the others of that list make room (shifted, their boxes
// with them), the box overlaps none of them and stays in its bar; reordered in its own list, the
// dragged component's content and label hide (the others close over its place); after the drop the
// component sits where the box was and the others where they were shown.
const E = () => ({ start: [], end: [] })
const layout = (patch) => ({ top: E(), bottom: E(), left: E(), right: E(), ...patch })
const COMPONENTS = ['tabs', 'shelf', 'templates']

export default async (ctx, h) => {
  const page = ctx.page
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  // Two shelved tiles: the shelf has a length of its own.
  for (let i = 0; i < 2; i++) await h.waitTile(ctx, (await ctx.tie('add', 'terminal', '--shelved')).id)

  // As drawn: the box, each component's box (the mode's outline: moves with its component), each
  // component's own elements (tabs: with the brand), each bar.
  const snap = () =>
    page.evaluate((cs) => {
      const r = (e) => e.getBoundingClientRect().toJSON()
      const union = (rs) => {
        rs = rs.filter((x) => x.width > 0 && x.height > 0)
        const left = Math.min(...rs.map((x) => x.left))
        const top = Math.min(...rs.map((x) => x.top))
        const right = Math.max(...rs.map((x) => x.right))
        const bottom = Math.max(...rs.map((x) => x.bottom))
        return { left, top, right, bottom, width: right - left, height: bottom - top }
      }
      return {
        box: r(document.querySelector('#layout-edit .le-preview')),
        comps: Object.fromEntries(cs.map((c) => [c, r(document.querySelector(`#layout-edit .le-comp[data-c="${c}"]`))])),
        els: Object.fromEntries(cs.map((c) => [c, union((c === 'tabs' ? ['brand', 'tabs'] : [c]).map((id) => r(document.getElementById(id))))])),
        bars: Object.fromEntries(['top', 'bottom', 'left', 'right'].map((b) => [b, r(document.querySelector(`#layout-edit .le-bar[data-bar="${b}"]`))])),
      }
    }, COMPONENTS)
  const overlap = (p, q) => p.left < q.right - 0.5 && q.left < p.right - 0.5 && p.top < q.bottom - 0.5 && q.top < p.bottom - 0.5
  const seen = (c) => page.evaluate((c) => [document.getElementById(c), document.querySelector(`#layout-edit .le-label[data-c="${c}"]`)].map((e) => getComputedStyle(e).visibility).join(), c)
  const near = (a, b, what, d = 2) => h.assert(Math.abs(a - b) <= d, `${what}: ${a} vs ${b}`)

  // `c` dragged onto `bar` / `gravity` / `index` from `bars`; `expect`: that list after the drop.
  const check = async (name, bars, c, bar, gravity, index, expect) => {
    if (!same(await h.mountedBars(ctx), bars)) await h.setBars(ctx, bars) // else the file holds it already (no change on disk)
    await h.editLayout(ctx)
    const v = bar === 'left' || bar === 'right'
    const [lo, hi] = v ? ['top', 'bottom'] : ['left', 'right']
    const others = [...bars[bar].start, ...bars[bar].end].filter((o) => o !== c)
    let shown
    await h.dragComponent(ctx, c, bar, gravity, {
      index,
      during: async () => {
        shown = await snap() // settled: the box and the shifts done animating (drag())
        const b = shown.bars[bar]
        h.assert(shown.box.width > 0 && shown.box[lo] >= b[lo] - 0.5 && shown.box[hi] <= b[hi] + 0.5, `${name}: box in the bar: ${JSON.stringify(shown.box)} in ${JSON.stringify(b)}`)
        for (const o of others) {
          h.assert(!overlap(shown.box, shown.comps[o]), `${name}: box clear of ${o}: ${JSON.stringify(shown.box)} vs ${JSON.stringify(shown.comps[o])}`)
          near(shown.comps[o][lo], shown.els[o][lo], `${name}: ${o}'s outline moves with it`, 1)
        }
        for (const [i, o] of others.entries()) for (const k of others.slice(i + 1)) h.assert(!overlap(shown.comps[o], shown.comps[k]), `${name}: ${o} clear of ${k}`)
        // Its own list: the dragged component's content and label hidden (the others close over its place).
        const own = bars[bar][gravity].includes(c)
        h.assert((await seen(c)) === (own ? 'hidden,hidden' : 'visible,visible'), `${name}: dragged ${c} (own list ${own}): content, label ${await seen(c)}`)
        await ctx.shot(name)
      },
    })
    const m = await h.mountedBars(ctx)
    h.assert(same(m[bar][gravity], expect), `${name}: ${bar} ${gravity} after the drop: ${JSON.stringify(m[bar][gravity])}`)
    const after = await snap()
    h.assert((await seen(c)) === 'visible,visible', `${name}: ${c} shown after the drop`)
    near(after.comps[c][lo], shown.box[lo], `${name}: ${c} where the box was (${lo})`)
    near(after.comps[c][hi], shown.box[hi], `${name}: ${c} where the box was (${hi})`)
    for (const o of others) near(after.comps[o][lo], shown.comps[o][lo], `${name}: ${o} where it was shown`)
    await page.locator('#layout-edit .le-cancel').click()
    await page.keyboard.press('Escape')
    await page.waitForSelector('.settings', { state: 'detached' })
  }

  // The author's case (bottom end: templates at the far right): the shelf from the top bar after it
  // (the far right; templates make room) and before it.
  const endOne = layout({ top: { start: ['shelf'], end: [] }, bottom: { start: ['tabs'], end: ['templates'] } })
  await check('end-last', endOne, 'shelf', 'bottom', 'end', 1, ['templates', 'shelf'])
  await check('end-first', endOne, 'shelf', 'bottom', 'end', 0, ['shelf', 'templates'])
  // Start group, first (tabs make room) and last.
  const startOne = layout({ top: { start: [], end: ['shelf'] }, bottom: { start: ['tabs'], end: ['templates'] } })
  await check('start-first', startOne, 'shelf', 'bottom', 'start', 0, ['shelf', 'tabs'])
  await check('start-last', startOne, 'shelf', 'bottom', 'start', 1, ['tabs', 'shelf'])
  // Two others: first, between, last (an end group).
  const endTwo = layout({ top: { start: ['shelf'], end: [] }, bottom: { start: [], end: ['tabs', 'templates'] } })
  for (const [i, expect] of [['shelf', 'tabs', 'templates'], ['tabs', 'shelf', 'templates'], ['tabs', 'templates', 'shelf']].entries())
    await check(`end-two-${i}`, endTwo, 'shelf', 'bottom', 'end', i, expect)
  // Side bars: the shelf from the right bar to the left bar's start (first) and end (last).
  const sides = layout({ bottom: { start: ['tabs'], end: [] }, left: { start: ['templates'], end: [] }, right: { start: ['shelf'], end: [] } })
  await check('left-start-first', sides, 'shelf', 'left', 'start', 0, ['shelf', 'templates'])
  const sidesEnd = layout({ bottom: { start: ['tabs'], end: [] }, left: { start: [], end: ['templates'] }, right: { start: ['shelf'], end: [] } })
  await check('left-end-last', sidesEnd, 'shelf', 'left', 'end', 1, ['templates', 'shelf'])
  // Within its own group: the default layout's end group reordered (shelf last), the top bar's
  // start group (templates first).
  await check('own-end', layout({ bottom: { start: ['tabs'], end: ['shelf', 'templates'] } }), 'shelf', 'bottom', 'end', 1, ['templates', 'shelf'])
  await check('own-start', layout({ top: { start: ['tabs', 'shelf', 'templates'], end: [] } }), 'templates', 'top', 'start', 0, ['templates', 'tabs', 'shelf'])
}
