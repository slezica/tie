// Spike S5 (P0, viewers plan): popups from a <webview> guest. Does the guest's
// setWindowOpenHandler fire without user activation? With it (input through main)? Does main see
// guest input (input-event) to time a gesture rule? Hidden window.
import { rpc } from '../lib.mjs'
import { site, webview, guest } from './spike-webview.mjs'

export const env = { TIE_SPIKE: 'webview' }
export const hiddenWindow = true

export default async (ctx, h) => {
  const s = await site()
  try {
    const page = ctx.page
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const t1 = (await ctx.tie('open', 'terminal', '--at', t0, '--side', 'r')).id
    await ctx.sleep(500)
    // No activation: the page opens a popup 300 ms after load by itself.
    await webview(ctx, t1, s.url + '/a?auto')
    await ctx.sleep(500)
    const lines = () => ctx.appLog().split('\n').filter((l) => l.includes('guest window.open')).map((l) => l.replace(/^.*guest window.open /, ''))
    const auto = lines().find((l) => l.includes('/popup-auto')) ?? null

    // Activation through main (guest.sendInputEvent mouse click on the button / link).
    const g = await guest(ctx)
    const box = async (sel) => {
      const gp = page.context().browser().contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith(s.url))
      return gp ? gp.locator(sel).boundingBox() : null
    }
    const pop = await box('#pop')
    if (pop) await rpc(ctx.instance, 'spike', { action: 'guest-click', x: pop.x + 5, y: pop.y + 5 })
    await ctx.sleep(400)
    const blank = await box('#blank')
    if (blank) await rpc(ctx.instance, 'spike', { action: 'guest-click', x: blank.x + 5, y: blank.y + 5 })
    await ctx.sleep(400)
    // Real click (hidden window) on the button: OS-like routing into the guest.
    const r = await h.rectOf(ctx, t1)
    const realBefore = lines().length
    if (pop) await page.mouse.click(r.x + 1 + pop.x + 5, r.y + 31 + pop.y + 5)
    await ctx.sleep(400)
    const all = lines()
    const facts = {
      auto,
      click: all.find((l) => l.includes('/popup-click')) ?? null,
      blank: all.find((l) => l.includes('/popup-blank')) ?? null,
      realClick: all.slice(realBefore).find((l) => l.includes('/popup-click')) ?? null,
      inputEvents: (ctx.appLog().match(/guest input-event \S+/g) ?? []).slice(0, 8),
      guest: g,
      popupsLoaded: s.hits.filter((u) => u.startsWith('/popup')),
    }
    ctx.log(JSON.stringify(facts, null, 2))
    h.assert(!facts.popupsLoaded.length, 'no popup ever loads (handler denies)')
    h.assert(/since input never/.test(facts.auto ?? ''), `no activation: the guest handler still fires, main saw no input (${facts.auto})`)
    const ms = (l) => Number(/since input (\d+)/.exec(l ?? '')?.[1] ?? Infinity)
    h.assert([facts.click, facts.blank, facts.realClick].every((l) => ms(l) < 1000), 'clicks (sendInputEvent, real): input-event seen in main just before the popup')
    return facts
  } finally {
    await s.close()
  }
}
