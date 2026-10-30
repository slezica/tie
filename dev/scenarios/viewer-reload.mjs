// Dev hot path for viewers: a rebuilt viewer file under out/viewers (what `dev/viewers.mjs --watch`
// writes) makes main push `content:viewer`; every file view of that kind reloads its frame (new
// token) with the new html and its scroll position restored (viewer's `scrolled` reports).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../lib.mjs'

// Rewrites out/viewers/markdown.html, which every instance serves: run alone (test --e2e).
export const exclusive = true

export default async (ctx, h) => {
  const page = join(ROOT, 'out/viewers/markdown.html')
  const original = readFileSync(page, 'utf8')
  try {
    const a = (await ctx.tie('add', join(ROOT, 'dev/samples/markdown.md'))).id
    const b = (await ctx.tie('add', join(ROOT, 'docs/SHELF.md'))).id
    for (const id of [a, b]) await h.waitFor(ctx, async () => (await h.mdState(ctx, id)).renders > 0, `${id} rendered`)
    const fa = await h.contentFrame(ctx, a)
    const ua = fa.url()
    const ub = (await h.contentFrame(ctx, b)).url()
    await fa.evaluate(() => window.scrollTo(0, 1500))
    await ctx.sleep(600) // throttle: the viewer's scroll report (200 ms) must reach the host

    writeFileSync(page, original.replace('</body>', '<!-- hot test --></body>'))
    await h.waitFor(ctx, async () => (await h.contentFrame(ctx, a)).url() !== ua && (await h.contentFrame(ctx, b)).url() !== ub, 'both markdown frames reloaded (new tokens)')
    await h.eventually(ctx, async () => {
      const na = await (await h.contentFrame(ctx, a)).evaluate(() => ({ h: document.querySelectorAll('h1,h2,h3').length, y: window.scrollY, marker: document.body.innerHTML.includes('hot test') }))
      h.assert(na.h > 10 && na.marker, `reloaded viewer renders the doc with the new html: ${JSON.stringify(na)}`)
      h.assert(Math.abs(na.y - 1500) < 5, `scroll restored (${na.y})`)
      const nb = await (await h.contentFrame(ctx, b)).evaluate(() => ({ h: document.querySelectorAll('h1,h2').length, marker: document.body.innerHTML.includes('hot test') }))
      h.assert(nb.h > 0 && nb.marker, 'the other markdown tile reloaded too')
    }, 6000)

    await ctx.shot('reloaded')
  } finally {
    writeFileSync(page, original)
  }
}
