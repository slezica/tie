// Settings file edited while Tie runs (SETTINGS.md "File"): never auto-reloaded, never written but by
// Save. The open panel shows a banner (watcher), Save disabled; Ignore keeps the panel's values,
// Reload adopts the file (sanitized, as at startup); main refuses a Save over an unseen edit.
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, SEED } from '../lib.mjs'

// Sanitized to 32 in memory; the file keeps 200 (a load never rewrites it).
export const settings = { fontSize: 200 }

export default async (ctx, h) => {
  const file = join(ROOT, 'tmp', `${ctx.instance}.settings.json`)
  const bytes = () => readFileSync(file, 'utf8')
  const text = (o) => JSON.stringify(o, null, 2) + '\n'
  // As editors save: temp file + rename (new inode; the watcher must survive it).
  const edit = (s) => {
    writeFileSync(`${file}.tmp`, s)
    renameSync(`${file}.tmp`, file)
    return Date.now()
  }
  const banner = () => ctx.page.isVisible('.settings-banner')
  const latencies = []
  const waitBanner = async (t0, on, what) => {
    await h.waitFor(ctx, async () => (await banner()) === on, what)
    latencies.push(Date.now() - t0)
  }
  const font = () => h.cssVar(ctx, '--tile-font-size')
  const DARK = '#22252c'
  const NORD = '#2e3440'

  // Startup: sanitized in memory, file bytes as seeded.
  const seeded = JSON.stringify({ ...SEED, ...settings })
  h.assert(bytes() === seeded, 'startup never writes')
  h.assert((await font()) === '32px', 'fontSize 200 clamped in memory')

  // Open, edit the draft (previews), cancel: nothing written.
  await h.openSettings(ctx)
  const st = await ctx.page.evaluate(() => { const e = document.querySelector('.settings .status'); return { text: e.textContent, title: e.title } })
  h.assert(st.text.startsWith('~/') && st.title.startsWith('/') && st.title.endsWith(st.text.slice(1)), `status line: ~ path, full path in the tooltip: ${JSON.stringify(st)}`)
  h.assert(!(await banner()), 'no banner on a fresh start')
  await ctx.page.selectOption('#set-theme', 'nord')
  await ctx.page.fill('#set-font-size', '20')
  await ctx.page.keyboard.press('Escape')
  await ctx.sleep(300) // absence: a write would land within this
  h.assert(bytes() === seeded, 'open + preview + cancel never write')

  // (a) Panel open, external edit: banner, Save disabled, nothing applied.
  await h.openSettings(ctx)
  const editA = text({ ...SEED, theme: 'nord', fontSize: 18 })
  await waitBanner(edit(editA), true, '(a) banner after an external edit')
  h.assert(await ctx.page.isDisabled('.save'), '(a) Save disabled')
  h.assert((await ctx.page.textContent('.settings-banner .msg')).startsWith('Settings changed in '), '(a) banner text')
  const buttons = await ctx.page.$$eval('.settings-banner button', (bs) => bs.map((b) => b.textContent))
  h.assert(JSON.stringify(buttons) === '["Ignore","Reload"]', `(a) buttons: ${buttons}`)
  await ctx.shot('banner')
  await ctx.sleep(300) // absence: no auto-reload
  h.assert((await h.cssVar(ctx, '--bg')) === DARK && (await font()) === '32px', '(a) edit not applied')
  // Visible on every page.
  await ctx.page.locator('nav button[data-page="security"]').click()
  h.assert(await banner(), '(a) banner on another page')
  await ctx.page.locator('nav button[data-page="appearance"]').click()

  // (b) Ignore: banner gone, Save enabled, file untouched; Save writes the panel's values over the edit.
  await ctx.page.locator('.settings-banner .ignore').click()
  await h.waitFor(ctx, async () => !(await banner()), '(b) Ignore hides the banner')
  h.assert(!(await ctx.page.isDisabled('.save')), '(b) Save enabled')
  h.assert(bytes() === editA, '(b) Ignore never writes')
  await ctx.page.fill('#set-font-size', '14')
  await ctx.page.locator('.save').click()
  await h.eventually(ctx, async () => h.assert(!(await ctx.page.$('.settings')), '(b) Save closes the panel'))
  const savedB = JSON.parse(bytes())
  h.assert(savedB.fontSize === 14 && savedB.theme === 'tie-dark', `(b) panel's values written: ${JSON.stringify(savedB)}`)

  // (e) Own Save never raises the banner.
  await h.openSettings(ctx)
  await ctx.sleep(800) // absence: past the watcher's latency (debounce 100-500 ms) for the Save's write
  h.assert(!(await banner()), '(e) no banner after an own save')
  h.assert((await ctx.page.evaluate(() => window.tie.settings.get())).changed === false, '(e) not changed')

  // (c) External edit, Reload: applied live, sanitized as at startup, panel shows the file, file not rewritten.
  const editC = text({ ...SEED, theme: 'nord', fontSize: 200, allowExternalControl: 'true' })
  await waitBanner(edit(editC), true, '(c) banner')
  await ctx.page.fill('#set-line-height', '1.8') // an unsaved edit: Reload drops it
  await ctx.page.locator('.settings-banner .reload').click()
  await h.eventually(ctx, async () => {
    h.assert(!(await banner()), '(c) banner gone')
    h.assert((await h.cssVar(ctx, '--bg')) === NORD, '(c) theme applied')
    h.assert((await font()) === '32px', `(c) font size sanitized: ${await font()}`)
  })
  h.assert((await ctx.page.inputValue('#set-font-size')) === '32' && (await ctx.page.inputValue('#set-theme')) === 'nord', '(c) panel shows the file (sanitized)')
  h.assert((await ctx.page.inputValue('#set-line-height')) === '1.15', '(c) unsaved panel edit dropped')
  h.assert(!(await ctx.page.isChecked('#set-allow-external')), '(c) allowExternalControl "true" is not true')
  const gotC = (await ctx.page.evaluate(() => window.tie.settings.get())).settings
  h.assert(gotC.allowExternalControl === false && gotC.fontSize === 32, `(c) main sanitized: ${JSON.stringify(gotC)}`)
  h.assert(await ctx.page.isDisabled('.save'), '(c) Save disabled: the panel equals the settings')
  await ctx.page.fill('#set-line-height', '1.3') // a change, so Save's state below is the banner's doing
  h.assert(!(await ctx.page.isDisabled('.save')), '(c) Save enabled by a change')
  h.assert(bytes() === editC, '(c) Reload never writes (file still says 200)')

  // (f) Reload of a file with a syntax error: reason shown, banner stays, Save disabled.
  await waitBanner(edit('{ "theme": "nord", '), true, '(f) banner')
  await ctx.page.locator('.settings-banner .reload').click()
  await h.waitFor(ctx, () => ctx.page.isVisible('.settings-banner .reason'), '(f) reason line')
  h.assert((await ctx.page.textContent('.settings-banner .reason')).startsWith('Syntax errors in the file: '), '(f) reason text')
  h.assert((await banner()) && (await ctx.page.isDisabled('.save')), '(f) banner stays, Save disabled')
  h.assert((await h.cssVar(ctx, '--bg')) === NORD, '(f) nothing applied')
  await ctx.shot('reload-error')

  // (g) The baseline content restored on disk (in place): banner goes away by itself.
  const t0 = Date.now()
  writeFileSync(file, editC)
  await waitBanner(t0, false, '(g) banner gone when the file is back to the baseline')
  h.assert(!(await ctx.page.isDisabled('.save')), '(g) Save enabled')

  // (h) Main's guard: a Save over an unseen edit is refused whatever the button says.
  const editH = text({ ...SEED, fontSize: 16 })
  await waitBanner(edit(editH), true, '(h) banner')
  const res = await ctx.page.evaluate(() => window.tie.settings.set({ fontSize: 20 }))
  h.assert(!res.ok && res.errors[0].field === 'file' && res.errors[0].message.startsWith('Settings changed in '), `(h) refused: ${JSON.stringify(res)}`)
  h.assert(bytes() === editH, '(h) file untouched')
  await ctx.page.keyboard.press('Escape')
  await ctx.page.waitForSelector('.settings', { state: 'detached' })

  // (d) Panel closed: an edit applies nothing; the panel opens with the banner at once.
  const editD = text({ ...SEED, theme: 'solarized-light', fontSize: 22 })
  edit(editD)
  await ctx.sleep(800) // absence: past the watcher's latency, nothing applies
  h.assert((await h.cssVar(ctx, '--bg')) === NORD && (await font()) === '32px', '(d) not applied with the panel closed')
  await h.openSettings(ctx)
  h.assert(await banner(), '(d) banner at first paint')
  h.assert(bytes() === editD, '(d) untouched')
  ctx.log(`watcher latency (ms): ${latencies.join(', ')}`)
}
