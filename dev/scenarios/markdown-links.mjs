// Markdown links: plain click navigates in the tile (other directories too), cmd+[ / cmd+] go back
// and forward, cmd-click opens a new tile beside, anchors scroll, http(s) goes to the system
// browser, files of other kinds open beside in their kind (text by content, html; and html → markdown
// back), missing targets say so. Keyboard scrolls the focused frame.
// Hidden window: real clicks into the frame.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const hiddenWindow = true

export default async (ctx, h) => {
  const dir = join(process.cwd(), 'tmp', `mdlinks-${process.pid}`)
  mkdirSync(join(dir, 'sub'), { recursive: true })
  const filler = Array.from({ length: 80 }, (_, i) => `Line ${i}.`).join('\n\n')
  writeFileSync(join(dir, 'a.md'), `# A\n\n[to b](b.md) [to c](sub/c.md#part) [jump](#far) [web](https://example.com/ext) [script](run.sh) [page](page.html) [gone](nope.md) [up](../mdlinks-outside-${process.pid}.md)\n\n${filler}\n\n## Far\n\nend\n`)
  writeFileSync(join(dir, 'b.md'), '# B\n\n[back to a](a.md)\n')
  writeFileSync(join(dir, 'sub', 'c.md'), `# C\n\n![dot](dot.svg)\n\n${filler}\n\n## Part\n\nhere\n`)
  writeFileSync(join(dir, 'sub', 'dot.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>')
  writeFileSync(join(dir, 'run.sh'), 'echo hi\n')
  const outside = join(process.cwd(), 'tmp', `mdlinks-outside-${process.pid}.md`)
  writeFileSync(outside, '# Outside\n')
  writeFileSync(join(dir, 'page.html'), '<!doctype html><title>page</title><a id="md" href="b.md" style="display:block;padding:20px">to b.md</a>')
  try {
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const id = (await ctx.tie('add', join(dir, 'a.md'), '--at', t0, '--side', 'r')).id
    const shows = (title) => () => h.mdState(ctx, id).then((s) => s.text.startsWith(title))
    await h.waitFor(ctx, shows('A'), 'a.md')
    const fr = () => h.contentFrame(ctx, id)
    const doc = async () => (await h.tileOf(ctx, id)).doc
    const count = async () => (await h.list(ctx)).tiles.length

    // Plain click: same tile, same directory (same frame).
    const src0 = await ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] iframe`).src, id)
    await h.clickIn(ctx, await fr(), 'a >> text=to b')
    await h.waitFor(ctx, shows('B'), 'b.md in the same tile')
    h.assert((await h.tileOf(ctx, id)).title === 'b.md' && (await count()) === 2, 'title follows, no new tile')
    h.assert((await ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] iframe`).src, id)) === src0, 'same directory: same frame')

    // History keys (through main, frame focused).
    await h.press(ctx, 'Meta+[')
    await h.waitFor(ctx, shows('A'), 'back')
    await h.press(ctx, 'Meta+]')
    await h.waitFor(ctx, shows('B'), 'forward')
    h.assert(JSON.stringify((await doc()).history) === '{"index":1,"length":2}', `history ${JSON.stringify((await doc()).history)}`)
    await h.press(ctx, 'Meta+]') // at the end: nothing
    await ctx.sleep(300)
    h.assert((await doc()).path.endsWith('/b.md'), 'forward at the end: no-op')
    await h.press(ctx, 'Meta+[')
    await h.waitFor(ctx, shows('A'), 'back again')

    // Another directory: new root (frame reloads), relative image loads there, anchor scrolled to.
    await h.clickIn(ctx, await fr(), 'a >> text=to c')
    await h.waitFor(ctx, shows('C'), 'sub/c.md')
    const src1 = await ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] iframe`).src, id)
    h.assert(src1 !== src0, 'other directory: new token')
    const c = await (await fr()).evaluate(() => ({ img: document.querySelector('img')?.naturalWidth, y: scrollY }))
    h.assert(c.img === 8 && c.y > 200, `image from the new folder, scrolled to #part: ${JSON.stringify(c)}`)
    h.assert(JSON.stringify((await doc()).history) === '{"index":1,"length":2}', 'push drops forward entries')
    await h.press(ctx, 'Meta+[')
    await h.waitFor(ctx, shows('A'), 'back to a (frame reloads again)')

    // Anchor: scrolls, nothing else.
    const y0 = (await h.mdState(ctx, id)).scrollY
    await h.clickIn(ctx, await fr(), 'a >> text=jump')
    const y1 = (await h.mdState(ctx, id)).scrollY
    h.assert(y1 > y0 + 200 && (await doc()).path.endsWith('/a.md'), `anchor scrolls (${y0} -> ${y1})`)
    await (await fr()).evaluate(() => scrollTo(0, 0))

    // Keyboard scroll in the focused frame.
    await ctx.page.keyboard.press('PageDown')
    await ctx.sleep(300)
    h.assert((await h.mdState(ctx, id)).scrollY > 100, 'PageDown scrolls the frame')
    await (await fr()).evaluate(() => scrollTo(0, 0))

    // A file outside the document's folder: asks first (full path shown); Cancel → nothing; Open →
    // the same tile (same kind).
    await h.clickIn(ctx, await fr(), 'a >> text=up')
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.open-file'), 'outside link: confirm dialog')
    h.assert((await ctx.page.textContent('.dialog.open-file .url')) === outside && (await ctx.page.evaluate(() => document.activeElement?.className)).includes('cancel'), 'path shown, Cancel focused')
    await ctx.page.click('.dialog .cancel')
    await ctx.sleep(300)
    h.assert((await doc()).path.endsWith('/a.md') && (await count()) === 2, 'Cancel: nothing opened')
    await h.clickIn(ctx, await fr(), 'a >> text=up')
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.open-file'), 'outside link: dialog again')
    await ctx.page.click('.dialog .confirm')
    await h.waitFor(ctx, shows('Outside'), 'Open: outside.md in the same tile')
    await h.press(ctx, 'Meta+[')
    await h.waitFor(ctx, shows('A'), 'back to a.md')

    // External: hover shows the target in the tile's link strip; click asks first, then the system
    // browser (harness: logged). Missing: modal.
    const wb = await (await fr()).locator('a >> text=web').boundingBox()
    await ctx.page.mouse.move(wb.x + 5, wb.y + wb.height / 2)
    await h.waitFor(ctx, async () => (await ctx.page.textContent(`.tile[data-id="${id}"] .link-strip`)) === 'https://example.com/ext', 'link strip shows the URL')
    await h.clickIn(ctx, await fr(), 'a >> text=web')
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.external-open'), 'confirm dialog')
    h.assert((await ctx.page.textContent('.dialog.external-open .url')) === 'https://example.com/ext', 'full URL shown')
    await ctx.page.click('.dialog .confirm')
    await h.waitFor(ctx, async () => ctx.appLog().includes('external open https://example.com/ext'), 'external open')
    await h.clickIn(ctx, await fr(), 'a >> text=gone')
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog-backdrop'), 'missing target: modal')
    h.assert((await ctx.page.textContent('.dialog p')).includes('No such file'), 'says why')
    await ctx.page.click('.dialog .ok')
    h.assert((await count()) === 2 && (await doc()).path.endsWith('/a.md'), 'still on a.md')

    // Cmd-click: new markdown tile beside this one; this one stays.
    await h.clickIn(ctx, await fr(), 'a >> text=to b', { meta: true })
    const nt = await h.waitFor(ctx, async () => (await h.list(ctx)).tiles.find((t) => t.kind === 'markdown' && t.id !== id), 'new tile')
    await h.waitFor(ctx, () => h.mdState(ctx, nt.id).then((s) => s.text.startsWith('B')), 'new tile shows b.md')
    h.assert(nt.state === 'slotted' && (await doc()).path.endsWith('/a.md'), 'beside, original unchanged')
    const tree = (await ctx.tie('state')).tree
    h.assert(JSON.stringify(tree).includes(nt.id), 'slotted in the tree')

    // Other kinds: beside, in their kind (text by content; html), this tile stays. Html → markdown
    // back: beside too.
    await ctx.tie('focus', id)
    await h.clickIn(ctx, await fr(), 'a >> text=script')
    const txt = await h.waitFor(ctx, async () => (await h.list(ctx)).tiles.find((t) => t.kind === 'text' && t.title === 'run.sh'), 'run.sh opens as text beside')
    h.assert(txt.state === 'slotted' && (await doc()).path.endsWith('/a.md'), 'text beside, markdown unchanged')
    await ctx.tie('close', txt.id)
    await ctx.tie('focus', id)
    await h.clickIn(ctx, await fr(), 'a >> text=page')
    const pg = await h.waitFor(ctx, async () => (await h.list(ctx)).tiles.find((t) => t.kind === 'html'), 'page.html opens as html beside')
    const hf = await h.htmlFrame(ctx, pg.id)
    const n0 = (await h.list(ctx)).tiles.filter((t) => t.kind === 'markdown').length
    await h.clickIn(ctx, hf, '#md')
    const back = await h.waitFor(ctx, async () => (await h.list(ctx)).tiles.filter((t) => t.kind === 'markdown').length === n0 + 1 && (await h.list(ctx)).tiles.at(-1), 'html → markdown beside')
    await h.waitFor(ctx, () => h.mdState(ctx, back.id).then((s) => s.text.startsWith('B')), 'shows b.md')
    h.assert((await h.tileOf(ctx, pg.id)).page.path.endsWith('/page.html'), 'html tile stays')
    await ctx.tie('close', back.id)
    await ctx.tie('close', pg.id)

    // History keys on a terminal: nothing.
    await ctx.tie('focus', t0)
    await h.press(ctx, 'Meta+[')
    await ctx.sleep(300)
    h.assert((await count()) === 3, 'cmd+[ on a terminal: no-op')
    await ctx.shot('links')
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(outside, { force: true })
  }
}
