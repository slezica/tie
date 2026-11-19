// Security: the UI is served from tie://app (not file://), can't read other files, no traversal.
// Each case is labelled by the layer that refuses it (the first one in the way):
// - csp: the UI's CSP (`default-src 'self'`: fetch → connect-src); the request never leaves the page.
// - parser: the URL parser drops dot segments (`..`, `%2e%2e`) first: the request is a missing file
//   inside out/renderer (404, nothing logged). Chromium's, not Tie's.
// - resolveInside: serveShell's traversal check (@core/security), logged `[security] refused`.
// serveShell's host check (`tie://other`) is behind the CSP: unreachable from the page (defense in
// depth; unit-tested only through resolveInside).
export default async (ctx, h) => {
  const url = await h.uiUrl(ctx)
  h.assert(url.startsWith('tie://app/'), `shell on tie://app (got ${url})`)
  const cases = {
    'file:///etc/hosts': 'csp',
    'tie://app/../../../../../../etc/hosts': 'parser',
    'tie://app/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/etc/hosts': 'parser',
    'tie://app/..%2f..%2f..%2f..%2f..%2f..%2fetc%2fhosts': 'resolveInside',
    'tie://app/..%5c..%5cetc%5chosts': 'resolveInside',
    'tie://app/../main/index.js': 'parser',
    'tie://app/%2e%2e/main/index.js': 'parser',
    'tie://other/index.html': 'csp',
  }
  const r = await ctx.page.evaluate(async (urls) => {
    const tryFetch = (u) => fetch(u).then(async (res) => (res.ok ? 'READ ' + (await res.text()).length : 'status ' + res.status), (e) => 'blocked ' + e.name)
    const out = {}
    for (const u of urls) out[u] = await tryFetch(u)
    out.own = await tryFetch('tie://app/index.html')
    return out
  }, Object.keys(cases))
  ctx.log(r)
  h.assert(r.own.startsWith('READ'), 'shell files load')
  for (const [u, layer] of Object.entries(cases)) {
    const v = r[u]
    h.assert(!v.startsWith('READ'), `${u}: ${v}`)
    if (layer === 'csp') h.assert(v === 'blocked TypeError', `${u}: refused by the UI CSP (${v})`)
    else h.assert(v === 'status 404', `${u}: served 404 (${v})`)
    const logged = ctx.appLog().includes(`[security] refused ${u}\n`)
    h.assert(logged === (layer === 'resolveInside'), `${u}: ${layer === 'resolveInside' ? 'refused by resolveInside (logged)' : `not a resolveInside case (${layer}), yet logged`}`)
  }
}
