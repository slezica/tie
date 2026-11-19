// Security: shortcuts live in main (before-input-event): they work while a content frame has focus,
// the page never sees their keys, and synthetic KeyboardEvents (frame or shell) trigger nothing.
// Esc and editing combos pass through. Hidden window: a click focuses the frame for real.
export const hiddenWindow = true

export default async (ctx, h) => {
  const page = ctx.page
  const count = async () => (await h.list(ctx)).tiles.length
  const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
  const p = (await ctx.tie('add', 'probe', '--at', a, '--side', 'r')).id
  const f = await h.probeFrame(ctx, p)
  const listen = `window.__keys = []; addEventListener('keydown', (e) => window.__keys.push((e.metaKey ? 'Cmd+' : '') + e.key), true)`
  await page.evaluate(listen)
  await f.evaluate(listen)

  // Focus inside the frame (real click), then ⌘D: split, the key never reaches the shell page.
  const r = await h.rectOf(ctx, p)
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2)
  await h.eventually(ctx, async () => h.assert((await page.evaluate(() => document.activeElement?.tagName)) === 'IFRAME' && (await h.list(ctx)).active === p, 'frame focused, tile active'))
  // Positive control: a plain key sent the same way, in the same state, reaches the shell page, so
  // its missing Cmd+d (below) is main's block. The frame isn't checked: keys sent through main
  // (h.press, sendInputEvent on the window) land in the shell document even while the frame has
  // focus (tried), so "the frame never saw Cmd+d" would hold without the block (SECURITY.md
  // "Harness" limits).
  await h.press(ctx, 'x')
  await h.waitFor(ctx, () => page.evaluate(() => window.__keys.includes('x')), 'plain key reaches the shell page')
  let n = await count()
  await h.press(ctx, 'Meta+d')
  await h.eventually(ctx, async () => h.assert((await count()) === n + 1, 'cmd+D works with the frame focused'))
  const seen = await page.evaluate(() => window.__keys)
  h.assert(!seen.includes('Cmd+d'), `shortcut key blocked in main: ${JSON.stringify(seen)}`)

  // Synthetic KeyboardEvents: nothing (frame, shell).
  n = await count()
  const synth = `for (const t of [window, document.body]) t.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true }))`
  await f.evaluate(synth)
  await page.evaluate(synth)
  await ctx.sleep(400) // absence: no shortcut ran
  h.assert((await count()) === n, `synthetic keys ran a shortcut (${await count()} tiles, was ${n})`)

  // ⌘Q with the frame focused: the quit question (the frame can't keep it from main); Esc cancels.
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2)
  await h.waitFor(ctx, () => page.evaluate(() => document.activeElement?.tagName === 'IFRAME'), 'frame focused again')
  await h.press(ctx, 'Meta+q')
  await h.eventually(ctx, async () => h.assert(await page.isVisible('.dialog.quit'), 'cmd+Q asks with frame focused'))
  await page.keyboard.press('Escape')
  await h.waitNoDialog(ctx)

  // Esc and editing combos reach the page.
  await page.evaluate(() => (document.activeElement?.blur(), (window.__keys = [])))
  for (const c of ['Escape', 'Meta+c', 'Meta+v', 'Meta+a', 'Meta+z']) await h.press(ctx, c)
  await h.eventually(ctx, async () => {
    const passed = await page.evaluate(() => window.__keys)
    for (const k of ['Escape', 'Cmd+c', 'Cmd+v', 'Cmd+a', 'Cmd+z']) h.assert(passed.includes(k), `${k} passes (saw ${passed})`)
  })

  // Text fields keep their editing keys (cmd+arrows move the caret, not focus).
  await page.click(`.tile[data-id="${a}"] .titlebar`, { button: 'right' })
  await page.click('.menu-item >> text=Rename…')
  await page.evaluate(() => (window.__keys = []))
  const active = (await h.list(ctx)).active
  await h.press(ctx, 'Meta+ArrowRight')
  await h.eventually(ctx, async () => h.assert((await page.evaluate(() => window.__keys)).includes('Cmd+ArrowRight') && (await h.list(ctx)).active === active, 'cmd+arrow stays in the text field'))

  await page.keyboard.press('Escape')
}
