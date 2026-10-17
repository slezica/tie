// Spike S1b (P0, viewers plan): as spike-html-origin, with tie-content registered
// `supportFetchAPI`. Same-origin fetch/XHR, cross-token reads, opaque frames. Records facts.
import { rmSync } from 'node:fs'
import { setup, frameOn, results } from './spike-html-origin.mjs'

export const env = { TIE_SPIKE: 'html,fetch' }

export default async (ctx, h) => {
  const root = await setup(ctx)
  try {
    const own = await frameOn(ctx, root, 'allow-scripts allow-same-origin')
    const other = await frameOn(ctx, root, 'allow-scripts allow-same-origin')
    const opaque = await frameOn(ctx, root, 'allow-scripts')
    const ro = await results(own.fr)
    const rq = await results(opaque.fr)
    // Cross-token: another tile's origin (no CORS on the scheme).
    const cross = await own.fr.evaluate((t) => fetch(`tie-content://${t}/data.json`).then((r) => 'ok ' + r.status, (e) => 'threw ' + e.message), other.token)
    const viewer = await own.fr.evaluate(() => fetch('/_tie/probe.js').then((r) => 'ok ' + r.status, (e) => 'threw ' + e.message))
    const facts = { own: ro, opaque: rq, cross, viewer }
    ctx.log(JSON.stringify(facts, null, 2))
    h.assert(ro.fetch === 'ok 42' && ro.xhr === 'ok 200', `own: same-origin fetch/XHR work (${ro.fetch}, ${ro.xhr})`)
    h.assert(/^threw/.test(cross), `cross-token fetch refused (${cross})`)
    h.assert(/^threw/.test(rq.fetch), `opaque: fetch still fails (${rq.fetch})`)
    return facts
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
