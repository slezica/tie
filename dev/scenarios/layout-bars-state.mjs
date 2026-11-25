// UI state file (bar sizes) that doesn't load: garbage, wrong types, out of range, wrong shape,
// unreadable → defaults or clamped values, field by field; no dialog, no `[error]`; the file is never
// rewritten by a load; a failed write is logged, not raised.
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { uiStatePath } from '../lib.mjs'

export const uiState = '{"bars": {"top": 50,' // cut off: not JSON

export default async (ctx, h) => {
  const file = uiStatePath(ctx.instance)
  const DEFAULTS = { top: 40, bottom: 40, left: 160, right: 160 }
  const noDialog = async () => h.assert(!(await ctx.page.$('.dialog-backdrop')), 'no dialog')
  const sizes = async () => (await h.barSizes(ctx)).stored

  // Garbage: defaults, logged as the app's (not an error), file left as it was.
  h.assert(JSON.stringify(await sizes()) === JSON.stringify(DEFAULTS), `garbage: defaults (${JSON.stringify(await sizes())})`)
  await noDialog()
  h.assert(/\[app\] ui state .* not JSON/.test(ctx.appLog()), 'garbage: logged')
  h.assert(readFileSync(file, 'utf8') === uiState, 'garbage: file untouched')
  await h.settle(ctx)

  // Wrong types, out of range (32: an old minimum, clamped up to 40), unknown keys: each field on its
  // own (clamped, or its default).
  const mixed = JSON.stringify({ bars: { top: 32, bottom: 1000, left: 'wide', right: 300.4, middle: 9 }, other: true })
  writeFileSync(file, mixed)
  await ctx.restart()
  h.assert(JSON.stringify(await sizes()) === JSON.stringify({ top: 40, bottom: 60, left: 160, right: 300 }), `mixed: cleaned (${JSON.stringify(await sizes())})`)
  const { board } = await h.list(ctx)
  const H = await ctx.page.evaluate(() => innerHeight)
  h.assert(Math.abs(board.y + board.h - (H - 60)) <= 1, `mixed: bottom bar shown at 60 (${board.y + board.h})`)
  await noDialog()
  h.assert(readFileSync(file, 'utf8') === mixed, 'mixed: file untouched by the load')
  h.assert(/\[app\] ui state .*dropped: left, middle/.test(ctx.appLog()), 'mixed: dropped fields logged')

  // Wrong shape: bars not an object → defaults.
  writeFileSync(file, '{"bars": [60, 60, 200, 200]}')
  await ctx.restart()
  h.assert(JSON.stringify(await sizes()) === JSON.stringify(DEFAULTS), 'bars an array: defaults')
  await noDialog()

  // Unreadable (a directory in its place): defaults; a resize then can't write: logged, no error.
  rmSync(file, { force: true })
  mkdirSync(file)
  await ctx.restart()
  h.assert(JSON.stringify(await sizes()) === JSON.stringify(DEFAULTS), 'unreadable: defaults')
  await noDialog()
  await h.resizeBar(ctx, 'bottom', 50)
  h.assert((await sizes()).bottom === 50, 'resize still applies')
  await h.waitLog(ctx, /\[app\] ui state not written/)
  rmSync(file, { recursive: true, force: true })
  h.assert(!/\[error\]/.test(ctx.appLog()), 'no [error] in the log')
}
