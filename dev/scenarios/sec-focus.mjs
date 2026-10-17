// Security: content frames can't take focus by script. An html page's own script calling
// window.focus() / el.focus() (on load, from timers) is refused by Blink (permissions policy
// focus-without-user-activation 'none' + BlockingFocusWithoutUserActivation): the frame never
// becomes the shell's activeElement, so no gesture verb passes (no dialog, no file opened), the
// tile isn't activated, and typing stays in the terminal. After a real click the page is focused;
// window.open then shows the dialog: site address in bold, a long link called out, Open disabled
// at first (no click-through). Hidden window: real input routing. Playwright's evaluate carries a
// user gesture, so the grabs come from the page's own timers.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const hiddenWindow = true

export default async (ctx, h) => {
  const p = await h.probe(ctx)
  const dir = join(process.cwd(), 'tmp', `secfocus-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'secret.txt'), 'SECRET\n')
  writeFileSync(
    join(dir, 'grab.html'),
    `<!doctype html><html><head><meta charset="utf-8"><title>Grab</title></head><body>
<h1 id="h">Grab</h1><input id="i" autofocus>
<script>
window.__log = []
const grab = (tag) => {
  window.focus(); document.getElementById('i').focus()
  window.__log.push(tag + ':' + document.hasFocus())
  if (document.hasFocus()) { window.open('${p.url}/grabbed'); window.open('secret.txt') } // gesture verbs, if focus was taken
}
grab('load')
setTimeout(() => grab('t500'), 500)
setTimeout(() => grab('t1500'), 1500)
</script></body></html>`,
  )
  const active = () => ctx.page.evaluate(() => (document.activeElement ? document.activeElement.tagName + ':' + (document.activeElement.closest('.tile')?.dataset.id ?? '') : 'none'))
  const consoleMsgs = []
  ctx.page.on('console', (m) => consoleMsgs.push(m.text()))
  try {
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    await ctx.tie('focus', t0)
    const id = (await ctx.tie('open', join(dir, 'grab.html'), '--at', t0, '--side', 'r')).id
    const fr = await h.htmlFrame(ctx, id)
    await ctx.sleep(2200)
    const log = await fr.evaluate(() => window.__log)
    h.assert(log.length === 3 && log.every((l) => l.endsWith(':false')), `page never got focus by script: ${JSON.stringify(log)}`)
    h.assert(consoleMsgs.some((m) => /Blocked focus call/.test(m)), 'Blink refused the focus calls (console)')
    h.assert((await active()).startsWith('TEXTAREA:' + t0), `focus stays in the terminal: ${await active()}`)
    h.assert((await h.list(ctx)).active === t0, 'tile not activated')
    h.assert(!(await ctx.page.isVisible('.dialog.external-open')) && (await h.list(ctx)).tiles.length === 2, 'no dialog, no file opened')
    await ctx.page.keyboard.type('echo nothing-grabbed')
    await ctx.sleep(300)
    h.assert((await h.screen(ctx, t0)).includes('nothing-grabbed'), 'typing lands in the terminal')
    h.assert((await fr.evaluate(() => document.getElementById('i').value)) === '', 'the page saw no keys')

    // A real click: focused, active; window.open → dialog (site in bold, long link called out,
    // Open disabled first, then enabled).
    await h.clickIn(ctx, fr, '#h')
    h.assert((await active()) === 'IFRAME:' + id && (await h.list(ctx)).active === id, `click focuses and activates: ${await active()}`)
    const long = `${p.url}/x?d=${'A'.repeat(300)}`
    await fr.evaluate((u) => window.open(u), long)
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.external-open'), 'dialog after a real click')
    const dlg = await ctx.page.evaluate(() => ({
      url: document.querySelector('.dialog.external-open .url')?.textContent,
      host: document.querySelector('.dialog.external-open .url .host')?.textContent,
      warn: document.querySelector('.dialog.external-open .warn')?.textContent ?? '',
      disabled: document.querySelector('.dialog.external-open .confirm')?.disabled,
      focus: document.activeElement?.className,
    }))
    h.assert(dlg.url === long && dlg.host === p.url && /Long link: 3\d\d characters/.test(dlg.warn) && dlg.disabled === true && /cancel/.test(dlg.focus), `dialog: ${JSON.stringify(dlg)}`)
    await ctx.sleep(800)
    h.assert((await ctx.page.evaluate(() => document.querySelector('.dialog.external-open .confirm')?.disabled)) === false, 'Open enabled after the arming delay')
    await ctx.page.keyboard.press('Escape')
    await ctx.sleep(300)
    h.assert(!ctx.appLog().includes(`external open ${p.url}`), 'nothing opened')
    await p.assertUntouched('opens', 300)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
