// Keyboard: cmd+D / cmd+shift+D split the active tile; cmd+arrows move focus (incl. floats); press-and-hold off.
export default async (ctx, h) => {
  const k = (chord) => h.press(ctx, chord)
  const active = async () => (await h.list(ctx)).active
  // Focus key: the expected tile ends active (same message as an assertion).
  const moves = (chord, id, msg) => k(chord).then(() => h.eventually(ctx, async () => h.assert((await active()) === id, typeof msg === 'function' ? await msg() : msg)))
  const a = await active()
  await k('Meta+d')
  const b = await h.waitFor(ctx, async () => { const x = await active(); return x !== a && x }, 'cmd+D: new tile active')
  let s = await ctx.tie('state')
  h.assert(s.tree.dir === 'row' && s.tree.children.map((n) => n.id).join() === [a, b].join(), 'cmd+D: new tile right, active')
  await k('Meta+Shift+d')
  const c = await h.waitFor(ctx, async () => { const x = await active(); return x !== b && x }, 'cmd+shift+D: new tile active')
  s = await ctx.tie('state')
  h.assert(s.tree.children[1].dir === 'col' && s.tree.children[1].children.map((n) => n.id).join() === [b, c].join(), 'cmd+shift+D: below')
  await h.eventually(ctx, () => h.assertPtySizes(ctx))
  await ctx.shot('splits')

  await moves('Meta+ArrowUp', b, 'up: c -> b')
  await moves('Meta+ArrowLeft', a, 'left: b -> a')
  await moves('Meta+ArrowRight', b, 'right from a: b and c tie, most recently used (b) wins')
  await moves('Meta+ArrowDown', c, 'down: b -> c')
  await moves('Meta+ArrowLeft', a, 'left: c -> a')
  await moves('Meta+ArrowRight', c, 'right from a now returns to c (most recent)')

  // Floats: reachable by arrows; split shortcuts don't apply.
  const f = (await ctx.tie('add', 'terminal', '--float', '--focus')).id
  await h.waitActive(ctx, f)
  const before = (await h.list(ctx)).tiles.length
  await k('Meta+d')
  await ctx.sleep(250) // absence: no split
  h.assert((await h.list(ctx)).tiles.length === before, 'cmd+D ignored on float')
  await ctx.tie('focus', a)
  await h.waitActive(ctx, a)
  await moves('Meta+ArrowRight', f, async () => `right from a reaches centered float (got ${await active()})`)

  // Shortcuts reach the app even while typing in a terminal; text fields keep their own.
  await ctx.page.evaluate(() => document.dispatchEvent(new CustomEvent('tie:settings')))
  await ctx.page.waitForSelector('.settings')
  const n = (await h.list(ctx)).tiles.length
  await k('Meta+d')
  await ctx.sleep(250) // absence: no split
  h.assert((await h.list(ctx)).tiles.length === n, 'no shortcuts while settings open')
  await ctx.page.keyboard.press('Escape')
  // macOS accent picker off, so held keys repeat (main registers the default; TERMINALS.md "Keys").
  h.assert(ctx.appLog().includes('[keys] press-and-hold "0"'), 'ApplePressAndHoldEnabled registered false')
}
