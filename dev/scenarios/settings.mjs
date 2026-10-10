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
  const t = await ctx.tie('open', 'terminal', '--cmd', 'echo "argv0=$0"; sleep 30')
  await ctx.sleep(800)
  const line = await ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] .xterm-rows`).innerText.trim().split('\n')[0], t.id)
  h.assert(line.startsWith('argv0=bash'), `custom shell used: ${line}`)
  // Persisted across reopen; theme still nord.
  await open()
  h.assert((await ctx.page.inputValue('#set-shell')) === 'bash --norc', 'shell persisted')
  h.assert((await ctx.page.inputValue('#set-theme')) === 'nord', 'theme persisted')
  await ctx.page.keyboard.press('Escape')
}
