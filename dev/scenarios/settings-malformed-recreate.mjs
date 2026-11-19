// Unparseable settings file at startup, "Recreate with defaults" (SETTINGS.md "File"): the broken
// bytes go to <file>.bak (0600), the file gets the defaults, Save works.
import { readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../lib.mjs'

export const settings = '{ "theme": "nord", ,}'

export default async (ctx, h) => {
  const file = join(ROOT, 'tmp', `${ctx.instance}.settings.json`)
  const bak = `${file}.bak`
  await ctx.page.waitForSelector('.dialog.settings-load')
  const tip = await ctx.page.getAttribute('.dialog.settings-load button[data-value="recreate"]', 'title')
  h.assert(tip?.includes(`${ctx.instance}.settings.json.bak`), `backup named in the tooltip: ${tip}`)
  await ctx.page.locator('.dialog.settings-load button[data-value="recreate"]').click()
  await ctx.page.waitForSelector('.dialog.settings-load', { state: 'detached' })

  await h.waitFor(ctx, () => existsSync(bak) && readFileSync(bak, 'utf8') === settings, 'backup holds the broken bytes')
  h.assert((statSync(bak).mode & 0o777) === 0o600, `backup mode 0600: ${(statSync(bak).mode & 0o777).toString(8)}`)
  const written = JSON.parse(readFileSync(file, 'utf8'))
  h.assert(written.theme === 'tie-dark' && written.fontSize === 12 && written.allowExternalControl === false, `defaults written: ${JSON.stringify(written)}`)
  const got = await ctx.page.evaluate(() => window.tie.settings.get())
  h.assert(got.error === null && got.loadError === null && got.changed === false, `unblocked: ${JSON.stringify({ error: got.error, loadError: got.loadError, changed: got.changed })}`)

  await h.openSettings(ctx)
  h.assert(!(await ctx.page.isVisible('.status.error')) && !(await ctx.page.isVisible('.settings-banner')), 'no error, no banner')
  await ctx.page.fill('#set-font-size', '14')
  await ctx.page.locator('.save').click()
  await h.eventually(ctx, async () => h.assert(!(await ctx.page.$('.settings')), 'Save closes the panel'))
  h.assert(JSON.parse(readFileSync(file, 'utf8')).fontSize === 14, 'saved')
  h.assert(readFileSync(bak, 'utf8') === settings, 'backup kept')
}
