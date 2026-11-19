// Nav bar (markdown): path shown (not editable), back / forward buttons follow history, reload
// (button, cmd+R) re-reads the file and keeps the scroll, back / forward restore each page's scroll
// (a new page starts at the top), cmd+L does nothing (not editable).
// Terminals have no nav bar; collapsed tiles hide it. Keys: zoom (cmd+= / cmd+0, pill); Shift+Down /
// Shift+Up scroll a third of the tile's height (fast scanning), plain arrows keep the browser's small step.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const hiddenWindow = true // keys: real input routing into the frame

export default async (ctx, h) => {
  const dir = join(process.cwd(), 'tmp', `mdnav-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const filler = Array.from({ length: 80 }, (_, i) => `Line ${i}.`).join('\n\n')
  writeFileSync(join(dir, 'a.md'), `# A\n\n[to b](b.md)\n\n${filler}\n`)
  writeFileSync(join(dir, 'b.md'), `# B\n\n${filler}\n`)
  writeFileSync(join(dir, 'long.md'), '# Long\n\n' + Array.from({ length: 300 }, (_, i) => `Line ${i}.`).join('\n\n') + '\n')
  try {
    const page = ctx.page
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const id = (await ctx.tie('add', join(dir, 'a.md'), '--at', t0, '--side', 'r', '--focus')).id
    await h.waitMd(ctx, id, 'A', 'a.md')
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
    await h.waitMd(ctx, id, 'B', 'b.md')
    b = await bar(id)
    h.assert(b.location === join(dir, 'b.md') && b.back && !b.forward, `after link: ${JSON.stringify(b)}`)

    // Buttons.
    await page.click(`.tile[data-id="${id}"] [data-nav="back"]`)
    await h.waitMd(ctx, id, 'A', 'back button')
    b = await bar(id)
    h.assert(b.location === join(dir, 'a.md') && !b.back && b.forward, `after back: ${JSON.stringify(b)}`)
    await page.click(`.tile[data-id="${id}"] [data-nav="forward"]`)
    await h.waitMd(ctx, id, 'B', 'forward button')
    await page.click(`.tile[data-id="${id}"] [data-nav="back"]`)
    await h.waitMd(ctx, id, 'A', 'back again')
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
    await ctx.tie('focus', '--tile', id)
    await h.press(ctx, 'Meta+r')
    await h.waitFor(ctx, async () => opens() > n0 + 1, 'cmd+R re-reads')
    h.assert(/\[keys\] nav-reload/.test(ctx.appLog()), 'cmd+R is the nav-reload action')
    h.assert((await h.tileOf(ctx, id)).doc.history.length === 2, 'reload adds no history')

    // Back / forward: each page's scroll restored; a pushed page starts at the top.
    const scrollY = async () => (await h.mdState(ctx, id)).scrollY
    const scrollAt = (y) => h.contentFrame(ctx, id).then((f) => f.evaluate((y) => scrollTo(0, y), y))
    await scrollAt(900)
    await page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] iframe`).focus(), id)
    await (await h.contentFrame(ctx, id)).evaluate(() => window.markdown.port.postMessage({ verb: 'followLink', href: 'b.md', newTile: false }))
    await h.waitMd(ctx, id, 'B', 'b.md again')
    h.assert((await scrollY()) === 0, `pushed page at the top (${await scrollY()})`)
    await scrollAt(400)
    await page.click(`.tile[data-id="${id}"] [data-nav="back"]`)
    await h.waitMd(ctx, id, 'A', 'back to a.md')
    h.assert(Math.abs((await scrollY()) - 900) < 5, `back: a.md scroll restored (${await scrollY()})`)
    await page.click(`.tile[data-id="${id}"] [data-nav="forward"]`)
    await h.waitMd(ctx, id, 'B', 'forward to b.md')
    h.assert(Math.abs((await scrollY()) - 400) < 5, `forward: b.md scroll restored (${await scrollY()})`)

    // cmd+L: not editable → nothing takes focus.
    await h.press(ctx, 'Meta+l')
    await h.waitFor(ctx, async () => /\[keys\] nav-location/.test(ctx.appLog()), 'cmd+L reached main')
    await ctx.sleep(200) // absence: nothing takes focus
    h.assert((await page.evaluate(() => document.activeElement?.className)) !== 'location', 'cmd+L: no-op on a read-only location')

    // Collapsed: bar hidden.
    await h.clickButton(ctx, id, 'collapse')
    h.assert(!(await bar(id)).visible, 'collapsed: no nav bar')

    await keys(ctx, h, join(dir, 'long.md'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function keys(ctx, h, f) {
  const id = (await ctx.tie('add', f)).id
  const frame = await h.contentFrame(ctx, id)
  await h.waitFor(ctx, async () => (await h.mdState(ctx, id)).text.includes('Line 299'), 'rendered')
  await h.clickIn(ctx, frame, 'h1') // focus the frame
  await h.waitFor(ctx, () => frame.evaluate(() => document.hasFocus()), 'frame has focus')

  // Zoom: cmd+= twice → 125% (CSS zoom on the root), pill; cmd+0 resets.
  const zoomOf = () => frame.evaluate(() => Number(getComputedStyle(document.documentElement).zoom))
  const zoomPill = () => ctx.page.$$eval(`.tile[data-id="${id}"] .pill:not([hidden])`, (ps) => ps.map((p) => p.textContent).find((t) => /%$/.test(t)) ?? null)
  await h.press(ctx, 'Meta+=')
  await h.press(ctx, 'Meta+=')
  await h.waitFor(ctx, async () => (await zoomOf()) === 1.25, 'cmd+= twice: 125%')
  h.assert((await h.tileOf(ctx, id)).doc.zoom === 1.25 && (await zoomPill()) === '125%', `zoom pill: ${await zoomPill()}`)
  await ctx.shot('zoomed')
  await h.press(ctx, 'Meta+0')
  await h.waitFor(ctx, async () => (await zoomOf()) === 1, 'cmd+0: 100%')
  h.assert((await zoomPill()) === null, 'no zoom pill at 100%')

  const y = async () => (await h.mdState(ctx, id)).scrollY
  const third = await frame.evaluate(() => Math.round(innerHeight / 3))
  // A key's scroll done: the position moved and holds (keyboard scrolling animates): stable over
  // 120 ms, the poll's step.
  const key = async (k) => {
    const prev = await y()
    await ctx.page.keyboard.press(k)
    await h.waitFor(ctx, async () => {
      const a = await y()
      await ctx.sleep(120) // stability window (debounce), not a wait for something
      return a !== prev && a === (await y())
    }, `${k} scrolled`).catch(() => {}) // no scroll: the assertion after it reports
  }

  await key('ArrowDown')
  const small = await y()
  h.assert(small > 0 && small < third / 2, `plain Down: small step (${small}, third ${third})`)
  await key('Shift+ArrowDown')
  const big = (await y()) - small
  h.assert(Math.abs(big - third) <= 2, `Shift+Down scrolls a third (${big}, want ${third})`)
  await key('Shift+ArrowUp')
  h.assert(Math.abs((await y()) - small) <= 2, `Shift+Up back (${await y()}, want ${small})`)
}
