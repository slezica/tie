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
    const id = (await ctx.tie('add', 'probe', '--root', root)).id
    const f = await h.contentFrame(ctx, id)
    const token = new URL(f.url()).host
    const img = (path) => f.evaluate((src) => new Promise((r) => Object.assign(new Image(), { onload: () => r('load'), onerror: () => r('error'), src })), `tie-content://${token}${path}`)

    for (const p of ['/ok.svg', '/sub/ok.svg', '/sub/../ok.svg', '/inner-link.svg']) h.assert((await img(p)) === 'load', `inside root loads: ${p}`)
    // Refused, each by its own layer: the reason main logs (content.ts `refuse`) ties the case to it,
    // so removing either layer turns its cases red even though the other might still refuse them.
    // - `route`: @core/content contentFile (decoded once; leftover %, backslash refused; containment
    //   after resolving; /_tie/ and the root itself refused).
    // - `outside root`: main's real-path check (realpath + isInside): symlinks out of the root.
    // - `not found`: the same check, a path that doesn't resolve (missing file): refused, not an escape.
    // - `parser`: the URL parser drops dot segments (`..`, `%2e%2e`) before Tie sees the path: the
    //   request is /outside.svg inside the root (missing there: `not found`). Chromium's, not a Tie layer.
    const refused = [
      ['/..%2foutside.svg', 'route'],
      ['/sub/..%2f..%2foutside.svg', 'route'],
      ['/%252e%252e/outside.svg', 'route'],
      ['/..%5coutside.svg', 'route'],
      ['/', 'route'],
      ['/_tie/markdown.js', 'route'],
      ['/_tie/markdown-mermaid.js', 'route'],
      ['/link.svg', 'outside root'],
      ['/dirlink/outside.svg', 'outside root'],
      ['/missing.svg', 'not found'],
      ['/../outside.svg', 'parser'],
      ['/%2e%2e/outside.svg', 'parser'],
      ['/_tie/../outside.svg', 'parser'],
    ]
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    for (const [p, layer] of refused) {
      h.assert((await img(p)) === 'error', `refused: ${p}`)
      const seen = layer === 'parser' ? '/outside.svg' : p
      const why = layer === 'parser' ? 'not found' : layer
      await h.waitLog(ctx, new RegExp(`\\[security\\] refused content ${why} tie-content://${token}${esc(seen)}$`, 'm'))
    }
    h.assert(!new RegExp(`refused content [a-z ]+ tie-content://${token}/(\\.\\.|%2e%2e)/`, 'i').test(ctx.appLog()), 'dot segments never reach Tie (URL parser)')

    // Closed tile: its token is forgotten (frame for it refused too).
    const url = f.url()
    await ctx.tie('close', '--tile', id)
    await h.eventually(ctx, async () => h.assert(ctx.appLog().includes(`[content] close ${token.slice(0, 8)}`), 'token forgotten on close'))
    await ctx.page.evaluate((src) => document.body.append(Object.assign(document.createElement('iframe'), { src, sandbox: 'allow-scripts' })), url)
    await h.eventually(ctx, async () => h.assert(ctx.appLog().includes(`blocked navigation subframe ${url}`), 'dead token: frame refused'))

    // Bad root: failure stays visible.
    const bad = (await ctx.tie('add', 'probe', '--root', join(dir, 'missing'))).id
    await h.eventually(ctx, async () => {
      const t = (await h.list(ctx)).tiles.find((t) => t.id === bad)
      h.assert(/Directory not found/.test(t?.error ?? ''), `bad root shows error: ${JSON.stringify(t)}`)
      h.assert(await ctx.page.isVisible(`.tile[data-id="${bad}"] .tile-error`), 'error visible')
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
