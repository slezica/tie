// Security: content frames can't take focus or act by themselves. An html page's own scripts never
// run (static), so its focus() / window.open() on load are nothing; and even script in the page's
// realm (Playwright's evaluate stands in for a renderer bug) can't focus the frame without a user
// gesture: Blink refuses it (permissions policy focus-without-user-activation 'none' +
// BlockingFocusWithoutUserActivation), the frame never becomes the UI's activeElement, no gesture
// verb passes, typing stays in the terminal. After a real click the page is focused; window.open
// then shows the dialog: site address in bold, a long link called out, Open disabled at first.
// Hidden window: real input routing. evaluate carries a gesture, so the gesture-less call is made
// from a timer set long after the evaluate (transient activation expires).
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
<script>window.__ran = 1; window.focus(); document.getElementById('i').focus(); window.open('${p.url}/grabbed')</script>
</body></html>`,
  )
  const active = () => ctx.page.evaluate(() => (document.activeElement ? document.activeElement.tagName + ':' + (document.activeElement.closest('.tile')?.dataset.id ?? '') : 'none'))
  const consoleMsgs = []
  ctx.page.on('console', (m) => consoleMsgs.push(m.text()))
  try {
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    await ctx.tie('focus', '--tile', t0)
    const id = (await ctx.tie('add', join(dir, 'grab.html'), '--at', t0, '--side', 'r')).id
    const fr = await h.htmlFrame(ctx, id)
    await ctx.sleep(800) // absence: the page's load-time focus() / window.open do nothing
    h.assert((await fr.evaluate(() => window.__ran)) === undefined, 'the page script never ran (static html)')
    h.assert((await active()).startsWith('TEXTAREA:' + t0) && (await h.list(ctx)).active === t0, `focus stays in the terminal: ${await active()}`)
    // Script in the page's realm, without a gesture (timer long after the evaluate): refused by Blink.
    await fr.evaluate((u) => setTimeout(() => { window.focus(); document.getElementById('i').focus(); window.__hasFocus = document.hasFocus(); window.open(u + '/timer') }, 6000), p.url)
    // Waited for from outside (the log): polling the frame with evaluate would give it a gesture. The
    // refusal comes last (GESTURE_MS after the request): once logged, a dialog would have shown.
    await h.eventually(ctx, async () => h.assert(/refused request without focus t[a-z2-9]+ followLink/.test(ctx.appLog()), 'request refused without focus'), 10000)
    h.assert((await fr.evaluate(() => window.__hasFocus)) === false, 'focus() without a gesture: refused')
    h.assert(consoleMsgs.some((m) => /Blocked focus call/.test(m)), 'Blink refused the focus call (console)')
    h.assert((await active()).startsWith('TEXTAREA:' + t0), 'still the terminal')
    h.assert(!(await ctx.page.isVisible('.dialog.external-open')) && (await h.list(ctx)).tiles.length === 2, 'no dialog, no file opened')
    await ctx.page.keyboard.type('echo nothing-grabbed')
    await h.waitText(ctx, t0, 'nothing-grabbed').catch(() => {})
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
    await h.waitArmed(ctx)
    h.assert((await ctx.page.evaluate(() => document.querySelector('.dialog.external-open .confirm')?.disabled)) === false, 'Open enabled after the arming delay')
    await ctx.page.keyboard.press('Escape')
    await h.waitNoDialog(ctx)
    await ctx.sleep(300) // absence: nothing opened
    h.assert(!ctx.appLog().includes(`external open ${p.url}`), 'nothing opened')
    await p.assertUntouched('opens', 300)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
