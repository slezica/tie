// Security: browser tiles (<webview> guests), popups and downloads. Popups are never windows: http(s)
// ones (clicked or scripted) go through the link-out confirm, others are blocked; mailto: links are
// refused navigations; downloads ask (Save armed after 600 ms), then land in the (harness) downloads
// folder under a safe unique name; a script's download asks too. Hidden window: real clicks reach the
// guest.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { rpc, downloadsPath } from '../lib.mjs'

export const hiddenWindow = true

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font: 16px sans-serif">${body}
<script>window.__seen = { tie: typeof window.tie, process: typeof process, require: typeof require, module: typeof module, electron: typeof window.electron }</script></body></html>`

export default async (ctx, h) => {
  const start = Date.now()
  const s = await h.site(ctx, (path) => {
    const p = path.split('?')[0]
    if (p === '/') return page('Main', `<button id="pop" onclick="window.open('/popup-click')" style="margin:20px">pop</button>
<a id="blank" href="/popup-blank" target="_blank" style="margin:20px">blank</a>
<button id="popfile" onclick="window.open('file:///etc/hosts')" style="margin:20px">popfile</button>
<a id="dl" href="/dl" style="margin:20px">download</a>
<a id="mail" href="mailto:someone@example.com" style="margin:20px">mail</a>
${path.includes('auto') ? "<script>setTimeout(() => window.open('/popup-auto'), 300)</script>" : ''}`)
    if (p === '/autodl') return page('AutoDl', `<script>setTimeout(() => { location.href = '/dl' }, 300)</script>`)
    if (p === '/dl') return { headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="../.evil.sh"' }, body: 'echo pwned\n' }
    return page('Other', p)
  })
  const guests = () => rpc(ctx.instance, 'guest', { action: 'list' })
  const log = () => ctx.appLog()
  try {
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    let g
    // Popups: never a window, never loaded by Tie; http(s) ones are links out: the confirm dialog
    // (Cancel → nothing, Open → system browser, harness logs); non-http → blocked even with a click.
    // A script's popup without a gesture gets the same dialog (Electron has no popup blocker).
    const p = (await ctx.tie('add', s.url + '/?auto', '--at', t0, '--side', 'r')).id
    g = await h.guestPage(ctx, p)
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.external-open'), 'script popup without a gesture: the dialog')
    h.assert((await ctx.page.textContent('.dialog.external-open .url')) === `${s.url}/popup-auto` && !s.hits.includes('/popup-auto'), 'nothing loaded, URL shown')
    await ctx.page.click('.dialog .cancel')
    await ctx.sleep(300) // absence: nothing opened
    h.assert(!log().includes('external open'), 'Cancel: nothing opened')
    const wv = await ctx.page.locator(`.tile[data-id="${p}"] webview`).boundingBox()
    const click = async (sel) => {
      const bx = await g.locator(sel).boundingBox()
      await ctx.page.mouse.click(wv.x + bx.x + 5, wv.y + bx.y + bx.height / 2)
    }
    await click('#pop')
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.external-open'), 'click popup: confirm dialog')
    h.assert((await ctx.page.textContent('.dialog.external-open .url')) === `${s.url}/popup-click` && !log().includes('external open'), 'full URL shown, nothing opened yet')
    await ctx.page.click('.dialog .cancel')
    await ctx.sleep(300) // absence: nothing opened
    h.assert(!log().includes(`external open ${s.url}/popup-click`), 'Cancel: nothing opened')
    const bl = await g.locator('#blank').boundingBox()
    await h.guestClick(ctx, p, bl.x + 5, bl.y + bl.height / 2)
    await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.external-open'), 'target=_blank: confirm dialog')
    await ctx.page.click('.dialog .confirm')
    await h.waitFor(ctx, async () => log().includes(`external open ${s.url}/popup-blank`), 'Open: system browser (harness: logged)')
    await click('#popfile')
    await ctx.sleep(500) // absence: never opened
    // (Chromium refuses file: from an http page before the handler: either way, never opened.)
    h.assert(!/external open file:/.test(log()), 'non-http popup never opened, even with a click')
    // Non-http popups that do reach the handler: blocked there (popupUrl → null, logged), no window.
    const blocked = await g.evaluate(() => [String(window.open('about:blank')), String(window.open('mailto:pop@example.com'))])
    await h.waitLog(ctx, /\[security\] blocked popup about:blank$/m)
    await h.waitLog(ctx, /\[security\] blocked popup mailto:pop@example\.com$/m)
    h.assert(blocked.every((x) => x === 'null') && !(await ctx.page.isVisible('.dialog.external-open')), `blocked popups: ${blocked}`)
    const d = await g.locator('#dl').boundingBox() // (Playwright waits forever after the refused mailto: navigation)
    await click('#mail')
    // A mailto: link is a main-frame navigation: refused by the guard (logged), never handed out.
    await h.waitLog(ctx, /\[security\] blocked guest navigation main mailto:someone@example\.com$/m)
    h.assert(!/external open mailto:/.test(log()) && (await h.tileOf(ctx, p)).web.url.startsWith(s.url), 'mailto: never opened')
    h.assert(!s.hits.some((x) => x.startsWith('/popup')), `no popup ever loaded: ${s.hits.filter((x) => x.startsWith('/popup'))}`)
    h.assert((await guests()).length === 1, 'no extra guests (windows)')

    // Downloads: harness folder only (fresh instances), safe unique names, never opened.
    if (ctx.instance.startsWith('drive-')) {
      const dl = downloadsPath(ctx.instance)
      const real = join(homedir(), 'Downloads', 'evil.sh')
      const realBefore = existsSync(real) ? statSync(real).mtimeMs : null
      const files = () => (existsSync(dl) ? readdirSync(dl).filter((f) => !f.endsWith('.crdownload')) : [])
      // Every download asks: a dialog with the sanitized name and the site; nothing saved before Save.
      // Save disabled when the dialog appears, armed ~600 ms later (recorded in the UI as it happens:
      // a check from here could come late under load).
      await ctx.page.evaluate(() => {
        window.__arm = null
        const o = new MutationObserver(() => {
          const b = document.querySelector('.dialog.save-download .confirm')
          if (!b) return
          o.disconnect()
          const at = performance.now()
          window.__arm = { disabled: b.disabled, after: null }
          new MutationObserver(() => !b.disabled && window.__arm.after === null && (window.__arm.after = performance.now() - at)).observe(b, { attributes: true })
        })
        o.observe(document.body, { childList: true })
      })
      await h.guestClick(ctx, p, d.x + 5, d.y + d.height / 2)
      await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.save-download'), 'download: confirm dialog')
      await h.waitArmed(ctx)
      const arm = await ctx.page.evaluate(() => window.__arm)
      h.assert(arm?.disabled === true && arm.after >= 500, `Save disabled at first, armed after ~600 ms: ${JSON.stringify(arm)}`)
      const dlg = await ctx.page.evaluate(() => ({ name: document.querySelector('.dialog.save-download .url')?.textContent, focus: document.activeElement?.className, text: document.querySelector('.dialog.save-download')?.textContent }))
      h.assert(/evil\.sh/.test(dlg.name ?? '') && !/^\./.test(dlg.name) && /cancel/.test(dlg.focus) && dlg.text.includes('127.0.0.1'), `dialog: ${JSON.stringify(dlg)}`)
      h.assert(files().length === 0, 'nothing saved before Save')
      await ctx.page.click('.dialog .cancel')
      await ctx.sleep(400) // absence: nothing saved
      h.assert(files().length === 0 && !/download completed/.test(log()), 'Cancel: nothing saved')
      await h.guestClick(ctx, p, d.x + 5, d.y + d.height / 2)
      await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.save-download'), 'download: confirm dialog again')
      await ctx.page.click('.dialog .confirm')
      await h.waitFor(ctx, async () => files().length === 1 && /download completed/.test(log()), 'Save: download saved')
      await h.guestClick(ctx, p, d.x + 5, d.y + d.height / 2)
      await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.save-download'), 'third dialog')
      await ctx.page.click('.dialog .confirm')
      await h.waitFor(ctx, async () => files().length === 2, 'second download saved')
      const names = files().sort()
      h.assert(names.every((n) => n.includes('evil') && !n.startsWith('.') && !n.includes('/')) && names.some((n) => n.includes(' (1)')), `safe unique names: ${names}`)
      h.assert(names.every((n) => readFileSync(join(dl, n), 'utf8') === 'echo pwned\n'), 'content saved as is')
      h.assert(!existsSync(join(dl, '..', '.evil.sh')), 'no traversal')
      const realAfter = existsSync(real) ? statSync(real).mtimeMs : null
      h.assert(realAfter === realBefore && !(realAfter && realAfter > start), 'real ~/Downloads untouched')
      // A download a script starts with no input: asks too, saves nothing until you say so.
      const auto = (await ctx.tie('add', s.url + '/autodl', '--at', t0, '--side', 'b')).id
      await h.waitFor(ctx, () => ctx.page.isVisible('.dialog.save-download'), 'script download: asks')
      // One dialog at a time: a download asked while it is open is dropped.
      await h.guestClick(ctx, p, d.x + 5, d.y + d.height / 2)
      await h.waitFor(ctx, async () => /download request dropped \(dialog open\)/.test(log()), 'second download while asking: dropped (logged)')
      h.assert((await ctx.page.locator('.dialog.save-download').count()) === 1, 'one download dialog at a time')
      await ctx.page.click('.dialog .cancel')
      await ctx.sleep(500) // absence: nothing saved
      h.assert(files().length === 2, `nothing saved by it (${files().length} files)`)
      await ctx.tie('close', '--tile', auto)
    }
    await ctx.shot('sec-browser-popups')
  } finally {
    await s.close()
  }
}
