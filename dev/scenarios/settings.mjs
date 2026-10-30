// Settings: nav pages, theme + line height (live preview, cancel reverts), shell command.
export default async (ctx, h) => {
  const [a, b] = await h.threeWaySplit(ctx)
  await ctx.tie('move', b, '--shelve')
  const open = async () => {
    await ctx.page.evaluate(() => document.dispatchEvent(new CustomEvent('tie:settings')))
    await ctx.page.waitForSelector('.settings')
  }
  const cssVar = (n) => ctx.page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), n)
  const termBg = () => ctx.page.evaluate(() => getComputedStyle(document.querySelector('.xterm-viewport') ?? document.querySelector('.xterm')).backgroundColor)

  await open()
  await ctx.shot('appearance')
  // Fresh settings file: every field shows its default.
  for (const [sel, v] of [['#set-font-size', '12'], ['#set-line-height', '1.15'], ['#set-cell-width', '100'], ['#set-theme', 'tie-dark'], ['#set-font', '']])
    h.assert((await ctx.page.inputValue(sel)) === v, `default ${sel} = ${v}`)
  // Live preview, then cancel reverts.
  await ctx.page.selectOption('#set-theme', 'solarized-light')
  h.assert((await cssVar('--bg')) === '#fdf6e3', 'preview applies')
  await ctx.page.keyboard.press('Escape')
  h.assert((await cssVar('--bg')) === '#22252c', 'cancel reverts (Tie Dark default)')

  // Save Elegant Dark + line height.
  await open()
  await ctx.page.selectOption('#set-theme', 'nord')
  await ctx.page.fill('#set-line-height', '1.3')
  await ctx.page.waitForFunction(() => document.querySelectorAll('#set-font option').length > 1)
  const fonts = await ctx.page.$$eval('#set-font option', (os) => os.map((o) => o.value))
  ctx.log(`${fonts.length - 1} monospace fonts listed`)
  h.assert(fonts.includes('Menlo'), 'system fonts listed')
  h.assert(!fonts.includes('Helvetica'), 'proportional fonts filtered out')
  await ctx.page.selectOption('#set-font', 'MesloLGS Nerd Font Mono')
  await ctx.page.fill('#set-font-size', '14')
  const cw = () => ctx.page.evaluate(() => document.querySelector('.xterm-rows > div > span')?.getBoundingClientRect().width)
  const w100 = await cw()
  await ctx.page.fill('#set-cell-width', '90')
  const w90 = await cw()
  h.assert(w90 < w100 * 0.95, `char width shrinks rows (${w100} -> ${w90})`)
  await ctx.shot('fonts')
  await ctx.page.locator('.save').click()
  await ctx.sleep(200)
  h.assert((await cssVar('--bg')) === '#2e3440', 'nord saved')
  const lh = await ctx.page.evaluate(() => getComputedStyle(document.querySelector('.titlebar')).lineHeight)
  h.assert(lh === 'normal', `chrome line height untouched (${lh})`)
  const tf = await ctx.page.evaluate(() => getComputedStyle(document.querySelector('.xterm-rows')).fontFamily)
  h.assert(tf.includes('MesloLGS'), `terminal font applied (${tf})`)
  const cf = await ctx.page.evaluate(() => getComputedStyle(document.querySelector('.titlebar')).fontFamily)
  h.assert(!cf.includes('MesloLGS'), 'chrome font untouched')
  await ctx.shot('nord')
  await h.hoverShelf(ctx, b)
  await ctx.shot('nord-reveal')
  await ctx.page.mouse.move(400, 400)

  // Light theme screenshot for review.
  await open()
  await ctx.page.selectOption('#set-theme', 'solarized-light')
  await ctx.shot('solarized-light-panel')
  await ctx.page.keyboard.press('Escape')

  // Terminal page: shell command.
  await open()
  await ctx.page.locator('nav button[data-page="terminal"]').click()
  await ctx.shot('terminal-page')
  await ctx.page.fill('#set-shell', 'bash --norc')
  await ctx.page.keyboard.press('Enter')
  await ctx.sleep(150)
  h.assert(!(await ctx.page.$('.settings')), 'closed on Enter')
  const t = await ctx.tie('add', 'terminal', '--cmd', 'echo "argv0=$0"; sleep 30')
  await ctx.sleep(800)
  const line = await ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] .xterm-rows`).innerText.trim().split('\n')[0], t.id)
  h.assert(line.startsWith('argv0=bash'), `custom shell used: ${line}`)
  // Persisted across reopen; theme still nord.
  await open()
  h.assert((await ctx.page.inputValue('#set-shell')) === 'bash --norc', 'shell persisted')
  h.assert((await ctx.page.inputValue('#set-theme')) === 'nord', 'theme persisted')
  await ctx.page.keyboard.press('Escape')

  // Two open requests before the first resolves: one panel, Escape closes it.
  await ctx.page.evaluate(() => {
    document.dispatchEvent(new Event('tie:settings'))
    document.dispatchEvent(new Event('tie:settings'))
  })
  await ctx.sleep(300)
  await ctx.page.keyboard.press('Escape')
  await ctx.sleep(200)
  h.assert((await ctx.page.$$('.settings-backdrop')).length === 0, 'no orphan settings panel')

  // Borderless: the title strip goes (traffic lights hidden by main), the board reaches the top; persists.
  const boardY = async () => (await h.list(ctx)).board.y
  const y0 = await boardY()
  await open()
  await ctx.page.locator('nav button[data-page="appearance"]').click()
  await ctx.page.check('#set-borderless')
  await ctx.page.locator('.save').click()
  await ctx.sleep(200)
  h.assert((await boardY()) < y0 - 10, `board reaches the top (${y0} -> ${await boardY()})`)
  h.assert((await ctx.page.evaluate(() => window.tie.settings.get())).settings.borderless === true, 'borderless saved')

  await terminalTitle(ctx, h, open)
  await securityPage(ctx, h, open)
}

// Terminal title setting: command (default: foreground program, program titles ignored) | auto
// (program's OSC title) | directory (basename, full path as tooltip). Applies live to open terminals.
async function terminalTitle(ctx, h, open) {
  const x = (await ctx.tie('add', 'terminal', '--focus')).id
  await ctx.sleep(800)
  await ctx.page.keyboard.type("cd /tmp\nprintf '\\e]0;hello\\a'\n")
  await ctx.sleep(2600) // cwd poll
  const title = async () => (await h.tileOf(ctx, x)).title
  const tip = () => ctx.page.$eval(`.tile[data-id="${x}"] .titlebar .title`, (e) => e.title)
  const mode = async (v) => {
    await open()
    await ctx.page.locator('nav button[data-page="terminal"]').click()
    await ctx.page.selectOption('#set-terminal-title', v)
    await ctx.page.locator('.save').click()
    await ctx.sleep(200)
  }
  h.assert(/(^|\/)bash$/.test(await title()), `command (default): shell name, OSC title ignored: ${await title()}`)
  await mode('auto')
  h.assert((await title()) === 'hello', `auto: program's title: ${await title()}`)
  await mode('directory')
  h.assert((await title()) === 'tmp' && (await tip()).endsWith('/tmp'), `directory: basename + path tooltip: ${await title()} / ${await tip()}`)
  await ctx.shot('title-directory')
  await mode('command')
  h.assert((await tip()) === '', 'no tooltip outside directory mode')
  await ctx.page.keyboard.type('/bin/sleep 5\n') // absolute: PATH may alias sleep to gsleep
  await ctx.sleep(1200) // process poll
  h.assert((await title()) === 'sleep', `command: foreground program: ${await title()}`)
  await open()
  await ctx.page.locator('nav button[data-page="terminal"]').click()
  h.assert((await ctx.page.inputValue('#set-terminal-title')) === 'command', 'terminal title persisted')
  await ctx.page.keyboard.press('Escape')
  await ctx.tie('close', x)
}

// Security page: socket callers + links out; no Content page. The external-control switch applies
// at once (this harness is an external caller; the seed turned it on).
async function securityPage(ctx, h, open) {
  await open()
  h.assert(!(await ctx.page.$('nav button[data-page="content"]')), 'no Content page')
  await ctx.page.locator('nav button[data-page="security"]').click()
  h.assert(await ctx.page.isVisible('#set-confirm-external'), 'link confirm on Security')
  h.assert(await ctx.page.isChecked('#set-allow-external'), 'external control seeded on')
  await ctx.shot('security-page')
  await ctx.page.uncheck('#set-allow-external')
  await ctx.page.locator('.save').click()
  await ctx.sleep(200)
  const err = await ctx.tie('list').then(() => null, (e) => e.message)
  h.assert(err === 'tie: External control is off (Settings → Security)', `external refused once off: ${err}`)
  await open()
  await ctx.page.locator('nav button[data-page="security"]').click()
  await ctx.page.check('#set-allow-external')
  await ctx.page.locator('.save').click()
  await ctx.sleep(200)
  h.assert((await ctx.tie('list')).tiles.length > 0, 'external allowed again')
}
