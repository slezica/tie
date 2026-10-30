// Security: OS drops never navigate. On a terminal: files become shell-quoted paths, text a paste,
// both through the paste guards. Elsewhere: no-ops.
// Offscreen + CDP can't reach the native navigate-on-drop path (macOS view), so this also asserts
// the mechanism that prevents it: the page claims every native drag (dragover/drop prevented).
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export default async (ctx, h) => {
  const p = await h.probe(ctx)
  const dir = join(process.cwd(), 'tmp', `drop-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const names = ['a b.txt', "it's.txt", '$(touch PWNED).txt', 'esc\x1b[31m.txt']
  for (const n of names) writeFileSync(join(dir, n), '')
  try {
    // Window capture, registered after the app's: sees its defaultPrevented, despite stopPropagation.
    await ctx.page.evaluate(() => {
      window.__ev = []
      for (const k of ['dragover', 'drop']) window.addEventListener(k, (e) => window.__ev.push(`${k}:${e.defaultPrevented}`), true)
    })
    const cdp = await ctx.page.context().newCDPSession(ctx.page)
    const z = (await ctx.tie('add', 'terminal', '--cmd', 'zsh -f')).id
    await h.waitShell(ctx, z)
    // What a drop does is async (paste guard reads settings): each case waits for its outcome.
    const drop = async (at, data) => {
      for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, ...at, data: { dragOperationsMask: 1, items: [], ...data } })
    }
    const onTerm = await h.sidePoint(ctx, z, 'c')

    // Link and text onto the terminal: pasted, never loaded or run.
    await drop(onTerm, { items: [{ mimeType: 'text/uri-list', data: p.url + '/dropped' }] })
    await h.waitText(ctx, z, p.url + '/dropped')
    await drop(onTerm, { items: [{ mimeType: 'text/plain', data: ' echo DROPPED-$((6*7))' }] })
    await h.waitText(ctx, z, 'echo DROPPED-$((6*7))')
    const ev = await ctx.page.evaluate(() => window.__ev)
    h.assert(ev.includes('drop:true') && !ev.some((e) => e.endsWith(':false')), `native drags claimed: ${ev}`)
    await p.assertUntouched('drop')
    h.assert(!/blocked navigation/.test(ctx.appLog()), 'drop never even attempts navigation')
    let s = await h.screen(ctx, z)
    h.assert(s.includes(p.url + '/dropped') && s.includes('echo DROPPED-$((6*7))') && !s.includes('DROPPED-42'), `text pasted, not run: ${s.trim()}`)
    await ctx.page.keyboard.press('Control+u')

    // Files: shell-quoted paths, nothing run.
    await drop(onTerm, { files: names.slice(0, 3).map((n) => join(dir, n)) })
    const q = (n) => `'${join(dir, n).replace(/'/g, `'\\''`)}'`
    await h.eventually(ctx, async () => {
      s = await h.screen(ctx, z)
      for (const n of names.slice(0, 3)) h.assert(s.includes(q(n)), `quoted ${q(n)} in: ${s.trim()}`)
    })
    h.assert(!existsSync(join(process.cwd(), 'PWNED')), 'no command substitution')
    await ctx.page.keyboard.press('Control+u')

    // File name with control chars: paste warning.
    await drop(onTerm, { files: [join(dir, names[3])] })
    await h.eventually(ctx, async () => {
      const w = await h.pasteWarning(ctx)
      h.assert(w?.warnings.includes('control'), `control warning for file name (got ${JSON.stringify(w)})`)
    })
    await ctx.page.click('.dialog.paste-warning button.cancel')

    // Off any tile (shelf): no-op.
    const before = await h.screen(ctx, z)
    const shelf = await h.boxOf(ctx, '#shelf')
    await drop({ x: shelf.x, y: shelf.box.y + shelf.box.height - 20 }, { items: [{ mimeType: 'text/plain', data: 'NOWHERE' }] })
    await ctx.sleep(500) // absence: nothing pasted anywhere
    h.assert(!(await h.screen(ctx, z)).includes('NOWHERE') && (await h.screen(ctx, z)) === before, 'drop off-tile: nothing')
  } finally {
    await p.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(join(process.cwd(), 'PWNED'), { force: true })
  }
}
