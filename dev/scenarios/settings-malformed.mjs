// Unparseable settings file: panel shows the problem and Save never overwrites the file; fixed on disk, Save works again.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../lib.mjs'

export const settings = '{ "theme": "nord", "fontSize": 15, }'

export default async (ctx, h) => {
  const file = join(ROOT, 'tmp', `${ctx.instance}.settings.json`)
  await ctx.page.evaluate(() => document.dispatchEvent(new CustomEvent('tie:settings')))
  await ctx.page.waitForSelector('.settings')
  h.assert(await ctx.page.isVisible('.status.error'), 'load error shown')
  await ctx.page.locator('.save').click()
  await ctx.sleep(200) // absence: the panel stays, the file isn't written
  h.assert(await ctx.page.isVisible('.settings'), 'save refused')
  h.assert(readFileSync(file, 'utf8') === settings, 'file untouched')
  await ctx.shot('load-error')

  // The user fixes the file by hand: the next Save re-reads it, then writes. Values not asserted:
  // the panel opened on defaults and Save writes them over the fixed file (nord/15 → tie-dark/12),
  // reported in the test suite review wave 1 (open question, not a fixed contract).
  writeFileSync(file, '{ "theme": "nord", "fontSize": 15 }\n')
  await ctx.page.locator('.save').click()
  await h.eventually(ctx, async () => h.assert(!(await ctx.page.$('.settings')), 'fixed file: Save closes the panel'))
  const written = JSON.parse(readFileSync(file, 'utf8'))
  h.assert(typeof written.theme === 'string' && typeof written.fontSize === 'number', `file written: ${JSON.stringify(written)}`)
  const got = await ctx.page.evaluate(() => window.tie.settings.get())
  h.assert(got.error === null, `no load error after the fix: ${got.error}`)
  ctx.log(`after the fix, Save wrote theme ${written.theme}, fontSize ${written.fontSize}`)
}
