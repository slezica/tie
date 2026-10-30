// Unparseable settings file: panel shows the problem and Save never overwrites the file.
import { readFileSync } from 'node:fs'
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
}
