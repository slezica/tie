// Security: text, image and hex viewers. Hostile text (HTML, scripts, escape sequences, bidi
// overrides) shown literally, nothing runs; SVG with scripts, event handlers and external refs shown
// as an inert image, no request leaves; size caps per kind (text 10 MB, hex 16 MB, image 50 MB:
// CLI error, no tile); main refuses files as another kind (image ← text, text ← binary).
import { mkdirSync, writeFileSync, rmSync, openSync, ftruncateSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'

const MB = 1024 * 1024

export default async (ctx, h) => {
  const p = await h.probe(ctx)
  const dir = join(process.cwd(), 'tmp', `secview-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const hostile = [
    '<script>window.__xss = 1</script>',
    '<img src=x onerror="window.__xss = 2">',
    `<img src="${p.url}/text-img">`,
    '\x1b[31mred\x1b[0m \x1b]0;title\x07 \x1b]8;;http://evil/\x1b\\link\x1b]8;;\x1b\\',
    'access = "user‮ ⁦// admin⁩ ⁦"',
    '&amp; &lt;b&gt;',
  ].join('\n')
  writeFileSync(join(dir, 'hostile.txt'), hostile)
  writeFileSync(join(dir, 'page.html.txt'), `<!doctype html><script>window.__xss = 3</script><img src="${p.url}/html-img">`)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="20" height="20" onload="fetch('${p.url}/onload')">
  <script>fetch('${p.url}/script'); new Image().src = '${p.url}/script-img'</script>
  <image href="${p.url}/image" width="10" height="10"/><image xlink:href="${p.url}/xlink" width="10" height="10"/>
  <style>@import url('${p.url}/import.css'); rect { fill: url('${p.url}/fill#x') }</style>
  <foreignObject width="10" height="10"><iframe xmlns="http://www.w3.org/1999/xhtml" src="${p.url}/iframe"></iframe></foreignObject>
  <a href="${p.url}/link"><rect width="20" height="20"/></a>
</svg>`
  writeFileSync(join(dir, 'evil.svg'), svg)
  // Caps: sparse files just over each kind's limit (and just under, for text).
  const sized = (name, bytes, fill) => {
    const f = join(dir, name)
    if (fill !== undefined) return writeFileSync(f, Buffer.alloc(bytes, fill)), f
    const fd = openSync(f, 'w')
    ftruncateSync(fd, bytes) // zeros: binary
    closeSync(fd)
    return f
  }
  const cli = (...args) =>
    new Promise((r) => {
      const env = { ...process.env, TIE_INSTANCE: ctx.instance }
      delete env.TIE_SOCKET
      delete env.TIE_TILE
      execFile(join(process.cwd(), 'bin/tie'), args, { env, cwd: dir }, (err, stdout, stderr) => r({ code: err?.code ?? 0, out: stdout.trim(), err: stderr.trim() }))
    })
  try {
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)

    // Hostile text: literal. Escapes, controls and bidi overrides visible; no element from the file.
    for (const name of ['hostile.txt', 'page.html.txt']) {
      const id = (await ctx.tie('open', join(dir, name), '--at', t0)).id
      const fr = await h.waitFor(ctx, async () => {
        const f = await h.contentFrame(ctx, id)
        return (await f.evaluate(() => window.text.rev)) && f
      }, `${name} shown`)
      const dom = await fr.evaluate(() => ({
        text: document.getElementById('lines').innerText,
        tags: [...document.querySelectorAll('#lines *')].map((e) => e.tagName).filter((t) => t !== 'DIV' && t !== 'SPAN'),
        attrs: [...document.querySelectorAll('#lines *')].flatMap((e) => [...e.attributes].map((a) => a.name)).filter((a) => a !== 'class' && a !== 'data-k'),
        xss: window.__xss,
      }))
      h.assert(!dom.tags.length && !dom.attrs.length && dom.xss === undefined, `${name}: no markup from the file: ${JSON.stringify(dom)}`)
      if (name === 'hostile.txt') {
        h.assert(dom.text.includes('<script>window.__xss = 1</script>') && dom.text.includes('&amp; &lt;b&gt;'), `HTML shown as text: ${dom.text}`)
        h.assert(dom.text.includes('␛[31mred') && dom.text.includes('␇') && !/\x1b|\x07/.test(dom.text), `escape sequences visible, not raw: ${JSON.stringify(dom.text)}`)
        h.assert(dom.text.includes('⟨U+202E⟩') && dom.text.includes('⟨U+2066⟩') && !/[‮⁦⁩]/.test(dom.text), `bidi controls visible, not applied: ${JSON.stringify(dom.text)}`)
        await ctx.shot('hostile-text')
      }
      await ctx.tie('close', id)
    }

    // SVG: an inert image. Shown (has a size), nothing ran, nothing requested.
    const s = (await ctx.tie('open', join(dir, 'evil.svg'), '--at', t0)).id
    const sv = await h.waitFor(ctx, async () => {
      const f = await h.contentFrame(ctx, s)
      const v = await f.evaluate(() => ({ loads: window.image.loads, natural: window.image.natural, errors: window.image.errors, imgs: document.images.length, frames: document.querySelectorAll('iframe, object, embed').length }))
      return v.loads && v
    }, 'svg shown')
    h.assert(sv.natural.w === 20 && sv.errors === 0 && sv.imgs === 1 && sv.frames === 0, `svg as one <img>: ${JSON.stringify(sv)}`)
    await p.assertUntouched('svg image (scripts, handlers, external refs)')
    h.assert(p.reports.length === 0, 'no script reported in')

    // Caps: over → CLI error (exit 1), nothing opened; text just under its cap opens.
    const before = (await h.list(ctx)).tiles.length
    for (const [f, max] of [
      [sized('big.txt', 10 * MB + 1, 0x61), 10],
      [sized('big.bin', 16 * MB + 1), 16],
      [sized('big.png', 50 * MB + 1), 50],
    ]) {
      const r = await cli('open', f)
      h.assert(r.code === 1 && r.err.includes(`File too large: ${f} (max ${max} MB)`), `cap: ${JSON.stringify(r)}`)
    }
    h.assert((await h.list(ctx)).tiles.length === before, 'over cap: no tiles')
    const ok = await cli('open', sized('under.txt', 10 * MB - 16, 0x62))
    h.assert(ok.code === 0, `under the cap opens: ${JSON.stringify(ok)}`)
    await h.waitFor(ctx, async () => (await h.contentFrame(ctx, ok.out)).evaluate(() => window.text.lines === 1), '10 MB text shown', 20000)
    h.assert(!(await h.tileOf(ctx, ok.out)).error, 'big text: no error')
    await ctx.tie('close', ok.out)

    // Main never shows a file as another kind than allowed (canOpenAs), whatever the UI asks:
    // the doc bridge, called as a tile of that kind would.
    for (const [kind, file, err] of [
      ['image', join(dir, 'hostile.txt'), 'open as image'],
      ['text', join(dir, 'big.bin'), 'open as text'], // binary
      ['hex', join(dir, 'big.png'), 'File too large'], // hex takes any file, within its own cap
      ['text', join(process.cwd(), 'build/icon.png'), 'open as text'],
    ]) {
      const r = await ctx.page.evaluate(([f, k]) => window.tie.doc.open(f, k), [file, kind])
      h.assert(r.error?.includes(err), `${kind} ← ${file}: ${JSON.stringify(r).slice(0, 120)}`)
    }
  } finally {
    await p.close()
    rmSync(dir, { recursive: true, force: true })
  }
}
