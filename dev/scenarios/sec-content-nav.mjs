// Security: content frames load only their own viewer (registered token, exact URL, one frame each).
// They can't navigate anywhere else; other frames can't load into the UI.
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
    await h.eventually(ctx, async () => {
      const [v] = viewerIn()
      h.assert(v && (await v.evaluate(() => typeof window.probe)) === 'object', `viewer loads (frames: ${page.frames().map((f) => f.url())})`)
    }, 8000)

    // Not registered, or not the viewer page, or a second frame for the same token: refused.
    const other = 'f'.repeat(32) // all digits would parse as an IPv4 host
    for (const u of [`tie-content://${other}/_tie/probe.html`, `tie-content://${token}/_tie/probe.js`, `tie-content://${token}/package.json`]) {
      await frame(u)
      await h.eventually(ctx, async () => h.assert(blocked(u), `refused frame ${u}`))
    }
    await frame(url)
    await h.eventually(ctx, async () => h.assert(viewerIn().length === 1 && blocked(url), 'second frame for the same token refused'))

    // From inside: no navigation away (location, meta refresh, link), not even to its own files.
    // UI CSP (frame-src) or the nav lock refuses; the frame may end on an error page (it only
    // breaks itself), never on another URL. Fresh frame per attempt. `by(u, token)`: the layer that
    // refuses it and its own signal: `csp` = a frame-src violation reported to the UI page (web
    // targets: the CSP comes first), `lock` = main's `blocked navigation subframe` line.
    await page.evaluate(() => {
      window.__frameSrc = []
      document.addEventListener('securitypolicyviolation', (e) => e.effectiveDirective === 'frame-src' && window.__frameSrc.push(e.blockedURI))
    })
    const tryIn = async (what, fn, by) => {
      const { token, url } = await page.evaluate((root) => window.tie.content.open(root, 'probe'), root)
      await frame(url)
      const f = await h.waitFor(ctx, async () => {
        const f = page.frames().find((f) => f.url() === url)
        return f && (await f.evaluate(() => typeof window.probe === 'object')) && f
      }, `${what}: viewer loaded`, 8000)
      const [layer, target] = by(p.url, token)
      const csp0 = await page.evaluate((t) => window.__frameSrc.filter((x) => x === t).length, target)
      await f.evaluate(fn, { u: p.url, token }).catch(() => {})
      await ctx.sleep(500) // absence: the attempt must not take the frame anywhere
      const now = f.isDetached() ? '(detached)' : f.url()
      h.assert(now === url || now.startsWith('chrome-error:'), `${what}: frame reached ${now}`)
      if (layer === 'csp') await h.waitFor(ctx, async () => (await page.evaluate((t) => window.__frameSrc.filter((x) => x === t).length, target)) > csp0, `${what}: UI CSP frame-src refused ${target}`)
      else await h.eventually(ctx, async () => h.assert(blocked(target), `${what}: nav lock refused ${target}`))
    }
    // (A frame-src report names only the origin of a navigation another origin started: the probe's.)
    await tryIn('location', ({ u }) => (location.href = u + '/frame-location'), (u) => ['csp', u])
    await tryIn('meta refresh', ({ u }) => document.head.insertAdjacentHTML('beforeend', `<meta http-equiv="refresh" content="0;url=${u}/frame-meta">`), (u) => ['csp', u])
    await tryIn('link', ({ u }) => Object.assign(document.body.appendChild(document.createElement('a')), { href: u + '/frame-link' }).click(), (u) => ['csp', u])
    await tryIn('own root file', ({ token }) => (location.href = `tie-content://${token}/note.txt`), (_u, token) => ['lock', `tie-content://${token}/note.txt`])
    await tryIn('other token', () => (location.href = `tie-content://${'e'.repeat(32)}/_tie/probe.html`), () => ['lock', `tie-content://${'e'.repeat(32)}/_tie/probe.html`])
    await p.assertUntouched('frame navigation')

    // UI CSP still refuses frames from anywhere else (its frame-src violations, reported to the UI).
    const n0 = await page.evaluate(() => window.__frameSrc.length)
    await frame(p.url + '/shell-frame')
    await frame('tie://app/index.html')
    // (blocked URI as reported: the probe's origin; for tie: only the scheme)
    await h.waitFor(ctx, () => page.evaluate(([n0, u]) => { const v = window.__frameSrc.slice(n0); return v.includes(u) && v.includes('tie') }, [n0, p.url]), 'UI CSP frame-src refused both')
    await p.assertUntouched('UI frame-src')
    h.assert(!page.frames().some((f) => f.url().startsWith('tie://app/index.html') && f !== page.mainFrame()), 'no tie://app frame')
  } finally {
    await p.close()
    rmSync(root, { recursive: true, force: true })
  }
}
