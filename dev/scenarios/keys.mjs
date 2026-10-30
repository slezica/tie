// Keyboard: cmd+D / cmd+shift+D split the active tile; cmd+O / cmd+shift+O open a file (picker) beside it; cmd+arrows move focus (incl. floats); press-and-hold off.
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
  await ctx.tie('focus', '--tile', a)
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

  // cmd+O / cmd+shift+O: the file template (picker) beside the active tile; cancel = nothing.
  const md = `${process.cwd()}/dev/samples/markdown.md`
  const count = async () => (await h.list(ctx)).tiles.length
  const opened = (msg) => h.waitFor(ctx, async () => { const l = await h.list(ctx); return l.tiles.find((t) => t.id === l.active && t.kind === 'markdown' && !seen.has(t.id)) }, msg)
  const seen = new Set()
  await ctx.tie('close', '--tile', f)
  await ctx.tie('focus', '--tile', a)
  await h.waitActive(ctx, a)
  await h.pickNext(ctx, md)
  await k('Meta+o')
  const m1 = (await opened('cmd+O: markdown tile active')).id
  seen.add(m1)
  s = await ctx.tie('state')
  h.assert(s.tree.dir === 'row' && s.tree.children[0].id === a && s.tree.children[1].id === m1, 'cmd+O: right of the active tile')
  await h.pickNext(ctx, md)
  await k('Meta+Shift+o')
  const m2 = (await opened('cmd+shift+O: markdown tile active')).id
  s = await ctx.tie('state')
  const col = s.tree.children[1]
  h.assert(col.dir === 'col' && col.children.map((x) => x.id).join() === [m1, m2].join(), 'cmd+shift+O: below the active tile')
  const cancels = () => ctx.appLog().split('picker (harness) cancel').length
  const n0 = await count()
  const c0 = cancels()
  await h.pickNext(ctx, null)
  await k('Meta+o')
  await h.waitFor(ctx, async () => cancels() > c0, 'picker cancelled')
  await h.settle(ctx)
  h.assert((await count()) === n0 && (await h.list(ctx)).active === m2, 'cancel: no tile')
  // Empty board: the picked file as the root tile.
  for (const t of (await h.list(ctx)).tiles) await ctx.tie('close', '--tile', t.id)
  await h.waitFor(ctx, async () => (await count()) === 0, 'board empty')
  await h.pickNext(ctx, md)
  await k('Meta+o')
  const r = (await h.waitFor(ctx, async () => { const l = await h.list(ctx); return l.tiles.length === 1 && l.tiles[0].kind === 'markdown' && l.tiles[0] }, 'empty board: markdown root tile')).id
  s = await ctx.tie('state')
  h.assert(s.tree && s.tree.id === r, 'empty board: root slot')
  await ctx.shot('file-keys')
}
