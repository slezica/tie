// Security: the state dir (~/.config/tie) and what Tie writes there are private to the user
// (0700 / 0600: the socket runs commands as the user; logs hold commands, paths, URLs; settings too); an
// oversized socket request line drops that connection, the server lives on. UI state file (bar
// sizes): 0600 after a write over a 0644 file; main cleans the renderer's payload (known bars, finite
// numbers, clamped; not an object: refused) and writes nothing else.
import { statSync, chmodSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { connect } from 'node:net'
import { stateDir, readInfo, uiStatePath } from '../lib.mjs'

export default async (ctx, h) => {
  const info = readInfo(ctx.instance)
  const mode = (p) => (statSync(p).mode & 0o777).toString(8)
  h.assert(mode(stateDir) === '700', `state dir 0700 (${mode(stateDir)})`)
  h.assert(mode(info.socket) === '600', `socket 0600 (${mode(info.socket)})`)
  h.assert(mode(`${stateDir}/${ctx.instance}.json`) === '600', `info file 0600`)
  h.assert(mode(info.log) === '600', `log 0600 (${mode(info.log)})`)
  // Settings file: 0600 after a Save, even over a file an editor left world-readable (the harness seed: 0644).
  const settings = (await ctx.page.evaluate(() => window.tie.settings.get())).path
  chmodSync(settings, 0o644)
  await h.openSettings(ctx)
  await ctx.page.locator('#set-gitignore').evaluate((e) => e.click()) // a change: Save is enabled only with one
  await ctx.page.locator('.save').click()
  await h.waitFor(ctx, () => mode(settings) === '600', `settings file 0600 after Save (${mode(settings)})`)

  // A line over the cap: connection dropped, nothing executed; the next client is fine.
  const dropped = await new Promise((resolve) => {
    const c = connect(info.socket)
    c.on('error', () => {})
    c.on('close', () => resolve(true))
    c.on('connect', () => c.write('{"jsonrpc":"2.0","id":1,"method":"add","params":{"kind":"terminal","cmd":"' + 'A'.repeat(1100 * 1024) + '"}'))
    setTimeout(() => resolve(false), 3000) // no-op once closed
  })
  h.assert(dropped, 'oversized request line: connection dropped')
  h.assert((await h.list(ctx)).tiles.length === 1, 'nothing opened by it')
  h.assert(/line too long/.test(ctx.appLog()), 'logged')

  // UI state file: written by main only, 0600 even over a world-readable file.
  const ui = uiStatePath(ctx.instance)
  const uiText = () => readFileSync(ui, 'utf8')
  writeFileSync(ui, '{}')
  chmodSync(ui, 0o644)
  const set = (p) => ctx.page.evaluate((p) => window.tie.ui.setBarSizes(p), p)
  let r = await set({ top: 50 })
  h.assert(r.top === 50, `valid size taken: ${JSON.stringify(r)}`)
  h.assert(mode(ui) === '600', `ui state file 0600 after a write (${mode(ui)})`)
  // Hostile payload: strings, NaN, Infinity, huge numbers, unknown keys, nested objects: cleaned.
  r = await set({ top: 'x', bottom: 1e12, left: NaN, right: 50, evil: 1, nested: { a: 1 }, toString: 5 })
  const want = { top: 50, bottom: 60, left: 160, right: 50 }
  h.assert(JSON.stringify(r) === JSON.stringify(want), `hostile payload cleaned: ${JSON.stringify(r)}`)
  h.assert(JSON.stringify(JSON.parse(uiText())) === JSON.stringify({ bars: want }), `file holds the cleaned sizes only: ${uiText()}`)
  h.assert(/\[security\] ui state: dropped .*top, left, evil, nested, toString/.test(ctx.appLog()), 'dropped fields logged')
  r = await set({ top: Infinity, bottom: -Infinity })
  h.assert(JSON.stringify(r) === JSON.stringify(want), `Infinity dropped: ${JSON.stringify(r)}`)
  // Not an object: refused, nothing written.
  const before = uiText()
  for (const p of ['x', [40, 40, 160, 160], null, 7]) {
    r = await set(p)
    h.assert(JSON.stringify(r) === JSON.stringify(want), `refused ${JSON.stringify(p)}: sizes unchanged`)
  }
  h.assert(uiText() === before, 'refused payloads: file unchanged')
  h.assert((ctx.appLog().match(/\[security\] refused ui state/g) ?? []).length === 4, 'refusals logged')
  // Nothing else of this instance in the state dir: socket, info file, ui state file.
  const mine = readdirSync(stateDir).filter((f) => f.startsWith(`${ctx.instance}.`)).sort()
  h.assert(mine.join() === [`${ctx.instance}.json`, `${ctx.instance}.sock`, `${ctx.instance}.ui.json`].join(), `state dir: ${mine}`)
}
