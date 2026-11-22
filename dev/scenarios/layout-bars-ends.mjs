// Side bar ends: against the title strip or the window (borderless), level with the board: the first component's top on the board's top edge, the last one's bottom on its bottom edge (a slotted tile's outer box); against a top / bottom bar (a junction divider on the board's edge row), the end component clears the divider by the bar's item gap (--slot-gap); every component first and last (tabs: the brand / `+`, shelf, templates), narrow and list forms, empty and filled shelf, left and right bars.
const E = () => ({ start: [], end: [] })
const layout = (patch) => ({ top: E(), bottom: E(), left: E(), right: E(), ...patch })

// Layouts per side bar `s` (the components the side bar doesn't hold go to the top / bottom bars, which
// bound it there): [label, bars, borderless].
const LAYOUTS = (s) => [
  ['all, strip', layout({ [s]: { start: ['tabs'], end: ['templates', 'shelf'] } }), false],
  ['all, borderless', layout({ [s]: { start: ['tabs'], end: ['templates', 'shelf'] } }), true],
  ['shelf first, tabs last, borderless', layout({ [s]: { start: ['shelf', 'templates'], end: ['tabs'] } }), true],
  ['shelf alone, both junctions', layout({ top: { start: ['tabs'], end: [] }, bottom: { start: [], end: ['templates'] }, [s]: { start: [], end: ['shelf'] } }), false],
  ['templates alone, both junctions', layout({ top: { start: ['shelf'], end: [] }, bottom: { start: ['tabs'], end: [] }, [s]: { start: ['templates'], end: [] } }), false],
  ['top junction: tabs | shelf', layout({ top: { start: [], end: ['templates'] }, [s]: { start: ['tabs'], end: ['shelf'] } }), true],
  ['bottom junction: shelf | templates', layout({ bottom: { start: ['tabs'], end: [] }, [s]: { start: ['shelf'], end: ['templates'] } }), false],
  ['bottom junction: templates | tabs, borderless', layout({ bottom: { start: ['shelf'], end: [] }, [s]: { start: ['templates'], end: ['tabs'] } }), true],
]

export default async (ctx, h) => {
  const page = ctx.page
  const gap = parseFloat(await h.cssVar(ctx, '--slot-gap'))
  h.assert(gap === 2, `--slot-gap 2 px (${gap})`)
  const used = (bars, b) => bars[b].start.length + bars[b].end.length > 0
  const near = (a, b, what, d = 0.5) => h.assert(Math.abs(a - b) <= d, `${what}: ${a} vs ${b}`)
  // The side bar's start group's first shown box (its top) and end group's last (its bottom); null
  // for an empty group (the bar space is there).
  const ends = (side) =>
    page.evaluate((side) => {
      const shown = (g) => [...document.querySelectorAll(`#bar-${side} > .group.${g} > *`)].filter((e) => getComputedStyle(e).display !== 'none')
      const [first] = shown('start')
      const last = shown('end').at(-1)
      const tile = document.querySelector('.tile').getBoundingClientRect()
      return { first: first?.id, top: first?.getBoundingClientRect().top, last: last?.id, bottom: last?.getBoundingClientRect().bottom, tile: { top: tile.top, bottom: tile.bottom } }
    }, side)

  for (const shelf of ['empty', 'filled']) {
    if (shelf === 'filled') for (let i = 0; i < 2; i++) await ctx.tie('add', 'terminal', '--shelved', '--title', `item ${i}`)
    for (const side of ['left', 'right']) {
      for (const [label, bars, borderless] of LAYOUTS(side)) {
        await h.setBars(ctx, bars, { borderless })
        for (const px of [48, 160]) {
          await h.setBarSize(ctx, side, px)
          await h.settle(ctx)
          const what = `${side} ${px}, ${label}, shelf ${shelf}`
          const { board } = await h.list(ctx)
          const e = await ends(side)
          near(e.tile.top, board.y, `${what}: the tile's outer box is the board (top)`)
          near(e.tile.bottom, board.y + board.h, `${what}: the tile's outer box is the board (bottom)`)
          // A junction: the divider is the board edge's row (1 px), then the gap.
          const top = used(bars, 'top') ? 1 + gap : 0
          const bottom = used(bars, 'bottom') ? 1 + gap : 0
          const at = (n) => (n ? `clears the junction divider by ${gap} px` : `level with the board's edge`)
          if (e.first) near(e.top, board.y + top, `${what}: first (${e.first}) starts ${at(top)} (top)`)
          if (e.last) near(e.bottom, board.y + board.h - bottom, `${what}: last (${e.last}) ends ${at(bottom)} (bottom)`)
          h.assert(e.first || e.last, `${what}: a component at an end`)
        }
        if (shelf === 'empty' && side === 'right') await ctx.shot(label.replace(/[^a-z]+/g, '-'))
      }
      await h.setBarSize(ctx, side, null)
    }
  }
}
