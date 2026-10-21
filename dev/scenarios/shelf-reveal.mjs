// Shelf hover reveal: the pointer travels from the item into the reveal and it stays (terminal,
// markdown frame, browser guest); keys stay with the active tile until a click inside, which pins
// and interacts; leaving item + reveal + band dismisses; pin survives focus keys; reveal above a
// zoomed tile. Hidden window: real pointer input into frames and guests.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../lib.mjs'

export const hiddenWindow = true

export default async (ctx, h) => {
  const page = ctx.page
  const L = () => h.list(ctx)
  const info = async (id) => (await L()).tiles.find((t) => t.id === id)
  const revealed = async () => (await ctx.tie('state')).revealed
  // Tile under a point (the reveal must take the pointer, and be on top).
  const under = (x, y) => page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.tile')?.dataset.id ?? null, [x, y])
  const center = async (id) => {
    const r = await h.rectOf(ctx, id)
    return { x: r.x + r.w / 2, y: r.y + r.h * 0.6 }
  }
  // Pointer: onto the item, then straight into the reveal (across the gap and the peak).
  const into = async (id) => {
    await h.hoverShelf(ctx, id)
    const p = await center(id)
    await page.mouse.move(p.x, p.y, { steps: 25 })
    await ctx.sleep(300)
    return p
  }
  const away = async () => {
    await page.mouse.move(60, 300, { steps: 10 })
    await ctx.sleep(200)
  }

  const dir = join(ROOT, 'tmp', `shelf-reveal-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'doc.md'), '# Reveal\n\nSome text.\n')
  const s = await h.site(ctx, () => '<!doctype html><title>Guest</title><body style="margin:0;height:100vh;background:#c33">guest</body>')
  try {
    const [a] = (await L()).tiles.map((t) => t.id)
    const c = (await ctx.tie('open', 'terminal', '--shelve')).id
    const md = (await ctx.tie('open', join(dir, 'doc.md'), '--shelve')).id
    const w = (await ctx.tie('open', s.url + '/', '--shelve')).id
    await ctx.sleep(1500)

    // Terminal: hover the item, move into the reveal: kept, takes the pointer, not the keys.
    let p = await into(c)
    h.assert((await revealed()) === c, 'terminal reveal kept while the pointer moves into it')
    h.assert((await under(p.x, p.y)) === c, 'hover reveal takes the pointer')
    let l = await L()
    h.assert(l.active === a && !(await info(c)).pinned, 'hover neither pins nor activates')
    await page.keyboard.type('echo to-a\n')
    await h.waitFor(ctx, async () => (await h.screen(ctx, a)).includes('to-a'), 'keys stay with the active tile')
    h.assert(!(await h.screen(ctx, c)).includes('to-a'), 'hover reveal gets no keys')
    await ctx.shot('hover-in-reveal')

    // Click inside: pins + activates; typing reaches its terminal; the pin survives leaving.
    await page.mouse.click(p.x, p.y)
    await ctx.sleep(200)
    l = await L()
    h.assert((await info(c)).pinned && l.active === c, 'click in hover reveal pins + activates')
    await page.keyboard.type('echo reveal-$((6*7))\n')
    await h.waitFor(ctx, async () => (await h.screen(ctx, c)).includes('reveal-42'), 'typed into the revealed terminal')
    await away()
    h.assert((await info(c)).pinned && (await revealed()) === null, 'pin survives the pointer leaving')
    await h.pin(ctx, c) // item click: unpin
    h.assert(!(await info(c)).pinned, 'item click unpins')
    await away()

    // Leaving dismisses: out of the reveal's far side; back over the band to the item, then down the shelf.
    await into(c)
    await away()
    h.assert((await revealed()) === null, 'leaving the reveal dismisses')
    p = await into(c)
    const it = await h.shelfItem(ctx, c)
    await page.mouse.move(it.x, it.y, { steps: 15 })
    await ctx.sleep(150)
    h.assert((await revealed()) === c, 'back across the band to the item: kept')
    const shelf = await page.locator('#shelf').boundingBox()
    await page.mouse.move(it.x, shelf.y + shelf.height - 10, { steps: 6 })
    await ctx.sleep(200)
    h.assert((await revealed()) === null, 'down the shelf column: dismissed')

    // Markdown (content frame): kept while the pointer is over the frame; a click inside pins.
    p = await into(md)
    await page.mouse.move(p.x + 40, p.y + 30, { steps: 5 })
    await ctx.sleep(300)
    h.assert((await revealed()) === md, 'markdown reveal kept over its frame')
    await away()
    h.assert((await revealed()) === null, 'leaving the frame and the reveal dismisses')
    await into(md)
    await h.clickIn(ctx, await h.contentFrame(ctx, md), 'h1')
    l = await L()
    h.assert((await info(md)).pinned && l.active === md, `click in markdown reveal pins + activates (active ${l.active})`)
    await ctx.shot('markdown-pinned')
    await page.mouse.click(60, 300) // outside click (terminal a)
    await ctx.sleep(200)
    h.assert(!(await info(md)).pinned, 'outside click unpins')
    await away()

    // Browser (guest): kept over the guest; a real click inside pins.
    p = await into(w)
    await page.mouse.move(p.x - 30, p.y + 20, { steps: 5 })
    await ctx.sleep(300)
    h.assert((await revealed()) === w, 'browser reveal kept over its guest')
    await page.mouse.click(p.x - 30, p.y + 20)
    await ctx.sleep(400)
    l = await L()
    h.assert((await info(w)).pinned && l.active === w, `click in browser reveal pins + activates (active ${l.active})`)
    await h.pin(ctx, w)
    h.assert(!(await info(w)).pinned, 'unpinned')
    await away()

    // Above a zoomed tile; the pin survives keyboard focus moving off it.
    await h.clickButton(ctx, a, 'zoom')
    p = await into(c)
    h.assert((await under(p.x, p.y)) === c, 'hover reveal above the zoomed tile')
    await page.mouse.click(p.x, p.y)
    await ctx.sleep(200)
    await h.press(ctx, 'Meta+ArrowLeft')
    await ctx.sleep(200)
    l = await L()
    h.assert(l.active === a && (await info(a)).zoomed, `focus key moves to the zoomed tile (active ${l.active})`)
    h.assert((await info(c)).pinned && (await under(p.x, p.y)) === c, 'pinned reveal stays on top after a focus change')
    await ctx.shot('pinned-over-zoomed')
  } finally {
    await s.close()
    rmSync(dir, { recursive: true, force: true })
  }
}
