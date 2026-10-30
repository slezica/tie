// Markdown diagrams: ```mermaid fences render as SVG (flowchart, sequence) in theme colors; bad
// syntax keeps the code plus an error line; the library loads only for documents with a diagram;
// theme changes re-render; no CSP violations.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const fence = (s) => '```mermaid\n' + s + '\n```\n'

export default async (ctx, h) => {
  const dir = join(process.cwd(), 'tmp', `mdmm-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const f = join(dir, 'doc.md')
  writeFileSync(f, '# Plain\n\n```js\nconst x = 1\n```\n')
  const served = () => (ctx.appLog().match(/\[content\] viewer markdown-mermaid\.js/g) ?? []).length
  try {
    const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
    const id = (await ctx.tie('add', f, '--at', a, '--side', 'r')).id
    await h.waitFor(ctx, async () => (await h.mdState(ctx, id)).text.includes('Plain'), 'plain render')
    const fr = await h.contentFrame(ctx, id)
    await fr.evaluate(() => {
      window.__v = []
      addEventListener('securitypolicyviolation', (e) => window.__v.push(`${e.violatedDirective} ${e.blockedURI}`))
    })
    await ctx.sleep(500) // absence: the library isn't fetched for a document without diagrams

    // Lazy: no diagram, no library.
    h.assert(served() === 0 && (await fr.evaluate(() => typeof window.mermaid)) === 'undefined', 'no diagram: library not loaded')

    // Diagrams: flowchart + sequence render; bad syntax → code + error line.
    writeFileSync(f, ['# Diagrams', '', fence('flowchart LR\n  A[Start] --> B{Ok?}\n  B -->|yes| C[Done]'), fence('sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi'), fence('flowchart LR\n  A -->'), 'After.', ''].join('\n'))
    await h.waitFor(ctx, () => fr.evaluate(() => document.querySelectorAll('.diagram.rendered, .diagram-error').length === 3), 'diagrams', 15000)
    const dom = await fr.evaluate(() => {
      const d = [...document.querySelectorAll('#doc .diagram')]
      const vis = (e) => !!e && getComputedStyle(e).display !== 'none'
      return d.map((x) => ({
        rendered: x.classList.contains('rendered'),
        kind: x.querySelector('svg')?.getAttribute('aria-roledescription'),
        text: [...x.querySelectorAll('svg text')].map((t) => t.textContent).join(' '),
        w: Math.round(x.querySelector('svg')?.getBoundingClientRect().width ?? 0),
        src: vis(x.querySelector('pre.diagram-src')),
        err: x.querySelector('.diagram-error')?.textContent,
      }))
    })
    h.assert(dom[0].rendered && dom[0].kind === 'flowchart-v2' && /Start.*Ok\?.*Done/.test(dom[0].text) && dom[0].w > 100 && !dom[0].src, `flowchart: ${JSON.stringify(dom[0])}`)
    h.assert(dom[1].rendered && dom[1].kind === 'sequence' && /Alice/.test(dom[1].text) && /Hello/.test(dom[1].text) && !dom[1].src, `sequence: ${JSON.stringify(dom[1])}`)
    h.assert(!dom[2].rendered && dom[2].src && /^Diagram error: Parse error/.test(dom[2].err ?? ''), `bad syntax: ${JSON.stringify(dom[2])}`)
    h.assert((await h.mdState(ctx, id)).text.includes('After.'), 'rest of the page intact')
    h.assert(served() === 1, `library served once: ${served()}`)
    await ctx.shot('diagrams')

    // Theme colors: Mermaid's base theme from the tile's theme; a theme change re-renders.
    const fill = () => fr.evaluate(() => getComputedStyle(document.querySelector('#doc .diagram-svg g.node rect, #doc .diagram-svg g.node polygon')).fill)
    const bg = () => fr.evaluate(() => window.markdown.diagrams.config.themeVariables.background)
    const before = { fill: await fill(), bg: await bg() }
    h.assert(before.bg === '#22252c', `theme background: ${before.bg}`)
    await ctx.page.evaluate(() => document.dispatchEvent(new CustomEvent('tie:settings')))
    await ctx.page.waitForSelector('.settings')
    await ctx.page.selectOption('#set-theme', 'solarized-light')
    await h.waitFor(ctx, async () => (await bg()) === '#fdf6e3' && (await fill()) !== before.fill, 'diagrams re-rendered in the new theme')
    await ctx.shot('light')
    await ctx.page.keyboard.press('Escape')

    const v = await fr.evaluate(() => window.__v)
    h.assert(!v.length, `no CSP violations: ${v}`)
    h.assert(!(await h.tileOf(ctx, id)).error, 'tile fine')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
