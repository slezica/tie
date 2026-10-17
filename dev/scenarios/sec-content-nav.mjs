// Security: content frames load only their own viewer (registered token, exact URL, one frame each).
// They can't navigate anywhere else; other frames can't load into the shell.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export default async (ctx, h) => {
  const p = await h.probe(ctx)
  // A root with a file that renders as a document (text/plain): a json/binary one would download
  // instead, and never show whether the lock let it through.
  const root = join(process.cwd(), 'tmp', `content-nav-${process.pid}`)
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'note.txt'), 'note')
  writeFileSync(join(root, 'package.json'), '{}')
  try {
    const page = ctx.page
    // Raw frame, no tile: the guards in main must hold on their own.
    const frame = (src) =>
      page.evaluate((src) => {
        const f = Object.assign(document.createElement('iframe'), { src })
        f.setAttribute('sandbox', 'allow-scripts')
        f.className = 'nav-test'
        document.body.append(f)
      }, src)
    const viewerIn = () => page.frames().filter((f) => /^tie-content:\/\/[0-9a-f]{32}\/_tie\/probe\.html$/.test(f.url()))
    const blocked = (url) => ctx.appLog().includes(`blocked navigation subframe ${url}`)
    const { token, url } = await page.evaluate((root) => window.tie.content.open(root, 'probe'), root)
    h.assert(token && url === `tie-content://${token}/_tie/probe.html`, `open: ${JSON.stringify({ token, url })}`)

    // Its own viewer: loads, script runs.
    await frame(url)
    await ctx.sleep(800)
    const [v] = viewerIn()
    h.assert(v && (await v.evaluate(() => typeof window.probe)) === 'object', `viewer loads (frames: ${page.frames().map((f) => f.url())})`)

    // Not registered, or not the viewer page, or a second frame for the same token: refused.
    const other = 'f'.repeat(32) // all digits would parse as an IPv4 host
    for (const u of [`tie-content://${other}/_tie/probe.html`, `tie-content://${token}/_tie/probe.js`, `tie-content://${token}/package.json`]) {
      await frame(u)
      await ctx.sleep(400)
      h.assert(blocked(u), `refused frame ${u}`)
    }
    await frame(url)
    await ctx.sleep(400)
    h.assert(viewerIn().length === 1 && blocked(url), 'second frame for the same token refused')

    // From inside: no navigation away (location, meta refresh, link), not even to its own files.
    // Shell CSP (frame-src) or the nav lock refuses; the frame may end on an error page (it only
    // breaks itself), never on another URL. Fresh frame per attempt.
    const tryIn = async (what, fn, arg) => {
      const { token, url } = await page.evaluate((root) => window.tie.content.open(root, 'probe'), root)
      await frame(url)
      await ctx.sleep(600)
      const f = page.frames().find((f) => f.url() === url)
      h.assert(f, `${what}: viewer loaded`)
      await f.evaluate(fn, { u: p.url, token }).catch(() => {})
      await ctx.sleep(500)
      const now = f.isDetached() ? '(detached)' : f.url()
      h.assert(now === url || now.startsWith('chrome-error:'), `${what}: frame reached ${now}`)
    }
    await tryIn('location', ({ u }) => (location.href = u + '/frame-location'))
    await tryIn('meta refresh', ({ u }) => document.head.insertAdjacentHTML('beforeend', `<meta http-equiv="refresh" content="0;url=${u}/frame-meta">`))
    await tryIn('link', ({ u }) => Object.assign(document.body.appendChild(document.createElement('a')), { href: u + '/frame-link' }).click())
    await tryIn('own root file', ({ token }) => (location.href = `tie-content://${token}/note.txt`))
    await tryIn('other token', () => (location.href = `tie-content://${'e'.repeat(32)}/_tie/probe.html`))
    await p.assertUntouched('frame navigation')

    // Shell CSP still refuses frames from anywhere else.
    await frame(p.url + '/shell-frame')
    await frame('tie://app/index.html')
    await p.assertUntouched('shell frame-src')
    h.assert(!page.frames().some((f) => f.url().startsWith('tie://app/index.html') && f !== page.mainFrame()), 'no tie://app frame')
  } finally {
    await p.close()
    rmSync(root, { recursive: true, force: true })
  }
}
