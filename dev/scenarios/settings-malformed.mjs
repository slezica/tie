// Unparseable settings file at startup (SETTINGS.md "File"): Tie runs on defaults, a dialog names the
// file (Close focused: Enter keeps the file); Close leaves the bytes and Save stays blocked. Fixed on
// disk: the open panel's banner appears, Reload applies the file, Save works again (with a change).
// Recreate with defaults: settings-malformed-recreate.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ROOT } from '../lib.mjs'

export const settings = '{ "theme": "nord", "fontSize": 15, }'

const tilde = (p) => (p.startsWith(homedir() + '/') ? '~' + p.slice(homedir().length) : p)

export default async (ctx, h) => {
  const file = join(ROOT, 'tmp', `${ctx.instance}.settings.json`)
  const bytes = () => readFileSync(file, 'utf8')

  // Startup dialog: path, the parser's reason, Close focused.
  await ctx.page.waitForSelector('.dialog.settings-load')
  await ctx.shot('load-dialog')
  const [first, reason] = await ctx.page.$$eval('.dialog.settings-load .dialog-body p', (ps) => ps.map((p) => p.textContent))
  h.assert(first === `Syntax errors in your settings file, at ${tilde(file)}.`, `dialog text: ${first}`)
  h.assert(reason && reason.length > 0, `parser message shown: ${reason}`)
  const buttons = await ctx.page.$$eval('.dialog.settings-load button', (bs) => bs.map((b) => b.textContent))
  h.assert(JSON.stringify(buttons) === '["Close","Recreate with defaults"]', `buttons: ${buttons}`)
  h.assert((await ctx.page.evaluate(() => document.activeElement?.textContent)) === 'Close', 'Close focused')
  // Running on defaults meanwhile.
  h.assert((await h.cssVar(ctx, '--tile-font-size')) === '12px', 'defaults in effect')

  // Enter presses the focused Close: dialog gone, nothing written, no backup.
  await ctx.page.keyboard.press('Enter')
  await ctx.page.waitForSelector('.dialog.settings-load', { state: 'detached' })
  h.assert(bytes() === settings, 'Close: file untouched')
  h.assert(!existsSync(`${file}.bak`), 'Close: no backup')

  // Panel: Save blocked with the reason, no banner (the file hasn't changed since loaded).
  await h.openSettings(ctx)
  h.assert(await ctx.page.isVisible('.status.error'), 'load error on the status line')
  h.assert(!(await ctx.page.isVisible('.settings-banner')), 'no banner: file unchanged')
  await ctx.page.fill('#set-font-size', '13') // Save needs a change to be enabled
  await ctx.page.locator('.save').click()
  await ctx.sleep(200) // absence: the panel stays, the file isn't written
  h.assert(await ctx.page.isVisible('.settings'), 'save refused')
  h.assert(bytes() === settings, 'refused save: file untouched')
  await ctx.page.fill('#set-font-size', '12') // the change put back (it previews live)

  // Fixed by hand: the open panel shows the banner (watcher), nothing applied yet.
  const fixed = '{ "theme": "nord", "fontSize": 15 }\n'
  const t0 = Date.now()
  writeFileSync(file, fixed)
  await h.waitFor(ctx, () => ctx.page.isVisible('.settings-banner'), 'banner after the fix')
  ctx.log(`watcher latency: ${Date.now() - t0} ms`)
  h.assert(await ctx.page.isDisabled('.save'), 'Save disabled under the banner')
  h.assert((await h.cssVar(ctx, '--tile-font-size')) === '12px', 'not auto-reloaded')
  await ctx.shot('banner')

  // Reload: applied live, panel shows the file's values, Save no longer blocked, file not rewritten.
  await ctx.page.locator('.settings-banner .reload').click()
  await h.eventually(ctx, async () => {
    h.assert((await h.cssVar(ctx, '--bg')) === '#2e3440', 'nord applied')
    h.assert((await h.cssVar(ctx, '--tile-font-size')) === '15px', 'font size applied')
    h.assert(!(await ctx.page.isVisible('.settings-banner')), 'banner gone')
  })
  h.assert((await ctx.page.inputValue('#set-font-size')) === '15' && (await ctx.page.inputValue('#set-theme')) === 'nord', 'panel shows the file')
  h.assert(!(await ctx.page.isVisible('.status.error')) && (await ctx.page.isDisabled('.save')), 'no error; Save disabled: nothing to save')
  h.assert(bytes() === fixed, 'Reload never writes')

  await ctx.page.fill('#set-font-size', '16')
  h.assert(!(await ctx.page.isDisabled('.save')), 'Save unblocked by a change')
  await ctx.page.locator('.save').click()
  await h.eventually(ctx, async () => h.assert(!(await ctx.page.$('.settings')), 'Save closes the panel'))
  const written = JSON.parse(bytes())
  h.assert(written.theme === 'nord' && written.fontSize === 16, `saved over the fixed file: ${JSON.stringify(written)}`)
}
