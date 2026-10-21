// Security: shortcuts live in main (before-input-event): they work while a content frame has focus,
// the page never sees their keys, and synthetic KeyboardEvents (frame or shell) trigger nothing.
// Esc and editing combos pass through. Hidden window: a click focuses the frame for real.
export const hiddenWindow = true

export default async (ctx, h) => {
  const page = ctx.page
  const count = async () => (await h.list(ctx)).tiles.length
  const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
  const p = (await ctx.tie('open', 'probe', '--at', a, '--side', 'r')).id
  const f = await h.probeFrame(ctx, p)
  const listen = `window.__keys = []; addEventListener('keydown', (e) => window.__keys.push((e.metaKey ? 'Cmd+' : '') + e.key), true)`
  await page.evaluate(listen)
  await f.evaluate(listen)

  // Focus inside the frame (real click), then ⌘D: split, key never reaches UI or frame.
  const r = await h.rectOf(ctx, p)
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2)
  await ctx.sleep(300)
  h.assert((await page.evaluate(() => document.activeElement?.tagName)) === 'IFRAME' && (await h.list(ctx)).active === p, 'frame focused, tile active')
  let n = await count()
  await h.press(ctx, 'Meta+d')
  await ctx.sleep(400)
  h.assert((await count()) === n + 1, 'cmd+D works with the frame focused')
  const seen = { shell: await page.evaluate(() => window.__keys), frame: await f.evaluate(() => window.__keys) }
  h.assert(![...seen.shell, ...seen.frame].includes('Cmd+d'), `shortcut key blocked in main: ${JSON.stringify(seen)}`)

  // Synthetic KeyboardEvents: nothing (frame, shell).
  n = await count()
  const synth = `for (const t of [window, document.body]) t.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true }))`
  await f.evaluate(synth)
  await page.evaluate(synth)
  await ctx.sleep(400)
  h.assert((await count()) === n, `synthetic keys ran a shortcut (${await count()} tiles, was ${n})`)

  // Hold-⌘Q with the frame focused: a tap shows the hint (the frame can't hide it from main).
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2)
  await ctx.sleep(200)
  await h.keyDown(ctx, 'Meta')
  await h.press(ctx, 'q')
  await h.keyUp(ctx, 'Meta')
  await ctx.sleep(150)
  h.assert(await page.isVisible('#quit-hold'), 'cmd+Q hint with frame focused')

  // Esc and editing combos reach the page.
  await page.evaluate(() => (document.activeElement?.blur(), (window.__keys = [])))
  for (const c of ['Escape', 'Meta+c', 'Meta+v', 'Meta+a', 'Meta+z']) await h.press(ctx, c)
  await ctx.sleep(300)
  const passed = await page.evaluate(() => window.__keys)
  for (const k of ['Escape', 'Cmd+c', 'Cmd+v', 'Cmd+a', 'Cmd+z']) h.assert(passed.includes(k), `${k} passes (saw ${passed})`)

  // Text fields keep their editing keys (cmd+arrows move the caret, not focus).
  await page.click(`.tile[data-id="${a}"] .titlebar`, { button: 'right' })
  await page.click('.menu-item >> text=Rename…')
  await page.evaluate(() => (window.__keys = []))
  const active = (await h.list(ctx)).active
  await h.press(ctx, 'Meta+ArrowRight')
  await ctx.sleep(300)
  h.assert((await page.evaluate(() => window.__keys)).includes('Cmd+ArrowRight') && (await h.list(ctx)).active === active, 'cmd+arrow stays in the text field')
  await page.keyboard.press('Escape')
}
