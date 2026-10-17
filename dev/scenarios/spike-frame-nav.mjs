// Spike S3 (P0, viewers plan): a content frame navigating itself to http(s) (location, link click
// with a gesture). Does will-frame-navigate see it (URL, deniable)? What else does main get? Where
// does the frame end? Plus in-root navigation (html spike rule) for comparison.
import { rmSync } from 'node:fs'
import { setup, frameOn } from './spike-html-origin.mjs'

export const env = { TIE_SPIKE: 'html,nav' }

export default async (ctx, h) => {
  const p = await h.probe(ctx)
  const root = await setup(ctx)
  try {
    const page = ctx.page
    const cases = {}
    const go = async (name, how) => {
      const f = await frameOn(ctx, root, 'allow-scripts allow-same-origin')
      const target = `${p.url}/${name}`
      const s = await page.context().newCDPSession(f.fr)
      const expr =
        how === 'location'
          ? `location.href = ${JSON.stringify(target)}`
          : `(() => { const a = Object.assign(document.createElement('a'), { href: ${JSON.stringify(target)} }); document.body.append(a); a.click() })()`
      await s.send('Runtime.evaluate', { expression: expr, userGesture: how === 'click' }).catch(() => {})
      await s.detach().catch(() => {})
      await ctx.sleep(800)
      const log = ctx.appLog()
      const has = (re) => log.split('\n').some((l) => l.includes(target) && re.test(l))
      cases[name] = {
        willFrameNavigate: has(/blocked navigation subframe/),
        didStart: has(/did-start-navigation/),
        failProvisional: (log.split('\n').find((l) => l.includes(target) && /did-fail-provisional-load/.test(l)) ?? '').replace(/^.*did-fail-provisional-load /, ''),
        failLoad: has(/did-fail-load/),
        frameNow: f.fr.isDetached() ? '(detached)' : f.fr.url(),
      }
    }
    await go('loc', 'location')
    await go('click', 'click')
    const inRoot = await frameOn(ctx, root, 'allow-scripts allow-same-origin')
    await inRoot.fr.evaluate(() => (location.href = './sub.html')).catch(() => {})
    await ctx.sleep(800)
    ctx.log(JSON.stringify(cases, null, 2))
    await p.assertUntouched('frame navigation')
    for (const [k, c] of Object.entries(cases)) {
      h.assert(!c.willFrameNavigate, `${k}: will-frame-navigate never fires (shell CSP frame-src refuses first)`)
      h.assert(c.didStart && /-30/.test(c.failProvisional), `${k}: main sees did-start-navigation + did-fail-provisional-load -30 with the URL (${JSON.stringify(c)})`)
      h.assert(c.frameNow.startsWith('chrome-error:'), `${k}: frame ends on an error page (${c.frameNow})`)
    }
    h.assert(/frame html allowed \S+\/sub\.html/.test(ctx.appLog()), 'in-root: will-frame-navigate sees it (nav lock decides)')
    return cases
  } finally {
    await p.close()
    rmSync(root, { recursive: true, force: true })
  }
}
