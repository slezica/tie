// Nav bar (markdown): path shown (not editable), back / forward buttons follow history, reload
// (button, cmd+R) re-reads the file and keeps the scroll, cmd+L does nothing (not editable).
// Terminals have no nav bar; collapsed tiles hide it.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export default async (ctx, h) => {
  const dir = join(process.cwd(), 'tmp', `mdnav-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const filler = Array.from({ length: 80 }, (_, i) => `Line ${i}.`).join('\n\n')
  writeFileSync(join(dir, 'a.md'), `# A\n\n[to b](b.md)\n\n${filler}\n`)
  writeFileSync(join(dir, 'b.md'), '# B\n')
  try {
    const page = ctx.page
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const id = (await ctx.tie('add', join(dir, 'a.md'), '--at', t0, '--side', 'r', '--focus')).id
    const shows = (title) => () => h.mdState(ctx, id).then((s) => s.text.startsWith(title))
    await h.waitFor(ctx, shows('A'), 'a.md')
    const bar = (id) =>
      page.evaluate((id) => {
        const t = document.querySelector(`.tile[data-id="${id}"]`)
        const b = t.querySelector('.navbar')
        if (!b) return null
        const btn = (n) => b.querySelector(`[data-nav="${n}"]`).disabled
        const r = b.getBoundingClientRect()
        const f = t.querySelector('.body').getBoundingClientRect()
        return { location: b.querySelector('.location').value, readOnly: b.querySelector('.location').readOnly, back: !btn('back'), forward: !btn('forward'), visible: r.height > 0, below: f.top >= r.bottom - 1 }
      }, id)

    // Shown under the title bar; path, read-only; nothing to go back to. Terminals: no bar.
    let b = await bar(id)
    h.assert(b && b.visible && b.below && b.location === join(dir, 'a.md') && b.readOnly && !b.back && !b.forward, `markdown bar: ${JSON.stringify(b)}`)
    h.assert((await bar(t0)) === null, 'terminal: no nav bar')
    await ctx.shot('nav')

    // Follow a link (as a click would: frame focused, request over the port).
    await page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] iframe`).focus(), id)
    await (await h.contentFrame(ctx, id)).evaluate(() => window.markdown.port.postMessage({ verb: 'followLink', href: 'b.md', newTile: false }))
    await h.waitFor(ctx, shows('B'), 'b.md')
    b = await bar(id)
    h.assert(b.location === join(dir, 'b.md') && b.back && !b.forward, `after link: ${JSON.stringify(b)}`)

    // Buttons.
    await page.click(`.tile[data-id="${id}"] [data-nav="back"]`)
    await h.waitFor(ctx, shows('A'), 'back button')
    b = await bar(id)
    h.assert(b.location === join(dir, 'a.md') && !b.back && b.forward, `after back: ${JSON.stringify(b)}`)
    await page.click(`.tile[data-id="${id}"] [data-nav="forward"]`)
    await h.waitFor(ctx, shows('B'), 'forward button')
    await page.click(`.tile[data-id="${id}"] [data-nav="back"]`)
    await h.waitFor(ctx, shows('A'), 'back again')
    h.assert((await page.evaluate(() => document.activeElement?.tagName)) !== 'BUTTON', 'buttons never take focus')

    // Reload: the file is read again (new doc), rendered as a page, scroll kept.
    const fr = await h.contentFrame(ctx, id)
    await fr.evaluate(() => scrollTo(0, 600))
    await ctx.sleep(300) // throttle: the viewer reports its scroll at most every 200 ms
    const opens = () => (ctx.appLog().match(/\[docs\] open \d+ markdown \S+\/a\.md/g) ?? []).length
    const n0 = opens()
    const r0 = (await h.mdState(ctx, id)).renders
    await page.click(`.tile[data-id="${id}"] [data-nav="reload"]`)
    await h.waitFor(ctx, async () => opens() > n0 && (await h.mdState(ctx, id)).renders > r0, 'reload button re-reads')
    const y1 = (await h.mdState(ctx, id)).scrollY
    h.assert(Math.abs(y1 - 600) < 5, `reload keeps the scroll (${y1})`)
    await ctx.tie('focus', id)
    await h.press(ctx, 'Meta+r')
    await h.waitFor(ctx, async () => opens() > n0 + 1, 'cmd+R re-reads')
    h.assert(/\[keys\] nav-reload/.test(ctx.appLog()), 'cmd+R is the nav-reload action')
    h.assert((await h.tileOf(ctx, id)).doc.history.length === 2, 'reload adds no history')

    // cmd+L: not editable → nothing takes focus.
    await h.press(ctx, 'Meta+l')
    await h.waitFor(ctx, async () => /\[keys\] nav-location/.test(ctx.appLog()), 'cmd+L reached main')
    await ctx.sleep(200) // absence: nothing takes focus
    h.assert((await page.evaluate(() => document.activeElement?.className)) !== 'location', 'cmd+L: no-op on a read-only location')

    // Collapsed: bar hidden.
    await h.clickButton(ctx, id, 'collapse')
    h.assert(!(await bar(id)).visible, 'collapsed: no nav bar')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
