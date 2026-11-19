// Content roots (DIRECTORIES.md, record 2026-11-13): the frame root is the context tile's cwd when
// it holds the file, else the file's folder; navigation keeps the root while inside it; `--root`
// explicit (must hold the file); a `/` root asks: Stop / Use file directory / Open anyway. Markdown
// images and html assets a folder up load under a wide root.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const hiddenWindow = true

export default async (ctx, h) => {
  const R = join(process.cwd(), 'tmp', `cwd-roots-${process.pid}`)
  const proj = join(R, 'proj')
  mkdirSync(join(proj, 'docs'), { recursive: true })
  mkdirSync(join(proj, 'other'), { recursive: true })
  mkdirSync(join(R, 'outside'), { recursive: true })
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>'
  writeFileSync(join(proj, 'img.svg'), svg)
  writeFileSync(join(proj, 'docs', 'a.md'), '# A\n\n![up](../img.svg)\n\n[sib](../other/b.md)\n')
  writeFileSync(join(proj, 'other', 'b.md'), '# B\n\n[out](../../outside/c.md)\n')
  writeFileSync(join(R, 'outside', 'c.md'), '# C\n')
  writeFileSync(join(proj, 'docs', 'p.html'), '<!doctype html><title>p</title><img src="../img.svg">')
  const a = join(proj, 'docs', 'a.md')
  const tok = (src) => /^tie-content:\/\/([0-9a-f]{32})\//.exec(src)?.[1]
  const imgs = async (id) => (await h.contentFrame(ctx, id)).evaluate(() => [...document.querySelectorAll('#doc img')].map((i) => i.getAttribute('src')))
  const rootOf = async (id) => (await h.tileOf(ctx, id)).doc?.root ?? (await h.tileOf(ctx, id)).page?.root
  try {
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)

    // cwd holds the file: root = cwd; the image a folder up loads, from the document's place in it.
    let id = (await ctx.tie('add', a, '--at', t0, '--side', 'r', '--cwd', proj)).id
    await h.waitMd(ctx, id, 'A')
    h.assert((await rootOf(id)) === proj, `root = cwd: ${await rootOf(id)}`)
    let srcs = await imgs(id)
    h.assert(srcs.length === 1 && srcs[0].endsWith('/img.svg') && tok(srcs[0]), `../img.svg loads under the wide root: ${srcs}`)
    const token0 = tok(srcs[0])
    await ctx.shot('wide-root')

    // Link inside the root (another folder): no confirm (B shows without one being answered), same
    // token (the frame's origin), root kept.
    const frameTok = async () => tok((await h.contentFrame(ctx, id)).url())
    const ft0 = await frameTok()
    h.assert(ft0 === token0, `frame token = the image's: ${ft0} vs ${token0}`)
    await h.clickIn(ctx, await h.contentFrame(ctx, id), 'a >> text=sib')
    await h.waitMd(ctx, id, 'B')
    h.assert((await frameTok()) === ft0, `inside the root: same token (${await frameTok()})`)
    h.assert((await rootOf(id)) === proj, 'root kept')
    // Link outside the root: confirm, then its folder (cwd doesn't hold it): new token.
    await h.clickIn(ctx, await h.contentFrame(ctx, id), 'a >> text=out')
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.open-file'), 'outside the root: confirm')
    await h.waitFor(ctx, () => ctx.page.$eval('.dialog .confirm', (b) => !b.disabled), 'armed')
    await ctx.page.click('.dialog .confirm')
    await h.waitMd(ctx, id, 'C')
    h.assert((await rootOf(id)) === join(R, 'outside'), `outside: the file's folder: ${await rootOf(id)}`)
    // Back into the cwd: the rule again.
    await h.press(ctx, 'Meta+[')
    await h.waitMd(ctx, id, 'B')
    h.assert((await rootOf(id)) === proj, `back inside: cwd again: ${await rootOf(id)}`)
    await ctx.tie('close', '--tile', id)

    // cwd doesn't hold the file: root = its folder; the image a folder up is a placeholder.
    id = (await ctx.tie('add', a, '--at', t0, '--side', 'r', '--cwd', join(R, 'outside'))).id
    await h.waitMd(ctx, id, 'A')
    h.assert((await rootOf(id)) === join(proj, 'docs'), `root = folder: ${await rootOf(id)}`)
    srcs = await imgs(id)
    h.assert(srcs.length === 0, `../img.svg blocked under the folder root: ${srcs}`)
    await ctx.tie('close', '--tile', id)

    // --root: explicit; must hold the file.
    const bad = await h.tieError(ctx, 'add', a, '--root', join(proj, 'other'))
    h.assert(/--root does not hold the file/.test(bad ?? ''), `--root not holding: ${bad}`)
    const term = await h.tieError(ctx, 'add', 'terminal', '--root', proj)
    h.assert(/--root: file tiles only/.test(term ?? ''), `--root on a terminal: ${term}`)
    id = (await ctx.tie('add', a, '--at', t0, '--side', 'r', '--root', proj, '--cwd', join(R, 'outside'))).id
    await h.waitMd(ctx, id, 'A')
    h.assert((await rootOf(id)) === proj && tok((await imgs(id))[0]) !== token0, `--root: ${await rootOf(id)}`)
    await ctx.tie('close', '--tile', id)

    // Root /: the question. Stop (default, Escape too) → error tile; Use file directory → the
    // folder; Open anyway → /.
    const slash = async (choice) => {
      const p = ctx.tie('add', a, '--at', t0, '--side', 'r', '--cwd', '/')
      await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.root-slash'), 'root / dialog')
      h.assert((await ctx.page.evaluate(() => document.activeElement?.dataset.value)) === 'stop', 'Stop focused')
      if (choice === 'escape') await ctx.page.keyboard.press('Escape')
      else await ctx.page.click(`.dialog.root-slash button[data-value="${choice}"]`)
      return (await p).id
    }
    id = await slash('escape')
    await h.waitFor(ctx, () => ctx.page.isVisible(`.tile[data-id="${id}"] .tile-error`), 'Stop: error tile')
    h.assert(/Stopped/.test(await ctx.page.textContent(`.tile[data-id="${id}"] .tile-error`)), 'error names the stop')
    await ctx.shot('slash-stopped')
    await ctx.tie('close', '--tile', id)
    id = await slash('dir')
    await h.waitMd(ctx, id, 'A')
    h.assert((await rootOf(id)) === join(proj, 'docs') && (await imgs(id)).length === 0, `Use file directory: ${await rootOf(id)}`)
    await ctx.tie('close', '--tile', id)
    id = await slash('open')
    await h.waitMd(ctx, id, 'A')
    srcs = await imgs(id)
    h.assert((await rootOf(id)) === '/' && srcs.length === 1 && srcs[0].endsWith(join(proj, 'img.svg')), `Open anyway: root /, image by full path: ${srcs}`)
    await ctx.tie('close', '--tile', id)

    // Html: the page's assets a folder up load under the wide root; the nav lock widens with it.
    id = (await ctx.tie('add', join(proj, 'docs', 'p.html'), '--at', t0, '--side', 'r', '--cwd', proj)).id
    const hf = await h.htmlFrame(ctx, id)
    h.assert((await rootOf(id)) === proj, `html root = cwd: ${await rootOf(id)}`)
    const up = await hf.evaluate(() => fetch('../img.svg').then((r) => r.status, () => 'threw'))
    const out = await hf.evaluate(() => fetch('../../outside/c.md').then((r) => r.status, () => 'threw'))
    h.assert(up === 200 && out !== 200, `html: ../img.svg ${up}, outside ${out}`)
    await ctx.tie('close', '--tile', id)
  } finally {
    rmSync(R, { recursive: true, force: true })
  }
}
