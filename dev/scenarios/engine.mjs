// Engine probes (docs/ENGINE.md): behaviour of Chromium / Electron that Tie relies on and
// has no guard of its own for. A failure here after a dependency upgrade means an assumption moved:
// read the guide's row before touching the check. Hidden window: real focus.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const hiddenWindow = true

export default async (ctx, h) => {
  const page = ctx.page
  const t0 = (await h.list(ctx)).tiles[0].id
  const dir = join(process.cwd(), 'tmp', `engine-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'auto.html'), '<!doctype html><title>Auto</title><input id="i" autofocus><p id="p">page</p>')
  writeFileSync(join(dir, 'n.md'), '# n\n')
  try {
    // 1. Autofocus in a cross-origin frame never fires: an html page can't take the keyboard at load.
    const html = (await ctx.tie('add', join(dir, 'auto.html'), '--at', t0, '--side', 'r')).id
    const fr = await h.htmlFrame(ctx, html)
    await ctx.tie('focus', '--tile', t0)
    await h.waitFor(ctx, async () => (await h.focused(ctx)) === t0, 'keys back to the terminal')
    await ctx.sleep(300) // absence: nothing takes focus after load
    h.assert((await h.focused(ctx)) === t0 && !(await fr.evaluate(() => document.hasFocus())), 'the page did not take focus at load')
    await h.clickIn(ctx, fr, '#p') // control: the frame can hold focus (a real click)
    await h.waitFor(ctx, () => fr.evaluate(() => document.hasFocus()), 'control: a click focuses the frame')
    h.assert((await fr.evaluate(() => document.activeElement?.id)) !== 'i', 'autofocus input not focused, even with the frame focused')
    await ctx.tie('close', '--tile', html)

    // 2. A shelved tile's frame still reports visible (MARKDOWN.md: no visibility-based pausing).
    const md = (await ctx.tie('add', join(dir, 'n.md'), '--at', t0, '--side', 'r')).id
    const mf = await h.contentFrame(ctx, md)
    h.assert((await mf.evaluate(() => document.visibilityState)) === 'visible', 'control: visible on the board')
    await ctx.tie('move', '--tile', md, '--shelved')
    await h.waitTile(ctx, md, (t) => t.state === 'shelved', 'shelved')
    await ctx.sleep(300) // absence: the state does not change after the move
    h.assert((await mf.evaluate(() => document.visibilityState)) === 'visible', 'shelved frame still reports visible')

    // 3. A key-down blocked in before-input-event loses its key-up: main never sees it (INPUT.md
    // "Capture fields": why bare modifiers pass in capture mode). Main logs raw input in that mode.
    await page.evaluate(() => {
      const el = Object.assign(document.createElement('input'), { id: 'cap', className: 'capture-field' })
      el.style.cssText = 'position:fixed;left:0;top:0;z-index:9999'
      document.body.append(el)
      el.focus()
    })
    await h.waitKeyMode(ctx, 'capture')
    await h.press(ctx, 'Meta+k') // blocked (captured as a chord)
    await h.press(ctx, 'Shift') // passes: control, its key-up arrives
    const raw = () => [...ctx.appLog().matchAll(/\[keys\] raw (keyDown|keyUp) .*?"key":"([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`)
    await h.waitFor(ctx, async () => raw().includes('keyUp Shift'), `control: a passed key's key-up reaches main (${raw()})`)
    h.assert(raw().includes('keyDown k') && !raw().includes('keyUp k'), `blocked key-down: no key-up in main: ${raw()}`)
    await page.evaluate(() => document.getElementById('cap').remove())
    await h.waitKeyMode(ctx, 'off')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
