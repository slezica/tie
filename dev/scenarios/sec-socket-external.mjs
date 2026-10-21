// Security: allowExternalControl off → socket callers outside Tie terminals (scripts, other apps,
// this harness) are refused, dev methods included; tie inside a Tie terminal still works.
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { ROOT, rpc } from '../lib.mjs'

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
  const env = { ...process.env, TIE_INSTANCE: ctx.instance }
  delete env.TIE_SOCKET
  delete env.TIE_TILE
  const cli = await new Promise((r) => execFile(join(ROOT, 'bin/tie'), ['list'], { env }, (err, _o, stderr) => r({ code: err?.code, stderr })))
  h.assert(cli.code === 1 && cli.stderr.trim() === 'tie: External control is off (Settings → Security)', `cli error: ${JSON.stringify(cli)}`)

  // Inside a Tie terminal: allowed (lineage).
  const a = await ctx.page.evaluate(() => document.querySelector('.tile').dataset.id)
  await ctx.sleep(800)
  await ctx.page.keyboard.type('clear; tie list\n')
  const out = await h.waitFor(ctx, async () => {
    const s = await h.screen(ctx, a)
    return s.includes('STATE') && s.includes(a) ? s : null
  }, 'tie list in a terminal', 6000)
  h.assert(!/External control/.test(out), 'no refusal inside Tie')
}
