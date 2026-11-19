// Settings → Bindings page: filters (name, key, only customized, clear), edit through real keys
// (main → capture field), invalid chord refused, Alt-only chord bound, unbind, reset, conflict
// dialog, Save applies live, Cancel reverts, column width fixed while filtering.
export default async (ctx, h) => {
  const page = ctx.page
  // Keys the UI page sees (the terminal's textarea included), by physical key: Alt+A reaches the
  // focused terminal while unbound (control), not once bound.
  await page.evaluate(() => {
    window.__seen = []
    window.addEventListener('keydown', (e) => window.__seen.push(e.code), true)
  })
  const seen = () => page.evaluate(() => window.__seen)
  const [term] = (await h.list(ctx)).tiles.map((t) => t.id)
  await h.waitShell(ctx, term)
  await h.press(ctx, 'Alt+a')
  await h.eventually(ctx, async () => h.assert((await seen()).includes('KeyA'), `unbound Alt+A reaches the terminal: ${await seen()}`))
  const row = (a) => `.bind-row[data-action="${a}"]`
  const visible = () => page.$$eval('.bind-row:not([hidden]) .label', (ls) => ls.map((l) => l.textContent))
  const chordOf = (a) => page.$eval(`${row(a)} .chord`, (e) => e.textContent)
  const isCustom = (a) => page.$eval(row(a), (e) => e.classList.contains('custom'))
  const resetOff = (a) => page.$eval(`${row(a)} .reset`, (e) => e.disabled)
  const colW = () => page.$eval('.bind-head span:nth-child(2)', (e) => e.getBoundingClientRect().width)
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  // Focus changes reach main asynchronously: keys only once main's mode follows (capture field).
  const capturing = () => h.waitKeyMode(ctx, 'capture')
  const edit = async (a, ...keys) => {
    await page.locator(`${row(a)} .edit`).click()
    await h.waitFor(ctx, () => page.evaluate((s) => document.activeElement?.matches(`${s} input.chord`), row(a)), `editing ${a}`)
    await capturing()
    for (const k of keys) await h.press(ctx, k)
  }

  await h.openSettings(ctx, 'bindings')
  const all = await visible()
  h.assert(all.length === 35 && all[0] === 'Split right', `all rows: ${all.length}`)
  const w0 = await colW()
  h.assert(w0 > 60, `binding column measured: ${w0}`)
  await ctx.shot('bindings')

  // Name search: case-insensitive substring.
  await page.fill('#bind-name', 'TAB')
  await h.eventually(ctx, async () => {
    const v = await visible()
    h.assert(v.length === 13 && v.every((l) => /tab/i.test(l)), `name filter: ${v}`)
  })
  h.assert((await colW()) === w0, 'width unchanged by name filter')

  // Key search: a captured chord; clears the name search.
  await page.click('#bind-key')
  await capturing()
  await h.press(ctx, 'Meta+d')
  await h.eventually(ctx, async () => h.assert(same(await visible(), ['Split right']), `key filter: ${await visible()}`))
  h.assert((await page.inputValue('#bind-name')) === '', 'key search cleared name search')
  h.assert((await page.inputValue('#bind-key')) === 'Cmd+D', 'key search shows the chord')
  h.assert((await colW()) === w0, 'width unchanged by key filter')
  await h.press(ctx, 'Meta+=')
  await h.eventually(ctx, async () => h.assert(same(await visible(), ['Zoom in']), `next chord replaces: ${await visible()}`))
  // Held modifiers show while held, in the order released; all released: the value again.
  const keyField = (v) => h.eventually(ctx, async () => h.assert((await page.inputValue('#bind-key')) === v, `key field ${v}: ${await page.inputValue('#bind-key')}`))
  await h.keyDown(ctx, 'Meta')
  await keyField('Cmd+')
  await h.keyDown(ctx, 'Shift')
  await keyField('Cmd+Shift+')
  await h.keyUp(ctx, 'Meta')
  await keyField('Shift+')
  await h.keyUp(ctx, 'Shift')
  await keyField('Cmd+=')
  await h.keyDown(ctx, 'Meta')
  await keyField('Cmd+')
  await h.keyUp(ctx, 'Meta')
  await keyField('Cmd+=')
  // Name search clears key search.
  await page.fill('#bind-name', 'zoom')
  await h.eventually(ctx, async () => h.assert((await visible()).length === 3, `zoom rows: ${await visible()}`))
  h.assert((await page.inputValue('#bind-key')) === '', 'name search cleared key search')
  await page.click('.bind-clear')
  await h.eventually(ctx, async () => h.assert((await visible()).length === 35, 'clear shows all'))

  // Defaults: reset disabled, not bold.
  h.assert((await resetOff('focus-left')) && !(await isCustom('focus-left')), 'default row: reset disabled, normal')

  // Edit: chord replaces, Enter accepts.
  await edit('split-right', 'Meta+k')
  await h.eventually(ctx, async () => h.assert((await page.inputValue(`${row('split-right')} input.chord`)) === 'Cmd+K', 'field shows the chord'))
  await ctx.shot('editing')
  await h.press(ctx, 'Enter')
  await h.eventually(ctx, async () => h.assert((await chordOf('split-right')) === 'Cmd+K', `edited: ${await chordOf('split-right')}`))
  h.assert((await isCustom('split-right')) && !(await resetOff('split-right')), 'customized: bold, reset enabled')
  h.assert(await page.isVisible('.settings'), 'Enter in the field did not save / close')

  // Only customized: a pencil toggle (the rows' edit icon), pressed look distinct.
  h.assert(await page.evaluate(() => document.querySelector('.bind-custom svg').outerHTML === document.querySelector('.bind-row .edit svg').outerHTML), 'filter toggle: the pencil')
  h.assert((await page.getAttribute('.bind-custom', 'title')) === 'Only customized', 'toggle tooltip')
  // Pointer away first: hover has its own look.
  const look = async () => (await page.mouse.move(1, 1), page.$eval('.bind-custom', (e) => { const s = getComputedStyle(e); return [s.color, s.backgroundColor, s.borderColor].join() }))
  const off = await look()
  await page.click('.bind-custom')
  h.assert((await page.getAttribute('.bind-custom', 'aria-pressed')) === 'true', 'toggle pressed')
  await h.eventually(ctx, async () => h.assert((await look()) !== off, `pressed look differs: ${off} / ${await look()}`))
  await page.click('.bind-custom')
  h.assert((await page.getAttribute('.bind-custom', 'aria-pressed')) === 'false', 'toggle released')
  await page.click('.bind-custom')
  await h.eventually(ctx, async () => h.assert(same(await visible(), ['Split right']), `customized only: ${await visible()}`))
  h.assert((await colW()) === w0, 'width unchanged by customized filter')
  await page.click('.bind-clear')
  h.assert((await page.getAttribute('.bind-custom', 'aria-pressed')) === 'false', 'clear turns customized-only off')

  // Invalid chord: refused, message, unchanged.
  await edit('split-down', 'Meta+c', 'Enter')
  await h.eventually(ctx, async () => h.assert(/Split down: Reserved combination: Cmd\+C/.test(await page.textContent('.settings .status')), 'reserved refused'))
  h.assert((await chordOf('split-down')) === 'Cmd+Shift+D' && !(await isCustom('split-down')), 'refused: unchanged')

  // Alt-only chord: named from the key's position, accepted.
  await edit('split-down', 'Alt+a')
  await h.eventually(ctx, async () => h.assert((await page.inputValue(`${row('split-down')} input.chord`)) === 'Alt+A', 'field shows Alt+A'))
  await h.press(ctx, 'Enter')
  await h.eventually(ctx, async () => h.assert((await chordOf('split-down')) === 'Alt+A' && (await isCustom('split-down')), `Alt+A bound: ${await chordOf('split-down')}`))

  // Escape cancels the edit (panel stays).
  await edit('zoom-out', 'Meta+j', 'Escape')
  await h.eventually(ctx, async () => h.assert((await chordOf('zoom-out')) === 'Cmd+-', 'escape: unchanged'))
  h.assert(await page.isVisible('.settings'), 'escape in the field kept the panel')

  // Unbind: Backspace empties, Enter accepts.
  await edit('close-tab', 'Backspace', 'Enter')
  await h.eventually(ctx, async () => h.assert((await chordOf('close-tab')) === '—' && (await isCustom('close-tab')), 'unbound, customized'))
  // Row X: back to default.
  await page.click(`${row('close-tab')} .reset`)
  await h.eventually(ctx, async () => h.assert((await chordOf('close-tab')) === 'Cmd+Shift+W' && !(await isCustom('close-tab')) && (await resetOff('close-tab')), 'reset to default'))

  // Conflict: Cancel keeps both.
  await edit('nav-reload', 'Meta+t', 'Enter')
  await page.waitForSelector('.dialog.binding-conflict')
  const body = await page.$$eval('.dialog.binding-conflict p', (ps) => ps.map((p) => p.textContent))
  h.assert(same(body, ['Cmd+T is bound to “New tab”.']), `one line: chord, other action: ${JSON.stringify(body)}`)
  const buttons = await page.$$eval('.dialog.binding-conflict button', (bs) => bs.map((b) => b.textContent))
  h.assert(same(buttons.sort(), ['Cancel', 'Replace']), `buttons: ${buttons}`)
  await ctx.shot('conflict')
  await page.click('.dialog.binding-conflict .cancel')
  await page.waitForSelector('.dialog.binding-conflict', { state: 'detached' })
  h.assert((await chordOf('nav-reload')) === 'Cmd+R' && (await chordOf('new-tab')) === 'Cmd+T', 'cancel: unchanged')
  h.assert(await page.evaluate(() => !!document.activeElement?.closest('.settings')), 'focus back in the panel')
  // Replace: the other becomes unbound (customized).
  await edit('nav-reload', 'Meta+t', 'Enter')
  await page.waitForSelector('.dialog.binding-conflict')
  await page.click('.dialog.binding-conflict .confirm')
  await h.eventually(ctx, async () => h.assert((await chordOf('nav-reload')) === 'Cmd+T' && (await chordOf('new-tab')) === '—' && (await isCustom('new-tab')), 'replace: other unbound'))
  await page.click('.bind-custom')
  await h.eventually(ctx, async () => h.assert((await visible()).length === 4, `customized: ${await visible()}`))
  await ctx.shot('edited')
  await page.click('.bind-clear')

  // Save applies live.
  await page.locator('.settings .save').click()
  await page.waitForSelector('.settings', { state: 'detached' })
  const saved = (await page.evaluate(() => window.tie.settings.get())).settings.bindings
  h.assert(same(saved, { 'split-right': 'Cmd+K', 'split-down': 'Alt+A', 'new-tab': null, 'nav-reload': 'Cmd+T' }), `saved: ${JSON.stringify(saved)}`)
  const tiles = async () => (await h.list(ctx)).tiles.length
  const tabs = () => page.evaluate(() => document.querySelectorAll('.tab').length)
  const n = await tiles(), t = await tabs()
  await h.press(ctx, 'Meta+k')
  await h.eventually(ctx, async () => h.assert((await tiles()) === n + 1, 'cmd+K splits'))
  await h.press(ctx, 'Meta+d')
  await h.press(ctx, 'Meta+t')
  await ctx.sleep(250) // absence: old chords no longer bound
  h.assert((await tiles()) === n + 1 && (await tabs()) === t, 'cmd+D, cmd+T: nothing')
  // Alt+A runs its action from a terminal, which no longer sees the key. Shift after it: the page
  // gets keys in order, so once Shift shows, an unblocked Alt+A would have shown before it.
  h.assert((await h.focused(ctx)) && (await h.focused(ctx)) !== 'BODY', 'a tile has the keys')
  await page.evaluate(() => (window.__seen = []))
  await h.press(ctx, 'Alt+a')
  await h.eventually(ctx, async () => h.assert((await tiles()) === n + 2, 'Alt+A splits down'))
  await h.press(ctx, 'Shift')
  await h.eventually(ctx, async () => h.assert((await seen()).length > 0, 'marker key seen'))
  h.assert(!(await seen()).includes('KeyA'), `bound Alt+A blocked from the page: ${await seen()}`)

  // Cancel reverts the draft.
  await h.openSettings(ctx, 'bindings')
  h.assert((await chordOf('split-right')) === 'Cmd+K', 'reopened with saved bindings')
  await page.click(`${row('split-right')} .reset`)
  await h.eventually(ctx, async () => h.assert((await chordOf('split-right')) === 'Cmd+D', 'reset in draft'))
  await page.locator('.settings .cancel').click()
  await page.waitForSelector('.settings', { state: 'detached' })
  h.assert(same((await page.evaluate(() => window.tie.settings.get())).settings.bindings, saved), 'cancel: nothing saved')
  await h.press(ctx, 'Meta+k')
  await h.eventually(ctx, async () => h.assert((await tiles()) === n + 3, 'cmd+K still splits'))
}
