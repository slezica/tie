// Image tiles: png / svg / ... by extension, fit to the tile (shrink only), click or `z` toggles
// actual size (scrolls), reload on change (new revision, swapped in), broken image says so, picker
// filter = image extensions. Hidden window: real clicks and keys in the frame.
import { mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const hiddenWindow = true

const svg = (w, h, fill) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${fill}"/></svg>`

export default async (ctx, h) => {
  const dir = join(process.cwd(), 'tmp', `image-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const png = join(dir, 'icon.png')
  copyFileSync(join(process.cwd(), 'build/icon.png'), png) // 1024 × 1024
  const pic = join(dir, 'pic.svg')
  writeFileSync(pic, svg(40, 30, 'red'))
  writeFileSync(join(dir, 'bad.png'), 'not a png')
  try {
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const view = (id) => h.contentFrame(ctx, id).then((f) => f.evaluate(() => ({ mode: window.image.mode, natural: window.image.natural, loads: window.image.loads, errors: window.image.errors, rev: window.image.rev, shown: Math.round(document.getElementById('img').getBoundingClientRect().width), info: document.getElementById('info').textContent, y: Math.round(scrollY) })))
    const open = async (path, at = t0) => {
      const id = (await ctx.tie('add', path, '--at', at, '--side', 'r')).id
      await h.waitFor(ctx, () => view(id).then((v) => v.loads || v.errors), `${path} shown`)
      return id
    }

    // PNG larger than the tile: fit (shrunk), info shows size and scale.
    const id = await open(png)
    const t = await h.tileOf(ctx, id)
    h.assert(t.kind === 'image' && t.title === 'icon.png', `image tile: ${JSON.stringify(t)}`)
    let v = await view(id)
    h.assert(v.mode === 'fit' && v.natural.w === 1024 && v.shown < 1024 && /^1024 × 1024 · \d+%$/.test(v.info), `fit: ${JSON.stringify(v)}`)
    await ctx.shot('fit')

    // Click: actual size (scrollable); `z`: back to fit.
    const fr = await h.contentFrame(ctx, id)
    await h.clickIn(ctx, fr, '#img')
    v = await view(id)
    h.assert(v.mode === 'actual' && v.shown === 1024 && v.info === '1024 × 1024', `actual size: ${JSON.stringify(v)}`)
    h.assert((await fr.evaluate(() => document.scrollingElement.scrollHeight > innerHeight)), 'actual size scrolls')
    await ctx.shot('actual')
    await ctx.page.keyboard.press('z')
    await ctx.sleep(200)
    h.assert((await view(id)).mode === 'fit', 'z: fit again')

    // SVG, smaller than the tile: natural size, not enlarged. Rewritten: reloaded (new size).
    const s = await open(pic, id)
    v = await view(s)
    h.assert(v.natural.w === 40 && v.shown === 40 && v.info === '40 × 30', `svg at natural size: ${JSON.stringify(v)}`)
    writeFileSync(pic, svg(60, 20, 'blue'))
    await h.waitFor(ctx, () => view(s).then((x) => x.natural.w === 60 && x.loads === 2), 'svg reloaded on change')
    h.assert((await view(s)).rev !== v.rev, 'new revision')

    // Not an image: message, no crash.
    const b = await open(join(dir, 'bad.png'), s)
    h.assert((await view(b)).errors === 1 && (await h.contentFrame(ctx, b).then((f) => f.isVisible('#msg'))), 'broken image: message')
    h.assert(!(await h.tileOf(ctx, b)).error, 'tile itself fine')

    // File template + picker (any file; kind by extension; harness answers).
    const n = (await h.list(ctx)).tiles.length
    await h.pickNext(ctx, png)
    await h.drag(ctx, await h.template(ctx, 'file'), await h.sidePoint(ctx, t0, 'b'))
    await h.waitFor(ctx, async () => (await h.list(ctx)).tiles.filter((x) => x.kind === 'image').length === 4 && (await h.list(ctx)).tiles.length === n + 1, 'template opens an image')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
