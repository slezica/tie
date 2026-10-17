// Security: Mermaid diagrams in markdown tiles. Known PoC classes are inert (classDef </style>
// breakout, HTML in labels, click callbacks / javascript: links, %%{init}%% overrides of secure
// settings); remote resources in diagrams never requested; limits stop pathological diagrams; a
// hung diagram renderer trips the watchdog without touching other tiles. Hidden window: real clicks.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const hiddenWindow = true

const fence = (s) => '```mermaid\n' + s + '\n```\n'

export default async (ctx, h) => {
  const p = await h.probe(ctx)
  const dir = join(process.cwd(), 'tmp', `secmm-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const f = join(dir, 'doc.md')
  const P = p.url
  const diagrams = [
    // 1. classDef / style breaking out of Mermaid's <style> (flowchart's grammar refuses these).
    'stateDiagram-v2\n  classDef evil fill:#f00;}</style><img src=x onerror=window.__xss=1><style>\n  [*] --> A\n  class A evil',
    'classDiagram\n  class C\n  style C fill:#f00</style><img src=x onerror=window.__xss=1>',
    // 2. HTML in labels.
    `flowchart LR\n  L["<img src=x onerror=window.__xss=2> <b>bold</b> <a href='javascript:window.__xss=3'>a</a>"] --> M`,
    // 3. click callbacks and javascript: links.
    'flowchart LR\n  J[jslink] --> K[callback]\n  click J "javascript:window.__xss=4"\n  click K call window.__cb()',
    // 4. Directive trying to loosen secure settings.
    `%%{init: {"securityLevel": "loose", "htmlLabels": true, "flowchart": {"htmlLabels": true}, "maxEdges": 100000, "themeCSS": "@import url(${P}/themecss); .node rect { fill: url(${P}/themefill) }", "fontFamily": "x; background: url(${P}/font)"}}%%\nflowchart LR\n  H["<b>html</b>"] --> I[loose]\n  click I call window.__cb()`,
    // 5. Remote resources: url() in classDef / style (reach the CSS: CSP blocks them), image shape,
    // sequence link and image label.
    `stateDiagram-v2\n  classDef bg fill:url(${P}/classfill)\n  [*] --> R\n  class R bg`,
    `classDiagram\n  class D\n  style D fill:url(${P}/stylefill)`,
    `flowchart LR\n  R[remote] --> T@{ img: "${P}/imgshape", label: "img", w: 40, h: 40 }`,
    `sequenceDiagram\n  Alice->>Bob: <img src="${P}/seqimg"> hi\n  link Alice: Evil @ javascript:window.__xss=5\n  link Bob: Web @ ${P}/seqlink`,
  ]
  const doc = '# Diagrams\n\n' + diagrams.map(fence).join('\n')
  writeFileSync(f, doc)
  try {
    const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
    const id = (await ctx.tie('open', f, '--at', a, '--side', 'r')).id
    const fr = await h.contentFrame(ctx, id)
    await fr.evaluate(() => {
      window.__cb = () => (window.__xss = 'callback')
      window.__v = []
      addEventListener('securitypolicyviolation', (e) => window.__v.push(`${e.violatedDirective} ${e.blockedURI}`))
    })
    const done = (n) => () => fr.evaluate((n) => window.markdown.diagrams.renders + window.markdown.diagrams.errors >= n, n)
    await h.waitFor(ctx, done(diagrams.length), 'diagrams rendered', 15000)
    const st = await fr.evaluate(() => ({ renders: window.markdown.diagrams.renders, errors: window.markdown.diagrams.errors, errs: [...document.querySelectorAll('.diagram-error')].map((e) => e.textContent) }))
    // The image shape needs its image to size itself: blocked by the CSP (never requested) → error.
    h.assert(st.renders === diagrams.length - 1 && st.errors === 1 && /image cannot be decoded/.test(st.errs[0]), `all render but the image shape: ${JSON.stringify(st)}`)
    await ctx.shot('pocs')

    // Inert: no HTML, scripts, handlers, foreignObject, images, javascript: links; nothing ran.
    const dom = await fr.evaluate(() => {
      const all = [...document.querySelectorAll('#doc *')]
      const href = (e) => e.getAttribute('href') ?? e.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? ''
      return {
        html: [...document.querySelectorAll('#doc .diagram-svg *')].filter((e) => e.namespaceURI !== 'http://www.w3.org/2000/svg').map((e) => e.tagName),
        bad: all.filter((e) => /^(script|img|image|iframe|foreignobject|use|object|embed)$/i.test(e.tagName)).map((e) => e.tagName),
        handlers: all.filter((e) => [...e.attributes].some((x) => x.name.startsWith('on'))).length,
        js: all.filter((e) => /^\s*javascript:/i.test(href(e))).length,
        links: [...document.querySelectorAll('#doc .diagram-svg a')].map(href),
        styles: [...document.querySelectorAll('#doc .diagram-svg style')].map((s) => s.textContent).join('\n'),
        xss: window.__xss,
      }
    })
    h.assert(!dom.html.length && !dom.bad.length && !dom.handlers && !dom.js && dom.xss === undefined, `diagrams inert: ${JSON.stringify({ ...dom, styles: undefined })}`)
    h.assert(!/<\/style|<img|onerror/i.test(dom.styles), 'classDef breakout stays out of the style text')
    h.assert(dom.links.every((l) => /^https?:/.test(l) || l === 'about:blank' || l === ''), `links: http(s) or neutralized: ${dom.links}`)

    // Directive ignored: still strict (no callback bound), still SVG text labels, config unchanged.
    const cfg = await fr.evaluate(() => {
      const c = window.markdown.diagrams.config
      return { securityLevel: c.securityLevel, htmlLabels: c.htmlLabels, maxEdges: c.maxEdges, themeCSS: c.themeCSS ?? null }
    })
    h.assert(cfg.securityLevel === 'strict' && cfg.htmlLabels === false && cfg.maxEdges === 500 && cfg.themeCSS === null, `config: ${JSON.stringify(cfg)}`)
    h.assert(!dom.styles.includes('/themecss') && !dom.styles.includes('/font)'), 'themeCSS / fontFamily from the directive not applied')

    // Real clicks on the click-bound nodes: nothing runs, nothing opens but via the host's rules.
    for (const label of ['jslink', 'callback', 'loose']) {
      const node = fr.locator('#doc .diagram-svg g.node', { hasText: label }).first()
      const b = await node.boundingBox()
      h.assert(b, `node ${label} visible`)
      await ctx.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
      await ctx.sleep(300)
    }
    h.assert((await fr.evaluate(() => window.__xss)) === undefined, 'clicks ran nothing')
    h.assert(!/external open javascript|external open about/.test(ctx.appLog()), 'no javascript:/about: opened')

    // Remote resources: never requested; no CSP violation even attempted except url()s (blocked).
    await p.assertUntouched('remote resources in diagrams')
    const v = await fr.evaluate(() => window.__v)
    h.assert(v.every((x) => /^(img-src|font-src|style-src)/.test(x)), `only resource loads blocked, nothing else: ${v}`)

    // Pathological: edge limit → error block; text limit → Mermaid's notice. Tile and terminal fine.
    const edges = 'flowchart LR\n' + Array.from({ length: 600 }, (_, i) => `  n${i} --> n${i + 1}`).join('\n')
    const big = 'flowchart LR\n' + '  A --> B\n'.repeat(6000)
    writeFileSync(f, '# Limits\n\n' + fence(edges) + '\n' + fence(big))
    await h.waitFor(ctx, async () => (await h.mdState(ctx, id)).text.includes('Limits'), 'limits doc')
    await h.waitFor(ctx, () => fr.evaluate(() => document.querySelectorAll('.diagram.rendered, .diagram-error').length === 2), 'limits rendered', 15000)
    const lim = await fr.evaluate(() => ({ err: document.querySelector('.diagram-error')?.textContent, notice: document.querySelector('.diagram.rendered')?.textContent }))
    h.assert(/edge/i.test(lim.err ?? '') && /maximum text size/i.test(lim.notice ?? ''), `limits: ${JSON.stringify(lim)}`)
    h.assert(!(await h.tileOf(ctx, id)).error, 'tile fine after limits')

    // A renderer that never returns (as a Mermaid DoS bug would): watchdog → error; others fine.
    await fr.evaluate(() => {
      window.mermaid.render = () => {
        for (;;);
      }
    })
    writeFileSync(f, '# Hang\n\n' + fence('flowchart LR\n  X --> Y'))
    const err = await h.waitFor(ctx, async () => (await h.tileOf(ctx, id)).error, 'hung renderer → tile error', 20000)
    h.assert(err === 'Viewer stopped responding', `watchdog: ${err}`)
    await ctx.tie('focus', a)
    await ctx.page.keyboard.type('echo $((6*7))ok\n')
    await h.waitFor(ctx, async () => (await h.screen(ctx, a)).includes('42ok'), 'terminal answers')
    h.assert((await h.list(ctx)).tiles.length === 2, 'tiles still there')
    await ctx.shot('hung')
  } finally {
    await p.close()
    rmSync(dir, { recursive: true, force: true })
  }
}
