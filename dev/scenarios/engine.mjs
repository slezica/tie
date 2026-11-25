// Engine probes (docs/ENGINE.md): behaviour of Chromium / Electron that Tie relies on and
// has no guard of its own for. A failure here after a dependency upgrade means an assumption moved:
// read the guide's row before touching the check. Hidden window: real focus, real clicks into guests.
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

    // 4. A browser guest can't move the UI's focus by script: Chromium takes an inner WebContents'
    // focus only from the embedder's side (WebContentsImpl::SetFocusedFrame), whatever the page's
    // activation. The page focuses itself from its own timers (no evaluate: it carries a gesture),
    // 10 tries each round: (a) no activation; (b) right after a real click into it, the user back
    // in the terminal (transient activation still live). Reports: hits on the local site.
    let round = 0
    const grab = `<!doctype html><title>Grab</title><body style="height: 100vh"><input id="i" autofocus><div id="d" tabindex="0">d</div><script>
const rep = (o) => fetch('/r?' + encodeURIComponent(JSON.stringify(o)))
let r = 0
const tryFocus = (n) => {
  window.focus(); document.body.focus(); document.getElementById('d').focus(); document.getElementById('i').focus()
  rep({ r, n, act: navigator.userActivation.isActive, el: document.activeElement?.id })
  n < 9 ? setTimeout(() => tryFocus(n + 1), 100) : rep({ r, done: true })
}
requestAnimationFrame(() => requestAnimationFrame(() => fetch('/painted')))
const poll = async () => { const g = Number(await (await fetch('/go')).text()); if (g > r) (r = g, tryFocus(0)); setTimeout(poll, 50) }
poll()</script>`
    const s = await h.site(ctx, (path) => (path === '/' ? grab : path === '/go' ? String(round) : 'ok'))
    try {
      const reps = (r) => s.hits.filter((x) => x.startsWith('/r?')).map((x) => JSON.parse(decodeURIComponent(x.slice(3)))).filter((x) => x.r === r)
      const ran = async (r) => {
        await h.waitFor(ctx, () => reps(r).some((x) => x.done), `round ${r}: the page's tries ran`)
        await ctx.sleep(300) // absence: the UI's focus does not follow (its blur handler is async)
      }
      const g = (await ctx.tie('add', s.url + '/', '--at', t0, '--side', 'r')).id
      await h.waitTile(ctx, g, (t) => t.web?.ready && t.web.title === 'Grab', 'guest loaded', 8000)
      await h.waitFor(ctx, () => s.hits.includes('/painted'), 'guest painted (input before it is dropped)', 8000)
      await ctx.tie('focus', '--tile', t0)
      await h.waitFor(ctx, async () => (await h.focused(ctx)) === t0, 'keys to the terminal')
      round = 1
      await ran(1)
      h.assert(reps(1).every((x) => x.done || (x.el === 'i' && !x.act)), `(a) the page focused its own input, no activation: ${JSON.stringify(reps(1))}`)
      h.assert((await h.focused(ctx)) === t0 && (await h.list(ctx)).active === t0, `(a) UI focus stays in the terminal: ${await h.focused(ctx)}`)
      const gb = await page.locator(`.tile[data-id="${g}"] webview`).boundingBox()
      const inGuest = async () => (await h.focused(ctx)) === g && (await h.list(ctx)).active === g
      // Under load the first click into a fresh guest is sometimes lost (PENDING.md 32): clicked again.
      await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height - 20)
      await h.waitFor(ctx, async () => (await inGuest()) || (await page.mouse.click(gb.x + gb.width / 2, gb.y + gb.height - 20), h.waitFor(ctx, inGuest, 'click', 1000).catch(() => false)), 'control: a real click focuses the guest', 6000)
      const tb = await page.locator(`.tile[data-id="${t0}"] .xterm-screen`).boundingBox()
      await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2)
      await h.waitFor(ctx, async () => (await h.focused(ctx)) === t0, 'a real click back in the terminal')
      round = 2
      await ran(2)
      h.assert(reps(2)[0]?.act === true, `(b) the page had transient activation: ${JSON.stringify(reps(2)[0])}`)
      h.assert((await h.focused(ctx)) === t0 && (await h.list(ctx)).active === t0, `(b) UI focus stays in the terminal: ${await h.focused(ctx)}`)
      // Typing lands in the terminal. (Harness keys never reach a focused guest anyway, CDP or main's
      // sendInputEvent on the window: "the page saw no keys" would prove nothing.)
      await page.keyboard.type('echo focus-kept')
      await h.waitText(ctx, t0, 'focus-kept')
    } finally {
      await s.close()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
