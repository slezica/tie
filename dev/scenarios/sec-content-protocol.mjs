// Security: tie-content serves a tile only files inside its root (no traversal, no symlinks out, not
// the root itself, not Tie's other viewer files); closed tiles' tokens are dead; bad roots show an error.
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

export default async (ctx, h) => {
  const dir = join(process.cwd(), 'tmp', `content-${process.pid}`)
  const root = join(dir, 'root')
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>'
  mkdirSync(join(root, 'sub'), { recursive: true })
  writeFileSync(join(root, 'ok.svg'), svg)
  writeFileSync(join(root, 'sub', 'ok.svg'), svg)
  writeFileSync(join(dir, 'outside.svg'), svg)
  symlinkSync(join(dir, 'outside.svg'), join(root, 'link.svg'))
  symlinkSync(dir, join(root, 'dirlink'))
  symlinkSync(join(root, 'ok.svg'), join(root, 'inner-link.svg'))
  try {
    const id = (await ctx.tie('open', 'probe', '--cwd', root)).id
    const f = await h.probeFrame(ctx, id)
    const token = new URL(f.url()).host
    const img = (path) => f.evaluate((src) => new Promise((r) => Object.assign(new Image(), { onload: () => r('load'), onerror: () => r('error'), src })), `tie-content://${token}${path}`)

    for (const p of ['/ok.svg', '/sub/ok.svg', '/sub/../ok.svg', '/inner-link.svg']) h.assert((await img(p)) === 'load', `inside root loads: ${p}`)
    const refused = ['/../outside.svg', '/..%2foutside.svg', '/%2e%2e/outside.svg', '/sub/..%2f..%2foutside.svg', '/%252e%252e/outside.svg', '/..%5coutside.svg', '/link.svg', '/dirlink/outside.svg', '/', '/_tie/markdown.js', '/_tie/../outside.svg']
    for (const p of refused) h.assert((await img(p)) === 'error', `refused: ${p}`)
    const log = ctx.appLog()
    h.assert(/refused content outside root .*\/link\.svg/.test(log) && /refused content outside root .*\/dirlink\/outside\.svg/.test(log), 'symlinks out of root refused (real path check)')
    h.assert(/refused content route .*\/$/m.test(log), 'root itself refused')

    // Closed tile: its token is forgotten (frame for it refused too).
    const url = f.url()
    await ctx.tie('close', id)
    await ctx.sleep(300)
    h.assert(ctx.appLog().includes(`[content] close ${token.slice(0, 8)}`), 'token forgotten on close')
    await ctx.page.evaluate((src) => document.body.append(Object.assign(document.createElement('iframe'), { src, sandbox: 'allow-scripts' })), url)
    await ctx.sleep(400)
    h.assert(ctx.appLog().includes(`blocked navigation subframe ${url}`), 'dead token: frame refused')

    // Bad root: failure stays visible.
    const bad = (await ctx.tie('open', 'probe', '--cwd', join(dir, 'missing'))).id
    await ctx.sleep(500)
    const t = (await h.list(ctx)).tiles.find((t) => t.id === bad)
    h.assert(/Directory not found/.test(t?.error ?? ''), `bad root shows error: ${JSON.stringify(t)}`)
    h.assert(await ctx.page.isVisible(`.tile[data-id="${bad}"] .tile-error`), 'error visible')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
