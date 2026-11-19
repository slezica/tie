// Settings: nav pages, theme + line height (live preview, cancel reverts), shell command, Files page.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
export default async (ctx, h) => {
  const [a, b] = await h.threeWaySplit(ctx)
  await ctx.tie('move', '--tile', b, '--shelve')
  const termBg = () => ctx.page.evaluate(() => getComputedStyle(document.querySelector('.xterm-viewport') ?? document.querySelector('.xterm')).backgroundColor)

  await h.openSettings(ctx)
  await ctx.shot('appearance')
  // Fresh settings file: every field shows its default.
  for (const [sel, v] of [['#set-font-size', '12'], ['#set-line-height', '1.15'], ['#set-cell-width', '100'], ['#set-theme', 'tie-dark'], ['#set-font', '']])
    h.assert((await ctx.page.inputValue(sel)) === v, `default ${sel} = ${v}`)
  // Live preview, then cancel reverts.
  await ctx.page.selectOption('#set-theme', 'solarized-light')
  h.assert((await h.cssVar(ctx, '--bg')) === '#fdf6e3', 'preview applies')
  await ctx.page.keyboard.press('Escape')
  h.assert((await h.cssVar(ctx, '--bg')) === '#22252c', 'cancel reverts (Tie Dark default)')

  // Save Nord + line height + font (Monaco: ships with macOS, not in the default stack) + size.
  await h.openSettings(ctx)
  await ctx.page.selectOption('#set-theme', 'nord')
  // Line height previews in the terminal rows (xterm renders on the next frame).
  const rowH = () => ctx.page.evaluate(() => document.querySelector('.xterm-rows > div').getBoundingClientRect().height)
  const h115 = await rowH()
  await ctx.page.fill('#set-line-height', '1.3')
  await h.waitFor(ctx, async () => (await rowH()) > h115 * 1.08, `line height 1.3 previewed: rows taller than ${h115}`)
  await ctx.page.waitForFunction(() => document.querySelectorAll('#set-font option').length > 1)
  const fonts = await ctx.page.$$eval('#set-font option', (os) => os.map((o) => o.value))
  ctx.log(`${fonts.length - 1} monospace fonts listed`)
  h.assert(fonts.includes('Menlo') && fonts.includes('Monaco'), 'system fonts listed')
  h.assert(!fonts.includes('Helvetica'), 'proportional fonts filtered out')
  await ctx.page.selectOption('#set-font', 'Monaco')
  await ctx.page.fill('#set-font-size', '14')
  // Cell width previews: a row's text narrows. Width measured once the font + size preview drew.
  const cw = () => ctx.page.evaluate(() => document.querySelector('.xterm-rows > div > span')?.getBoundingClientRect().width)
  await h.settle(ctx)
  const w100 = await cw()
  await ctx.page.fill('#set-cell-width', '90')
  await h.waitFor(ctx, async () => (await cw()) < w100 * 0.95, `char width shrinks rows (${w100} -> ${await cw()})`)
  await ctx.shot('fonts')
  await ctx.page.locator('.save').click()
  await h.eventually(ctx, async () => h.assert((await h.cssVar(ctx, '--bg')) === '#2e3440', 'nord saved'))
  const saved = (await ctx.page.evaluate(() => window.tie.settings.get())).settings
  h.assert(saved.lineHeight === 1.3 && saved.fontFamily === 'Monaco' && saved.fontSize === 14 && saved.cellWidth === 90, `saved: ${JSON.stringify(saved)}`)
  h.assert((await h.cssVar(ctx, '--tile-line-height')) === '1.3', `line height applied: ${await h.cssVar(ctx, '--tile-line-height')}`)
  const lh = await ctx.page.evaluate(() => getComputedStyle(document.querySelector('.titlebar')).lineHeight)
  h.assert(lh === 'normal', `chrome line height untouched (${lh})`)
  const tf = await ctx.page.evaluate(() => getComputedStyle(document.querySelector('.xterm-rows')).fontFamily)
  h.assert(tf.includes('Monaco'), `terminal font applied (${tf})`)
  const cf = await ctx.page.evaluate(() => getComputedStyle(document.querySelector('.titlebar')).fontFamily)
  h.assert(!cf.includes('Monaco'), 'chrome font untouched')
  // New cell size: every pty resized to its new grid.
  await h.assertPtySizes(ctx)
  await ctx.shot('nord')
  await h.hoverShelf(ctx, b)
  await ctx.shot('nord-reveal')
  await ctx.page.mouse.move(400, 400)

  // Light theme: previews over a saved theme, Escape back to it (screenshot for review).
  await h.openSettings(ctx)
  await ctx.page.selectOption('#set-theme', 'solarized-light')
  h.assert((await h.cssVar(ctx, '--bg')) === '#fdf6e3' && (await ctx.page.evaluate(() => document.documentElement.classList.contains('light'))), 'light preview')
  await ctx.shot('solarized-light-panel')
  await ctx.page.keyboard.press('Escape')
  h.assert((await h.cssVar(ctx, '--bg')) === '#2e3440' && !(await ctx.page.evaluate(() => document.documentElement.classList.contains('light'))), 'cancel: back to saved nord')

  // Terminal page: shell command.
  await h.openSettings(ctx, 'terminal')
  await ctx.shot('terminal-page')
  await ctx.page.fill('#set-shell', 'bash --norc')
  await ctx.page.keyboard.press('Enter')
  await ctx.sleep(300) // absence: Enter in a field never saves or closes
  h.assert(await ctx.page.isVisible('.settings'), 'Enter in a field keeps the panel open')
  // Enter is done with a text / number field or a select: it loses focus to the panel (which keeps
  // Escape); value kept.
  const panelFocused = () => ctx.page.evaluate(() => document.activeElement?.classList.contains('settings'))
  h.assert(await panelFocused(), 'Enter unfocused the text field')
  h.assert((await ctx.page.inputValue('#set-shell')) === 'bash --norc', 'value kept after Enter')
  for (const sel of ['#set-terminal-title', '#set-font-size']) {
    if (sel === '#set-font-size') await ctx.page.locator('nav button[data-page="appearance"]').click()
    await ctx.page.focus(sel)
    await ctx.page.keyboard.press('Enter')
    await h.eventually(ctx, async () => h.assert(await panelFocused(), `Enter unfocused ${sel}`))
  }
  h.assert(await ctx.page.isVisible('.settings'), 'Enter in a select / number field keeps the panel open')
  await ctx.page.locator('nav button[data-page="terminal"]').click()
  await ctx.page.click('.settings button.save')
  await h.eventually(ctx, async () => h.assert(!(await ctx.page.$('.settings')), 'closed on Save'))
  const t = await ctx.tie('add', 'terminal', '--cmd', 'echo "argv0=$0"; sleep 30')
  await h.waitText(ctx, t.id, 'argv0=')
  const line = (await h.lines(ctx, t.id))[0]
  h.assert(line.startsWith('argv0=bash'), `custom shell used: ${line}`)
  // Persisted across reopen; theme still nord.
  await h.openSettings(ctx)
  h.assert((await ctx.page.inputValue('#set-shell')) === 'bash --norc', 'shell persisted')
  h.assert((await ctx.page.inputValue('#set-theme')) === 'nord', 'theme persisted')
  await ctx.page.keyboard.press('Escape')

  // Two open requests before the first resolves: one panel, Escape closes it.
  await ctx.page.evaluate(() => {
    document.dispatchEvent(new Event('tie:settings'))
    document.dispatchEvent(new Event('tie:settings'))
  })
  await ctx.page.waitForSelector('.settings')
  await ctx.sleep(300) // absence: by now the second request has resolved too (it must not add a panel)
  await ctx.page.keyboard.press('Escape')
  await h.eventually(ctx, async () => h.assert((await ctx.page.$$('.settings-backdrop')).length === 0, 'no orphan settings panel'))

  await terminalTitle(ctx, h)
  await securityPage(ctx, h)
  await aboutPage(ctx, h)
  await saveState(ctx, h)
  await filesPage(ctx, h)
}

// Terminal title setting: command (default: foreground program, program titles ignored) | auto
// (program's OSC title) | directory (basename, full path as tooltip). Applies live to open terminals.
async function terminalTitle(ctx, h) {
  const x = (await ctx.tie('add', 'terminal', '--focus')).id
  await h.waitShell(ctx, x)
  // Marker computed by the shell: on screen once the printf (OSC title) has run.
  await ctx.page.keyboard.type("cd /tmp\nprintf '\\e]0;hello\\a'; echo osc-$((40+2))\n")
  await h.waitText(ctx, x, 'osc-42')
  const title = async () => (await h.tileOf(ctx, x)).title
  const tip = () => ctx.page.$eval(`.tile[data-id="${x}"] .titlebar .title`, (e) => e.title)
  const mode = async (v) => {
    await h.openSettings(ctx, 'terminal')
    await ctx.page.selectOption('#set-terminal-title', v)
    await ctx.page.locator('.save').click()
    await ctx.page.waitForSelector('.settings', { state: 'detached' })
  }
  // Process poll (1 s): "terminal" until the first one.
  await h.eventually(ctx, async () => h.assert(/(^|\/)bash$/.test(await title()), `command (default): shell name, OSC title ignored: ${await title()}`))

  await mode('auto')
  await h.eventually(ctx, async () => h.assert((await title()) === 'hello', `auto: program's title: ${await title()}`))
  await mode('directory')
  // cwd poll (2 s): directory known once it ran.
  await h.eventually(ctx, async () => h.assert((await title()) === 'tmp' && (await tip()).endsWith('/tmp'), `directory: basename + path tooltip: ${await title()} / ${await tip()}`), 6000)
  await ctx.shot('title-directory')
  await mode('command')
  await h.eventually(ctx, async () => h.assert((await tip()) === '', 'no tooltip outside directory mode'))
  await ctx.page.keyboard.type('/bin/sleep 5\n') // absolute: PATH may alias sleep to gsleep
  // Process poll (1 s).
  await h.eventually(ctx, async () => h.assert((await title()) === 'sleep', `command: foreground program: ${await title()}`))
  await h.openSettings(ctx, 'terminal')
  h.assert((await ctx.page.inputValue('#set-terminal-title')) === 'command', 'terminal title persisted')
  await ctx.page.keyboard.press('Escape')
  await ctx.tie('close', '--tile', x)
}

// Security page: socket callers + links out; no Content page. The external-control switch applies
// at once (this harness is an external caller; the seed turned it on).
async function securityPage(ctx, h) {
  await h.openSettings(ctx)
  h.assert(!(await ctx.page.$('nav button[data-page="content"]')), 'no Content page')
  await ctx.page.locator('nav button[data-page="security"]').click()
  h.assert(await ctx.page.isVisible('#set-confirm-external'), 'link confirm on Security')
  h.assert(await ctx.page.isChecked('#set-allow-external'), 'external control seeded on')
  await ctx.shot('security-page')
  await ctx.page.uncheck('#set-allow-external')
  await ctx.page.locator('.save').click()
  await h.eventually(ctx, async () => {
    const err = await h.tieError(ctx, 'list')
    h.assert(err === 'tie: External control is off (Settings → Security)', `external refused once off: ${err}`)
  })
  await h.openSettings(ctx, 'security')
  await ctx.page.check('#set-allow-external')
  await ctx.page.locator('.save').click()
  await h.eventually(ctx, async () => h.assert((await ctx.tie('list')).tiles.length > 0, 'external allowed again'))
}

// Files page (after Terminal): "Respect .gitignore", default on; saved as gitignore.
async function filesPage(ctx, h) {
  await h.openSettings(ctx)
  const pages = await ctx.page.$$eval('.settings nav button', (bs) => bs.map((b) => b.dataset.page))
  h.assert(JSON.stringify(pages) === JSON.stringify(['appearance', 'bindings', 'terminal', 'files', 'security', 'about']), `pages: ${pages}`)
  await ctx.page.locator('nav button[data-page="files"]').click()
  h.assert(await ctx.page.isChecked('#set-gitignore'), 'gitignore on by default')
  await ctx.shot('files-page')
  await ctx.page.uncheck('#set-gitignore')
  await ctx.page.locator('.save').click()
  await ctx.page.waitForSelector('.settings', { state: 'detached' })
  h.assert((await ctx.page.evaluate(() => window.tie.settings.get())).settings.gitignore === false, 'gitignore saved off')
  await h.openSettings(ctx, 'files')
  h.assert(!(await ctx.page.isChecked('#set-gitignore')), 'gitignore off persisted')
  await ctx.page.keyboard.press('Escape')
}

// About page (last, after a separator): read-only versions and paths; Escape still closes from it.
async function aboutPage(ctx, h) {
  await h.openSettings(ctx, 'about')
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
  const row = (k) => ctx.page.locator(`dd[data-about="${k}"]`)
  h.assert((await row('tie').textContent()) === pkg.version, `Tie version: ${await row('tie').textContent()}`)
  h.assert((await row('electron').textContent()) === pkg.devDependencies.electron, `Electron version: ${await row('electron').textContent()}`)
  h.assert(/^\d+\./.test(await row('chromium').textContent()) && /^\d+\./.test(await row('node').textContent()), 'Chromium and Node versions')
  h.assert((await row('instance').textContent()) === ctx.instance, `instance: ${await row('instance').textContent()}`)
  h.assert((await row('log').getAttribute('title')).endsWith('.log') && (await row('settings').getAttribute('title')).endsWith('settings.json'), 'log and settings paths')
  h.assert(await ctx.page.evaluate(() => document.querySelector('.settings nav button[data-page="about"]').previousElementSibling.tagName === 'HR'), 'separator above About')
  await ctx.shot('about-page')
  await ctx.page.keyboard.press('Escape')
  await ctx.page.waitForSelector('.settings', { state: 'detached' })
}

// Save is enabled only with something to save: a value put back to the active one disables it again.
async function saveState(ctx, h) {
  await h.openSettings(ctx, 'appearance')
  const off = () => ctx.page.isDisabled('.save')
  h.assert(await off(), 'Save disabled: no changes')
  const size = await ctx.page.inputValue('#set-font-size')
  await ctx.page.fill('#set-font-size', String(Number(size) + 1))
  h.assert(!(await off()), 'Save enabled: font size changed')
  await ctx.page.fill('#set-font-size', size)
  h.assert(await off(), 'Save disabled: font size put back')
  const theme = await ctx.page.inputValue('#set-theme')
  await ctx.page.selectOption('#set-theme', theme === 'nord' ? 'tie-dark' : 'nord')
  h.assert(!(await off()), 'Save enabled: theme changed')
  await ctx.page.selectOption('#set-theme', theme)
  h.assert(await off(), 'Save disabled: theme put back')
  await ctx.page.locator('nav button[data-page="files"]').click()
  await ctx.page.click('#set-gitignore')
  h.assert(!(await off()), 'Save enabled: checkbox changed')
  await ctx.page.click('#set-gitignore')
  h.assert(await off(), 'Save disabled: checkbox put back')
  await ctx.page.locator('nav button[data-page="terminal"]').click()
  await ctx.page.fill('#set-shell', '/bin/zsh-other')
  h.assert(!(await off()), 'Save enabled: shell changed')
  await ctx.page.keyboard.press('Escape')
  await ctx.page.waitForSelector('.settings', { state: 'detached' })
}
