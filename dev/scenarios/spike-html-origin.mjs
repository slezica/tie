// Spike S1 (P0, viewers plan): a local html file as the page of a content frame, own origin
// (`allow-scripts allow-same-origin`) vs opaque (`allow-scripts`). Process, storage, parent, fetch,
// module scripts, navigation within the root. Records facts (Results); asserts what was observed.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const env = { TIE_SPIKE: 'html,nav' }

// The test page: runs its checks on load, results in window.__r.
const PAGE = `<!doctype html><title>spike</title><body>spike
<script>
const r = (window.__r = { origin: location.origin })
const t = (k, fn) => { try { r[k] = String(fn()) } catch (e) { r[k] = 'threw ' + e.name } }
t('storage', () => (localStorage.setItem('k', 'v'), localStorage.getItem('k')))
t('cookie', () => ((document.cookie = 'c=1'), document.cookie))
t('parentDoc', () => !!parent.document)
t('parentTie', () => typeof parent.tie)
t('topLocation', () => top.location.href)
r.fetch = 'pending'
fetch('./data.json').then((x) => x.json()).then((j) => (r.fetch = 'ok ' + j.v), (e) => (r.fetch = 'threw ' + e.message))
r.importDyn = 'pending'
import('./mod.mjs').then((m) => (r.importDyn = 'ok ' + m.x), (e) => (r.importDyn = 'threw ' + e.message))
r.xhr = 'pending'
try { const x = new XMLHttpRequest(); x.open('GET', './data.json'); x.onload = () => (r.xhr = 'ok ' + x.status); x.onerror = () => (r.xhr = 'error'); x.send() } catch (e) { r.xhr = 'threw ' + e.name }
r.idb = 'pending'
try { const q = indexedDB.open('x'); q.onsuccess = () => (r.idb = 'ok'); q.onerror = () => (r.idb = 'error') } catch (e) { r.idb = 'threw ' + e.name }
</script>
<script type="module">window.__r.moduleInline = 'ran'</script>
<script type="module" src="./mod2.mjs"></script>
<script src="./classic.js"></script>
</body>`

export async function setup(ctx) {
  const root = join(process.cwd(), 'tmp', `spike-html-${process.pid}`)
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'page.html'), PAGE)
  writeFileSync(join(root, 'sub.html'), '<!doctype html><body>sub<script>window.__sub = 1</script>')
  writeFileSync(join(root, 'data.json'), '{"v": 42}')
  writeFileSync(join(root, 'mod.mjs'), 'export const x = 7')
  writeFileSync(join(root, 'mod2.mjs'), "window.__r.moduleSrc = 'ran'")
  writeFileSync(join(root, 'classic.js'), "window.__r.classic = 'ran'")
  return root
}

// A raw frame on a fresh token (kind probe: the token's root), showing page.html. No tile: the
// shell side is the harness's.
export async function frameOn(ctx, root, sandbox, file = 'page.html') {
  const { token } = await ctx.page.evaluate((root) => window.tie.content.open(root, 'probe'), root)
  const url = `tie-content://${token}/${file}`
  await ctx.page.evaluate(
    ({ url, sandbox }) => {
      const f = Object.assign(document.createElement('iframe'), { src: url })
      f.setAttribute('sandbox', sandbox)
      f.className = 'spike'
      document.body.append(f)
    },
    { url, sandbox },
  )
  let fr
  for (let i = 0; i < 40 && !fr; i++) {
    await ctx.sleep(100)
    fr = ctx.page.frames().find((f) => f.url() === url)
  }
  if (!fr) throw new Error(`frame did not load ${url}`)
  await ctx.sleep(800) // async checks settle
  return { token, url, fr }
}

export async function results(fr) {
  return fr.evaluate(() => window.__r)
}

export default async (ctx, h) => {
  const root = await setup(ctx)
  try {
    const own = await frameOn(ctx, root, 'allow-scripts allow-same-origin')
    const opaque = await frameOn(ctx, root, 'allow-scripts')
    const ro = await results(own.fr)
    const rq = await results(opaque.fr)
    const fr = (await h.frames(ctx)).filter((f) => f.url.startsWith('tie-content://'))
    const info = (u) => fr.find((f) => f.url === u)
    const shellPid = (await h.frames(ctx)).find((f) => f.depth === 0).pid
    const facts = { own: { ...ro, frame: info(own.url) }, opaque: { ...rq, frame: info(opaque.url) }, shellPid }
    ctx.log(JSON.stringify(facts, null, 2))

    // Own origin: out of process, its token is the origin; storage, classic + module scripts work;
    // parent still unreachable (cross-origin). fetch fails (scheme lacks supportFetchAPI), XHR
    // works (same origin). Cookies: none (silently empty).
    h.assert(facts.own.frame.outOfProcess && facts.own.frame.origin === `tie-content://${own.token}`, 'own: out of process, token origin')
    h.assert(ro.origin === `tie-content://${own.token}`, 'own: location.origin is the token')
    h.assert(ro.storage === 'v' && ro.idb === 'ok', `own: localStorage + IndexedDB work (${ro.storage}, ${ro.idb})`)
    h.assert(/^threw/.test(ro.parentDoc) && /^threw/.test(ro.parentTie) && /^threw/.test(ro.topLocation), 'own: parent unreachable')
    h.assert(ro.classic === 'ran' && ro.moduleInline === 'ran' && ro.moduleSrc === 'ran' && ro.importDyn === 'ok 7', `own: module scripts load (${ro.moduleSrc}, ${ro.importDyn})`)
    h.assert(/^threw/.test(ro.fetch) && ro.xhr === 'ok 200', `own: fetch fails without supportFetchAPI, XHR works (${ro.fetch}, ${ro.xhr})`)
    h.assert(ro.cookie === '', `own: no cookies (${ro.cookie})`)

    // Opaque: no storage, no modules from tie-content, no fetch/XHR; classic scripts only.
    h.assert(facts.opaque.frame.outOfProcess && facts.opaque.frame.origin === 'null', 'opaque: null origin')
    h.assert(/^threw/.test(rq.storage) && rq.classic === 'ran' && rq.moduleSrc === undefined && /^threw/.test(rq.importDyn) && rq.xhr === 'error', `opaque: no storage, no modules (${rq.storage}, ${rq.moduleSrc}, ${rq.importDyn})`)
    h.assert(rq.moduleInline === 'ran', 'opaque: inline module scripts run (no fetch involved)')

    // Navigation within the root: same frame, same token (spike nav rule) works; storage is per
    // token (same origin keeps it).
    await own.fr.evaluate(() => (location.href = './sub.html'))
    await ctx.sleep(800)
    const sub = ctx.page.frames().find((f) => f.url() === `tie-content://${own.token}/sub.html`)
    h.assert(sub && (await sub.evaluate(() => [window.__sub, localStorage.getItem('k')])).join() === '1,v', 'own: in-root navigation keeps origin + storage')
    h.assert(/frame html allowed tie-content:\/\/\S+\/sub\.html/.test(ctx.appLog()), 'nav lock saw sub.html')
    return facts
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
