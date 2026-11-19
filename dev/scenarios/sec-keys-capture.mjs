// Security: capture mode (main/keys.ts). While a capture field has focus in the UI, keys arrive as
// chord names and nothing runs (quit included); the field's own keys pass; a browser guest's keys
// are never forwarded and run nothing; the mode ends with the field's focus (blur, focus into a
// content frame). Hidden window: a click focuses the frame for real.
export const hiddenWindow = true

export default async (ctx, h) => {
  const page = ctx.page
  const count = async () => (await h.list(ctx)).tiles.length
  const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
  const p = (await ctx.tie('add', 'probe', '--at', a, '--side', 'r')).id
  await h.probeFrame(ctx, p)
  const s = await h.site(ctx, () => '<!doctype html><title>G</title><p>guest</p>')
  try {
    const b = (await ctx.tie('add', s.url + '/', '--at', a, '--side', 'b')).id
    await h.guestPage(ctx, b)

    await page.evaluate(() => {
      window.__cap = []
      window.__keys = []
      window.__shell = [] // keys the shell page saw (window, capture phase)
      addEventListener('keydown', (e) => window.__shell.push(e.key), true)
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

    // Main's mode follows the UI's focus asynchronously (IPC): wait for it rather than sleep. An
    // unbound key (F7) comes back as a captured chord in capture mode, else it reaches the shell
    // page. Main handles keys in order, so once one probe key shows up, none is still in flight.
    const until = async (what, check) => {
      for (let i = 0; i < 40; i++) {
        await h.press(ctx, 'F7')
        if (await h.waitFor(ctx, check, what, 250).catch(() => false)) return
      }
      throw new Error(`timed out: ${what}`)
    }
    const captureOn = async () => {
      await until('capture mode on', async () => (await chords()).includes('F7'))
      await page.evaluate(() => ((window.__cap = []), (window.__keys = []), (window.__shell = [])))
    }
    const captureOff = async () => {
      await page.evaluate(() => (window.__shell = []))
      await until('capture mode off', () => page.evaluate(() => window.__shell.includes('F7')))
    }
    await captureOn()

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

    // A guest's keys while the UI captures: never forwarded as chords (only the UI's own
    // webContents), nothing runs, quit included. A UI key after them marks they were handled
    // (main runs each guest key's before-input-event as the dev socket sends it).
    await page.evaluate(() => (window.__cap = []))
    for (const c of ['Meta+d', 'Meta+q', 'Meta+t', 'x']) await h.guestKey(ctx, b, c)
    await h.press(ctx, 'F8')
    await h.waitFor(ctx, async () => (await chords()).includes('F8'), 'UI key after the guest keys captured')
    await ctx.sleep(300) // absence: nothing runs from the guest's keys
    h.assert(JSON.stringify(await chords()) === '["F8"]', `guest keys never forwarded: ${JSON.stringify(await cap())}`)
    h.assert((await count()) === n && (await h.list(ctx)).tabs.length === 1 && !(await page.isVisible('.dialog.quit')), 'guest keys ran nothing while capturing (split, new tab, quit)')

    // Focus into a content frame: capture ends; the shortcut runs, nothing is forwarded.
    const r = await h.rectOf(ctx, p)
    await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2)
    await h.waitFor(ctx, () => page.evaluate(() => document.activeElement?.tagName === 'IFRAME'), 'frame focused')
    await captureOff()
    await page.evaluate(() => (window.__cap = []))
    await h.press(ctx, 'Meta+d')
    await h.eventually(ctx, async () => h.assert((await count()) === n + 1, 'cmd+D runs once the field lost focus'))
    h.assert((await chords()).length === 0, 'no key forwarded after capture ended')

    // Plain blur ends it too.
    await page.evaluate(() => document.getElementById('cap').focus())
    await captureOn()
    await h.press(ctx, 'Meta+d')
    await h.eventually(ctx, async () => h.assert((await chords()).includes('Cmd+D'), 'captures again when refocused'))
    await page.evaluate(() => document.getElementById('cap').remove())
    await captureOff()
    await h.press(ctx, 'Meta+d')
    await h.eventually(ctx, async () => h.assert((await count()) === n + 2, 'cmd+D runs after the field is gone'))

    // Control for the guest case: the same guest key, capture off, runs its shortcut (the guest's
    // keys do reach main's matcher in this setup).
    await h.guestKey(ctx, b, 'Meta+d')
    await h.eventually(ctx, async () => h.assert((await count()) === n + 3, 'cmd+D from the guest runs once capture is off'))
  } finally {
    await s.close()
  }
}
