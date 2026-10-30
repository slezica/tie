// Markdown extensions: front matter shown muted (never parsed; markdown after it intact),
// footnotes (ref → note → back, real clicks scroll), :shortcode: emoji (no emoticons), definition
// lists. No typographer: quotes and dashes stay as typed. Hidden window: real clicks into the frame.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const hiddenWindow = true

export default async (ctx, h) => {
  const dir = join(process.cwd(), 'tmp', `mdsyntax-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const filler = (n) => Array.from({ length: n }, (_, i) => `Line ${i}.`).join('\n\n')
  const src = [
    '---',
    'title: Syntax',
    'tags: [a, b]',
    '---',
    '',
    '# Syntax',
    '',
    '- [ ] after front matter',
    '',
    filler(40),
    '',
    'See the note.[^n] :smile: :rocket: :) :not_an_emoji: "quoted" -- dash',
    '',
    'Term',
    ': Definition one',
    '',
    filler(80),
    '',
    '[^n]: The note text.',
    '',
  ].join('\n')
  writeFileSync(join(dir, 'doc.md'), src)
  try {
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const id = (await ctx.tie('add', join(dir, 'doc.md'), '--at', t0, '--side', 'r')).id
    await h.waitFor(ctx, () => h.mdState(ctx, id).then((s) => s.text.includes('Syntax')), 'render')
    const fr = await h.contentFrame(ctx, id)

    // Front matter: first, as-is, muted monospace; not a setext heading / rule. Task item after it.
    const fm = await fr.evaluate(() => {
      const pre = document.querySelector('#doc > pre.front-matter')
      const cs = pre && getComputedStyle(pre)
      return {
        first: document.querySelector('#doc').firstElementChild === pre,
        text: pre?.textContent,
        color: cs?.color,
        fg: getComputedStyle(document.body).color,
        font: cs?.fontFamily,
        mono: getComputedStyle(document.documentElement).getPropertyValue('--mono').trim(),
        h2: document.querySelectorAll('#doc h2').length,
        hr: document.querySelectorAll('#doc hr:not(.footnotes-sep)').length,
        task: document.querySelector('li.task')?.textContent.trim(),
        boxDisabled: document.querySelector('input.task-box')?.disabled,
      }
    })
    h.assert(fm.first && fm.text === 'title: Syntax\ntags: [a, b]\n', `front matter block first, as-is: ${JSON.stringify(fm)}`)
    const family = (f) => f.split(',')[0].replace(/"/g, '').trim()
    h.assert(fm.color !== fm.fg && family(fm.font) === family(fm.mono), `front matter muted, monospace: ${JSON.stringify(fm)}`)
    h.assert(fm.h2 === 0 && fm.hr === 0, `no heading or rule from the delimiters: ${JSON.stringify(fm)}`)
    h.assert(fm.task === 'after front matter' && fm.boxDisabled === true, `task item after front matter, display-only box: ${JSON.stringify(fm)}`)
    const edge = await fr.evaluate(() => ({
      unclosed: window.markdown.md.render('---\nfoo\n'),
      later: window.markdown.md.render('x\n\n---\na: 1\n---\n'),
    }))
    h.assert(!edge.unclosed.includes('front-matter') && edge.unclosed.includes('<hr>'), `unclosed: not front matter: ${edge.unclosed}`)
    h.assert(!edge.later.includes('front-matter'), `not at the start: not front matter: ${edge.later}`)

    // Emoji, deflist, no typographer.
    const dom = await fr.evaluate(() => ({
      text: document.getElementById('doc').innerText,
      dt: document.querySelector('#doc dl > dt')?.textContent,
      dd: document.querySelector('#doc dl > dd')?.textContent,
    }))
    h.assert(dom.text.includes('😄 🚀 :) :not_an_emoji:'), `shortcodes → emoji, emoticons and unknown names stay: ${dom.text.match(/See the note.*/)?.[0]}`)
    h.assert(dom.text.includes('"quoted" -- dash'), 'quotes and dashes as typed')
    h.assert(dom.dt === 'Term' && dom.dd === 'Definition one', `definition list: ${JSON.stringify(dom)}`)

    // Footnotes: ref scrolls to the note, back-ref scrolls back to the ref.
    const inView = (sel) => fr.evaluate((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect()
      return r.top >= -1 && r.bottom <= innerHeight + 1
    }, sel)
    await fr.evaluate(() => document.querySelector('sup.footnote-ref').scrollIntoView({ block: 'center' }))
    const y0 = (await h.mdState(ctx, id)).scrollY
    h.assert(!(await inView('.footnote-item')) && y0 > 200, `ref in view, note below the fold (${y0})`)
    await h.clickIn(ctx, fr, 'sup.footnote-ref a')
    const y1 = (await h.mdState(ctx, id)).scrollY
    h.assert((await inView('.footnote-item')) && y1 > 1000, `ref → note (${y1})`)
    await ctx.shot('footnote')
    await h.clickIn(ctx, fr, 'a.footnote-backref')
    const y2 = (await h.mdState(ctx, id)).scrollY
    await ctx.shot('back')
    h.assert((await inView('sup.footnote-ref')) && y2 > 200 && y2 < y1 - 500, `back-ref → ref (${y2})`)
    h.assert((await h.tileOf(ctx, id)).doc.path.endsWith('/doc.md') && (await h.list(ctx)).tiles.length === 2, 'in-page only')
    await fr.evaluate(() => scrollTo(0, 0))
    await ctx.shot('syntax')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
