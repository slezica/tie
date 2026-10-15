// Keyboard: cmd+D / cmd+shift+D split the active tile; cmd+arrows move focus (incl. floats).
export default async (ctx, h) => {
  const k = async (chord) => {
    await h.press(ctx, chord)
    await ctx.sleep(250)
  }
  const active = async () => (await h.list(ctx)).active
  const a = await active()
  await k('Meta+d')
  let s = await ctx.tie('state')
  const b = await active()
  h.assert(s.tree.dir === 'row' && s.tree.children.map((n) => n.id).join() === [a, b].join(), 'cmd+D: new tile right, active')
  await k('Meta+Shift+d')
  s = await ctx.tie('state')
  const c = await active()
  h.assert(s.tree.children[1].dir === 'col' && s.tree.children[1].children.map((n) => n.id).join() === [b, c].join(), 'cmd+shift+D: below')
  await h.assertPtySizes(ctx)
  await ctx.shot('splits')

  await k('Meta+ArrowUp')
  h.assert((await active()) === b, 'up: c -> b')
  await k('Meta+ArrowLeft')
  h.assert((await active()) === a, 'left: b -> a')
  await k('Meta+ArrowRight')
  h.assert((await active()) === b, 'right from a: b and c tie, most recently used (b) wins')
  await k('Meta+ArrowDown')
  h.assert((await active()) === c, 'down: b -> c')
  await k('Meta+ArrowLeft')
  await k('Meta+ArrowRight')
  h.assert((await active()) === c, 'right from a now returns to c (most recent)')

  // Floats: reachable by arrows; split shortcuts don't apply.
  const f = (await ctx.tie('open', 'terminal', '--float')).id
  await ctx.sleep(300)
  const before = (await h.list(ctx)).tiles.length
  await k('Meta+d')
  h.assert((await h.list(ctx)).tiles.length === before, 'cmd+D ignored on float')
  await ctx.tie('focus', a)
  await ctx.sleep(150)
  await k('Meta+ArrowRight')
  h.assert((await active()) === f, `right from a reaches centered float (got ${await active()})`)

  // Shortcuts reach the app even while typing in a terminal; text fields keep their own.
  await ctx.page.evaluate(() => document.dispatchEvent(new CustomEvent('tie:settings')))
  await ctx.page.waitForSelector('.settings')
  const n = (await h.list(ctx)).tiles.length
  await k('Meta+d')
  h.assert((await h.list(ctx)).tiles.length === n, 'no shortcuts while settings open')
  await ctx.page.keyboard.press('Escape')
}
