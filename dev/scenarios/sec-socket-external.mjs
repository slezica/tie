// Security: allowExternalControl off → socket callers outside Tie terminals (scripts, other apps,
// this harness) are refused, dev methods included; tie inside a Tie terminal still works.
import { rpc } from '../lib.mjs'

export const settings = { allowExternalControl: false }

export default async (ctx, h) => {
  const refused = async (method) => {
    try {
      await rpc(ctx.instance, method)
      return null
    } catch (e) {
      return e.message
    }
  }
  for (const m of ['list', 'frames', 'input']) {
    const err = await refused(m)
    h.assert(/External control is off/.test(err ?? ''), `${m} refused: ${err}`)
  }
  h.assert(/\[security\] refused external caller/.test(ctx.appLog()), 'refusal logged')

  // bin/tie from outside: readable error, exit 1.
  const cli = await ctx.tieRaw(['list'])
  h.assert(cli.code === 1 && cli.err === 'tie: External control is off (Settings → Security)', `cli error: ${JSON.stringify(cli)}`)

  // Inside a Tie terminal: allowed (lineage).
  const a = await ctx.page.evaluate(() => document.querySelector('.tile').dataset.id)
  await h.waitFor(ctx, async () => (await h.screen(ctx, a)).trim(), 'shell prompt') // screen only: tie list is refused here
  await ctx.page.keyboard.type('clear; tie list\n')
  const out = await h.waitFor(ctx, async () => {
    const s = await h.screen(ctx, a)
    return s.includes('STATE') && s.includes(a) ? s : null
  }, 'tie list in a terminal', 6000)
  h.assert(!/External control/.test(out), 'no refusal inside Tie')
}
