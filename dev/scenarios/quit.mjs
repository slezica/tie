// Quit asks, always (⌘Q, window close): busy terminals listed by tab; Esc / Cancel keep Tie; ⌘Q
// while a dialog is open: no second one; Quit quits (ptys killed).
import { existsSync } from 'node:fs'
import { infoPath, rpc } from '../lib.mjs'

export default async (ctx, h) => {
  const alive = () => existsSync(infoPath(ctx.instance))
  const k = (chord) => h.press(ctx, chord)
  const dialogs = () => ctx.page.$$eval('.dialog-backdrop', (els) => els.length)

  // Idle: asks, nothing listed. Esc keeps Tie, keys back to the terminal.
  const a = (await h.list(ctx)).active
  await k('Meta+q')
  await h.eventually(ctx, async () => {
    h.assert((await ctx.page.isVisible('.dialog.quit')) && (await ctx.page.textContent('.dialog h2')) === 'Quit Tie?', 'cmd+Q asks')
    h.assert((await ctx.page.$$('.dialog ul.running')).length === 0, 'idle: nothing listed')
  })
  await ctx.page.keyboard.press('Escape')
  await h.eventually(ctx, async () => {
    h.assert(alive() && (await dialogs()) === 0, 'Esc: still running, dialog gone')
    h.assert((await ctx.page.evaluate(() => document.activeElement?.closest('.tile')?.dataset.id)) === a, 'keys back to the terminal')
  })

  // Busy terminals in two tabs (one shelved): listed, grouped by tab.
  await ctx.page.keyboard.type('sleep 30\n')
  await h.waitChild(ctx, a, /sleep/)
  await k('Meta+t')
  await h.waitFor(ctx, async () => (await h.list(ctx)).tabs.length === 2, 'new tab')
  const b = (await h.list(ctx)).active
  await h.waitShell(ctx, b)
  const sh = (await ctx.tie('add', 'terminal', '--shelved', '--cmd', 'sleep 31')).id
  await ctx.page.keyboard.type('sleep 32 &\n')
  await h.waitText(ctx, b, /sleep 32 &.*\[1\] \d+.*\$/) // job line, prompt back: a background job
  await h.waitChild(ctx, b, /sleep/)
  await h.waitTile(ctx, sh, (t) => t.term?.pid, 'cmd tile spawned')
  await k('Meta+q')
  await h.eventually(ctx, async () => {
    const groups = await ctx.page.$$eval('.dialog p.group', (els) => els.map((x) => x.textContent))
    const items = await ctx.page.$$eval('.dialog ul.running li', (els) => els.map((x) => x.textContent))
    h.assert(groups.length === 2, `grouped by tab: ${groups}`)
    h.assert(items.length === 3 && items.some((x) => /sleep 31/.test(x)) && items.some((x) => /running/.test(x)), `lists the three busy tiles: ${items}`)
  })
  await ctx.shot('quit-running')

  // ⌘Q again while asked: no second dialog.
  await k('Meta+q')
  await ctx.sleep(300) // absence: no second dialog
  h.assert((await dialogs()) === 1, 'one dialog')
  await ctx.page.click('.dialog .cancel')
  await h.eventually(ctx, async () => h.assert(alive() && (await dialogs()) === 0, 'Cancel: still running'))

  // ⌘Q while another dialog (close a busy tile) is open: nothing.
  await k('Meta+w')
  await h.waitDialog(ctx, '.dialog.close-busy')
  await k('Meta+q')
  await ctx.sleep(300) // absence: no quit dialog follows
  h.assert((await dialogs()) === 1 && !(await ctx.page.isVisible('.dialog.quit')), 'no quit dialog over it')
  await ctx.page.keyboard.press('Escape')
  await h.waitNoDialog(ctx)

  // Window close (red button) asks the same; Quit quits.
  await rpc(ctx.instance, 'window-close')
  await h.eventually(ctx, async () => {
    h.assert(alive() && (await ctx.page.isVisible('.dialog.quit')), 'window close asks')
    h.assert((await h.list(ctx)).tiles.some((t) => t.id === b), 'window kept meanwhile')
  })
  await ctx.page.click('.dialog .confirm')
  await h.eventually(ctx, async () => h.assert(!alive(), 'Quit quits'))
}
