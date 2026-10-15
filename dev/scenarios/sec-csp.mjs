// Security: shell CSP refuses frames, plugins, <base>, forms, workers, remote loads.
// Inline styles stay allowed: xterm injects <style> elements and style attributes (truecolor).
export default async (ctx, h) => {
  const p = await h.probe(ctx)
  try {
    const seen = []
    await ctx.page.exposeFunction('__csp', (d) => seen.push(d))
    await ctx.page.evaluate(() => document.addEventListener('securitypolicyviolation', (e) => window.__csp(e.effectiveDirective)))
    // Each attempt must raise a violation for its directive.
    const attempts = {
      'frame-src': () => document.body.append(Object.assign(document.createElement('iframe'), { src: 'tie://app/index.html' })),
      'object-src': () => document.body.append(Object.assign(document.createElement('object'), { data: 'tie://app/index.html' })),
      'base-uri': () => document.head.append(Object.assign(document.createElement('base'), { href: 'tie://app/elsewhere/' })),
      'worker-src': () => new Worker('tie://app/index.html'),
      'img-src': (u) => (new Image().src = u + '/img'),
      'connect-src': (u) => fetch(u + '/fetch').catch(() => {}),
      'script-src-elem': (u) => document.head.append(Object.assign(document.createElement('script'), { src: u + '/x.js' })),
      // Last: if allowed, the (guard-blocked) navigation it starts disturbs the page.
      'form-action': () => {
        const f = Object.assign(document.createElement('form'), { action: 'tie://app/index.html', method: 'post' })
        document.body.append(f)
        f.submit()
      },
    }
    const missing = []
    for (const [directive, fn] of Object.entries(attempts)) {
      seen.length = 0
      await ctx.page.evaluate(`(${fn})(${JSON.stringify(p.url)})`).catch((e) => ctx.log(directive, e.message.split("\n")[0]))
      await ctx.sleep(300)
      if (!seen.includes(directive)) missing.push(`${directive} (saw ${seen.join(',') || 'nothing'})`)
    }
    h.assert(!missing.length, `CSP did not refuse: ${missing.join('; ')}`)
    await p.assertUntouched('csp', 300)
  } finally {
    await p.close()
  }
}
