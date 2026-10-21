// Security: the UI is served from tie://app (not file://), can't read other files, no traversal.
export default async (ctx, h) => {
  const url = await h.uiUrl(ctx)
  h.assert(url.startsWith('tie://app/'), `shell on tie://app (got ${url})`)
  const r = await ctx.page.evaluate(async () => {
    const tryFetch = (u) => fetch(u).then(async (res) => (res.ok ? 'READ ' + (await res.text()).length : 'status ' + res.status), (e) => 'blocked ' + e.name)
    const out = {}
    for (const u of [
      'file:///etc/hosts',
      'tie://app/../../../../../../etc/hosts',
      'tie://app/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/etc/hosts',
      'tie://app/..%2f..%2f..%2f..%2f..%2f..%2fetc%2fhosts',
      'tie://app/..%5c..%5cetc%5chosts',
      'tie://app/../main/index.js',
      'tie://app/%2e%2e/main/index.js',
      'tie://other/index.html',
    ])
      out[u] = await tryFetch(u)
    out.own = await tryFetch('tie://app/index.html')
    return out
  })
  ctx.log(r)
  h.assert(r.own.startsWith('READ'), 'shell files load')
  for (const [u, v] of Object.entries(r)) if (u !== 'own') h.assert(!v.startsWith('READ'), `${u}: ${v}`)
}
