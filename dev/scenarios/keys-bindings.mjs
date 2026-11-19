// Key bindings (settings `bindings`): hand-edited file sanitized at load; a saved override applies live; invalid, reserved and conflicting ones refused.
export const settings = { bindings: { 'new-tab': 'Cmd+Y', 'split-down': 'Cmd+C', nope: 'Cmd+J', 'close-tab': 'Cmd+d' } }

export default async (ctx, h) => {
  const tiles = async () => (await h.list(ctx)).tiles.length
  const tabs = () => ctx.page.evaluate(() => document.querySelectorAll('.tab').length)
  const get = () => ctx.page.evaluate(() => window.tie.settings.get().then((r) => r.settings.bindings))
  const set = (bindings) => ctx.page.evaluate((b) => window.tie.settings.set({ bindings: b }), bindings)

  // Load: unknown action, reserved and malformed chords dropped; the valid override kept.
  const loaded = await get()
  h.assert(JSON.stringify(loaded) === JSON.stringify({ 'new-tab': 'Cmd+Y' }), `sanitized at load: ${JSON.stringify(loaded)}`)
  const t0 = await tabs()
  await h.press(ctx, 'Meta+y')
  await h.eventually(ctx, async () => h.assert((await tabs()) === t0 + 1, 'cmd+Y: new tab (override from file)'))
  // An unbound key, then one that acts: actions reach the UI in order (one channel) and both run
  // synchronously, so by the second's effect the first was handled.
  const current = async () => { const l = await h.list(ctx); return l.tabs.findIndex((t) => t.current) }
  await h.press(ctx, 'Meta+t')
  await h.press(ctx, 'Meta+1')
  await h.eventually(ctx, async () => h.assert((await current()) === 0, 'cmd+1: first tab'))
  h.assert((await tabs()) === t0 + 1, `cmd+T: default dropped (tabs ${t0 + 1} -> ${await tabs()})`)

  // Saved override applies live; the replaced default stops matching.
  let r = await set({ 'split-right': 'Cmd+K' })
  h.assert(r.ok, `saved: ${JSON.stringify(r)}`)
  const n = await tiles()
  await h.press(ctx, 'Meta+k')
  await h.eventually(ctx, async () => h.assert((await tiles()) === n + 1, 'cmd+K: split (live)'))
  // A split's effect is async (cwd read), so the order check is main's: each action it sends is
  // logged, in order; once cmd+K's split shows, cmd+D's line (if any) is in the log already.
  const actions = () => (ctx.appLog().match(/\[keys\] [a-z0-9-]+$/gm) ?? []).length
  const sent = actions()
  await h.press(ctx, 'Meta+d')
  await h.press(ctx, 'Meta+k')
  await h.eventually(ctx, async () => h.assert((await tiles()) === n + 2, 'cmd+K again: split'))
  h.assert(actions() === sent + 1, `cmd+D: default dropped (actions sent: ${actions() - sent})`)
  await h.press(ctx, 'Meta+t')
  await h.eventually(ctx, async () => h.assert((await tabs()) === t0 + 2, 'cmd+T: back to default (new-tab no longer customized)'))

  // Refused: reserved, bare key, conflict, unknown action. Nothing changes.
  const refused = async (b, re) => {
    const r = await set(b)
    h.assert(!r.ok && r.errors.some((e) => e.field === 'bindings' && re.test(e.message)), `refused ${JSON.stringify(b)}: ${JSON.stringify(r)}`)
  }
  await refused({ 'split-right': 'Cmd+C' }, /Split right: Reserved combination: Cmd\+C/)
  await refused({ 'split-right': 'K' }, /Split right: Needs Cmd or Ctrl/)
  await refused({ 'split-right': 'Cmd+T' }, /Split right and New tab both use Cmd\+T/)
  await refused({ nope: 'Cmd+J' }, /Unknown action: nope/)
  h.assert(JSON.stringify(await get()) === JSON.stringify({ 'split-right': 'Cmd+K' }), 'refused saves change nothing')
  const m = await tiles()
  await h.press(ctx, 'Meta+k')
  await h.eventually(ctx, async () => h.assert((await tiles()) === m + 1, 'cmd+K still bound after refusals'))

  // Conflict resolved by unbinding the other action: saved; null = unbound.
  r = await set({ 'split-right': 'Cmd+T', 'new-tab': null })
  h.assert(r.ok, `conflict resolved by null: ${JSON.stringify(r)}`)
  const t1 = await tabs(), m1 = await tiles()
  await h.press(ctx, 'Meta+t')
  await h.eventually(ctx, async () => h.assert((await tiles()) === m1 + 1, 'cmd+T: split now'))
  h.assert((await tabs()) === t1, 'cmd+T: no new tab')
  await h.waitLog(ctx, /\[keys\] bindings {"split-right":"Cmd\+T","new-tab":null}/, 1)
}
