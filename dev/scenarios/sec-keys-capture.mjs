// Security: capture mode (main/keys.ts). While a capture field has focus in the UI, keys arrive as
// chord names and nothing runs (quit included); the field's own keys pass; the mode ends with the
// field's focus (blur, focus into a content frame). Hidden window: a click focuses the frame for real.
export const hiddenWindow = true

export default async (ctx, h) => {
  const page = ctx.page
  const count = async () => (await h.list(ctx)).tiles.length
  const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
  const p = (await ctx.tie('add', 'probe', '--at', a, '--side', 'r')).id
  await h.probeFrame(ctx, p)

  await page.evaluate(() => {
    window.__cap = []
    window.__keys = []
    window.tie.keys.onCapture((c) => window.__cap.push(c))
    const el = document.createElement('input')
    el.id = 'cap'
    el.className = 'capture-field'
    el.style.cssText = 'position:fixed;left:0;top:0;z-index:9999'
    el.addEventListener('keydown', (e) => window.__keys.push(e.key))
    document.body.append(el)
    el.focus()
  })
  const cap = () => page.evaluate(() => window.__cap)
  const chords = async () => (await cap()).filter((c) => c.complete).map((c) => c.chord)

  // Shortcuts: captured as names, not run, unseen by the page. Quit too.
  const n = await count()
  for (const c of ['Meta+d', 'Meta+q', 'Control+Tab', 'Tab', 'Meta+Shift+w', 'Meta+,']) await h.press(ctx, c)
  await h.eventually(ctx, async () => h.assert(JSON.stringify(await chords()) === JSON.stringify(['Cmd+D', 'Cmd+Q', 'Ctrl+Tab', 'Tab', 'Cmd+Shift+W', 'Cmd+,']), `captured ${JSON.stringify(await cap())}`))
  h.assert((await count()) === n, 'no shortcut ran while capturing')
  h.assert(!(await page.isVisible('.dialog.quit')), 'no quit question while capturing')
  h.assert(!(await page.isVisible('.settings')), 'no settings panel (menu accelerator) while capturing')
  h.assert((await page.evaluate(() => window.__keys)).length === 0, 'the page saw no captured key')

  // Held modifiers: reported as incomplete.
  await page.evaluate(() => (window.__cap = []))
  await h.keyDown(ctx, 'Meta')
  await h.keyUp(ctx, 'Meta')
  await h.eventually(ctx, async () => h.assert((await cap()).length >= 1 && (await cap()).every((c) => !c.complete), `modifier alone is no chord: ${JSON.stringify(await cap())}`))

  // The field's own keys pass to it, uncaptured.
  await page.evaluate(() => (window.__cap = []))
  for (const c of ['Backspace', 'Enter', 'Escape']) await h.press(ctx, c)
  await h.eventually(ctx, async () => h.assert(JSON.stringify(await page.evaluate(() => window.__keys)) === JSON.stringify(['Backspace', 'Enter', 'Escape']), 'own keys reach the field'))
  h.assert((await chords()).length === 0, 'own keys are not captured')

  // Focus into a content frame: capture ends; the shortcut runs, nothing is forwarded.
  const r = await h.rectOf(ctx, p)
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2)
  await h.waitFor(ctx, () => page.evaluate(() => document.activeElement?.tagName === 'IFRAME'), 'frame focused')
  await ctx.sleep(300) // debounce: the UI tells main about focus changes asynchronously (nothing observable)
  await h.press(ctx, 'Meta+d')
  await h.eventually(ctx, async () => h.assert((await count()) === n + 1, 'cmd+D runs once the field lost focus'))
  h.assert((await chords()).length === 0, 'no key forwarded after capture ended')

  // Plain blur ends it too.
  await page.evaluate(() => document.getElementById('cap').focus())
  await h.press(ctx, 'Meta+d')
  await h.eventually(ctx, async () => h.assert((await chords()).includes('Cmd+D'), 'captures again when refocused'))
  await page.evaluate(() => document.getElementById('cap').remove())
  await ctx.sleep(300) // debounce: as above
  await h.press(ctx, 'Meta+d')
  await h.eventually(ctx, async () => h.assert((await count()) === n + 2, 'cmd+D runs after the field is gone'))
}
