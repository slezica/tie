// tie-dev mdpage: the markdown sample as a standalone HTML page (no scripts, no network) that
// imitates a 720 px markdown tile on the board, for CSS tinkering in a browser's devtools. The
// viewer's <style> elements are kept verbatim (only `:root` / `html` / `body` selectors rewritten
// to wrapper classes), each labelled with its source module, so a devtools Changes diff maps back
// onto src/viewers/markdown.html (and runtime.ts / marks.ts / highlight.ts). docs/HARNESS.md
// "Markdown style iteration".
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { chromium } from 'playwright'
import { ROOT, sleep, tie, connectPage, launch } from './lib.mjs'
import * as h from './helpers.mjs'

const WIDTH = 720 // tile width (border included), live and standalone
const HEIGHT = 900 // live window height
const DIAGRAMS_MS = 10000 // mermaid: rendered or errored by then, else noted in the page

// Args.
const argv = process.argv.slice(2)
const opt = (name) => {
  const i = argv.indexOf(name)
  if (i < 0) return undefined
  const v = argv[i + 1]
  if (!v || v.startsWith('--')) die(`${name} needs a value`)
  return v
}
function die(msg) {
  console.error(`mdpage: ${msg}`)
  process.exit(1)
}
for (const a of argv) if (a.startsWith('--') && !['--theme', '--sample', '--out', '--open'].includes(a)) die(`unknown option ${a}`)
const themes = [...readFileSync(join(ROOT, 'src/renderer/themes.ts'), 'utf8').matchAll(/^ {2}'([a-z0-9-]+)': \{/gm)].map((m) => m[1])
const defaultTheme = /const DEFAULTS[^\n]*theme: '([^']+)'/.exec(readFileSync(join(ROOT, 'src/main/settings.ts'), 'utf8'))?.[1] ?? 'tie-dark'
const theme = opt('--theme') ?? defaultTheme
if (!themes.includes(theme)) die(`unknown theme "${theme}" (${themes.join(', ')})`)
const sample = opt('--sample') ?? 'markdown'
const src = join(ROOT, 'dev/samples', `${sample}.md`)
if (!existsSync(src)) die(`no sample ${src}`)
const out = resolve(opt('--out') ?? join(ROOT, 'tmp/mdpage', `${sample}-${theme}.html`))
const png = out.replace(/\.html?$/, '') + '.png'

// Temp copy: edited below to produce change marks; the repo file stays untouched.
const tmp = join(ROOT, 'tmp', `mdpage-${process.pid}`)
mkdirSync(tmp, { recursive: true })
const file = join(tmp, `${sample}.md`)
copyFileSync(src, file)

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
const fresh = await launch(undefined, { settings: { theme }, runDir: join(ROOT, 'out/log/runs', `${stamp}-mdpage`) })
let browser
try {
  const conn = await connectPage(fresh.instance)
  browser = conn.browser
  const page = conn.page
  const ctx = { page, instance: fresh.instance, sleep, tie: (...a) => tie(fresh.instance, ...a) }
  await page.waitForSelector('.tab')

  // One markdown tile filling the board, sized so the tile is WIDTH wide.
  const boot = (await h.list(ctx)).tiles.map((t) => t.id)
  const id = (await ctx.tie('add', file)).id
  for (const b of boot) await ctx.tie('close', '--tile', b)
  await h.waitFor(ctx, async () => (await h.list(ctx)).tiles.length === 1, 'boot tiles closed')
  let w = WIDTH + 12
  for (let i = 0; i < 3; i++) {
    await h.resizeWindow(ctx, w, HEIGHT)
    const r = await h.rectOf(ctx, id)
    if (Math.round(r.w) === WIDTH) break
    w += WIDTH - Math.round(r.w)
  }

  // Rendered, diagrams included (bounded).
  await h.waitFor(ctx, async () => (await h.mdState(ctx, id)).text.length > 0, 'markdown rendered', 8000)
  const fr = await h.contentFrame(ctx, id)
  const diagramsDone = () => fr.evaluate(() => [...document.querySelectorAll('#doc .diagram')].every((d) => d.classList.contains('rendered') || d.querySelector('.diagram-error')))
  await h.waitFor(ctx, diagramsDone, 'diagrams', DIAGRAMS_MS).catch(() => {})

  // Change marks: edit the first heading and paragraph, append a paragraph at the end (off screen:
  // its mark stays, the "changed below" edge marker shows). Snapshot the moment they appear.
  const lines = readFileSync(file, 'utf8').split('\n')
  const h1 = lines.findIndex((l) => /^# /.test(l))
  const p1 = lines.findIndex((l, i) => i > h1 && /^[A-Za-z]/.test(l))
  if (h1 >= 0) lines[h1] += ' (edited)'
  if (p1 >= 0) lines[p1] += ' Edited.'
  lines.push('', 'Appended paragraph: a change below the view.', '')
  writeFileSync(file, lines.join('\n'))

  const snap = await fr.evaluate(async () => {
    const end = Date.now() + 5000
    while (document.querySelectorAll('#doc > .changed').length < 3 && Date.now() < end) await new Promise((r) => setTimeout(r, 20))
    const changed = document.querySelectorAll('#doc > .changed').length
    const body = document.body.cloneNode(true)
    for (const s of body.querySelectorAll('script')) s.remove()
    // tie-content:// images can't load from a file: alt text only.
    let images = 0
    for (const img of body.querySelectorAll('img[src]')) if (!/^data:/.test(img.getAttribute('src'))) (img.removeAttribute('src'), images++)
    for (const el of body.querySelectorAll('.fading')) el.classList.remove('fading')
    const h1 = document.querySelector('#doc h1')
    return {
      styles: [...document.querySelectorAll('head style')].map((s) => s.textContent),
      body: body.innerHTML,
      rootStyle: document.documentElement.style.cssText,
      changed,
      images,
      diagrams: [...document.querySelectorAll('#doc .diagram')].map((d) => (d.classList.contains('rendered') ? 'rendered' : d.querySelector('.diagram-error') ? 'error' : 'pending')),
      h1: h1 && getComputedStyle(h1).fontSize,
      rootFont: getComputedStyle(document.documentElement).fontSize,
    }
  })
  if (snap.changed < 2) throw new Error(`change marks: ${snap.changed} blocks marked`)

  // Shell from the renderer: board background, tile box, title bar (+ nav bar) with their
  // computed styles frozen inline (color-mix resolved), and the tokens for reference.
  const shell = await page.evaluate((id) => {
    const tile = document.querySelector(`.tile[data-id="${id}"]`)
    const props = ['display', 'flex', 'flex-direction', 'align-items', 'justify-content', 'gap', 'height', 'min-width', 'width', 'padding', 'margin', 'background-color', 'color', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius', 'font-family', 'font-size', 'font-weight', 'line-height', 'white-space', 'overflow', 'text-overflow', 'opacity', 'visibility', 'box-sizing', 'cursor']
    const freeze = (el) => {
      const c = el.cloneNode(true)
      const a = [el, ...el.querySelectorAll('*')]
      const b = [c, ...c.querySelectorAll('*')]
      a.forEach((e, i) => {
        const cs = getComputedStyle(e)
        b[i].setAttribute('style', props.map((p) => `${p}: ${cs.getPropertyValue(p)}`).join('; '))
        for (const at of ['title', 'tabindex']) b[i].removeAttribute(at)
        if (e instanceof HTMLInputElement) b[i].setAttribute('value', e.value) // the location (a property, not serialized)
      })
      return c.outerHTML
    }
    const parts = [...tile.children].filter((e) => !e.matches('.body, .rz, .link-strip') && getComputedStyle(e).display !== 'none')
    const root = getComputedStyle(document.documentElement)
    const tcs = getComputedStyle(tile)
    const tokens = Object.fromEntries(['--app-bg', '--tile-bg', '--border', '--bar-bg', '--fg-a', '--text', '--muted', '--accent', '--radius', '--pad', '--title-h', '--nav-h', '--ui-font'].map((k) => [k, root.getPropertyValue(k).trim()]))
    return {
      bars: parts.map(freeze),
      board: getComputedStyle(document.body).backgroundColor,
      text: getComputedStyle(document.body).color,
      font: getComputedStyle(document.body).fontFamily,
      tile: { bg: tcs.backgroundColor, border: tcs.borderTopWidth + ' ' + tcs.borderTopStyle + ' ' + tcs.borderTopColor, radius: tcs.borderRadius },
      frameBg: getComputedStyle(tile.querySelector('.body iframe')).backgroundColor,
      tokens,
    }
  }, id)

  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, pageHtml(snap, shell))

  const v = await verify(out, png, snap)
  console.log(out)
  console.log(png)
  for (const l of v) console.log(`  ${l}`)
  if (argv.includes('--open')) execFile('open', [out])
} catch (e) {
  console.error(e.stack || e.message)
  process.exitCode = 1
} finally {
  await browser?.close().catch(() => {})
  await fresh.stop()
  rmSync(tmp, { recursive: true, force: true })
}

// Source module of a viewer <style>, by content.
function sourceOf(css) {
  if (css.includes('Markdown typography')) return 'src/viewers/markdown.html'
  if (css.includes('::selection')) return 'src/viewers/runtime.ts (base, style())'
  if (css.includes('.edge-mark')) return 'src/viewers/marks.ts (style())'
  if (css.includes('.hljs-')) return 'src/viewers/highlight.ts (style())'
  if (css.includes('overflow-anchor')) return 'src/viewers/live.ts (style())'
  return 'unknown (injected at runtime)'
}

// Selectors only (comments and declarations untouched): `:root` / `html` → .viewer-root,
// `body` → .viewer-body. No nesting or at-rules in the viewer sheets; a `{` opens a block.
function rewrite(css) {
  let outCss = ''
  let i = 0
  let depth = 0
  while (i < css.length) {
    if (css.startsWith('/*', i)) {
      const j = css.indexOf('*/', i + 2)
      const e = j < 0 ? css.length : j + 2
      outCss += css.slice(i, e)
      i = e
      continue
    }
    if (depth === 0) {
      // Selector run up to the next comment or block.
      let j = i
      while (j < css.length && css[j] !== '{' && !css.startsWith('/*', j)) j++
      outCss += css
        .slice(i, j)
        .replace(/:root\b/g, '.viewer-root')
        .replace(/(^|[\s,>+~(])html(?=[\s,.:#[>+~)]|$)/g, '$1.viewer-root')
        .replace(/(^|[\s,>+~(])body(?=[\s,.:#[>+~)]|$)/g, '$1.viewer-body')
      i = j
      if (css[i] === '{') (depth++, (outCss += '{'), i++)
      continue
    }
    if (css[i] === '{') depth++
    if (css[i] === '}') depth--
    outCss += css[i++]
  }
  return outCss
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function pageHtml(snap, shell) {
  const dark = /color-scheme:\s*dark/.test(snap.rootStyle)
  const notes = []
  const bad = snap.diagrams.filter((d) => d === 'pending').length
  if (bad) notes.push(`${bad} of ${snap.diagrams.length} diagrams had not rendered after ${DIAGRAMS_MS / 1000} s (source shown)`)
  if (snap.images) notes.push(`${snap.images} image(s) not embedded (tie-content:// URLs): alt text only`)
  const styles = snap.styles.map((css) => `<!-- ${sourceOf(css)} -->\n<style>${rewrite(css)}</style>`).join('\n')
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Tie markdown: ${esc(sample)} / ${esc(theme)}</title>
<!-- Generated by tie-dev mdpage (${new Date().toISOString()}). Edit in devtools, bring the diff to the
     labelled source. Viewer selectors rewritten: :root/html -> .viewer-root, body -> .viewer-body.
     rem resolves against this page's html (pinned below to the viewer's root size, ${snap.rootFont}):
     tweaking --size / --scale moves em sizes, not rem spacing, unless html's font-size follows.
     Renderer tokens at snapshot: ${esc(JSON.stringify(shell.tokens))} -->
<style>
/* Shell (Tie's board and tile, values frozen from the renderer): not part of the viewer. */
html { font-size: ${snap.rootFont}; }
html, body { margin: 0; height: 100%; }
body.shell { display: flex; flex-direction: column; align-items: center; box-sizing: border-box; padding: 24px 16px; background: ${shell.board}; color: ${shell.text}; font: 13px ${shell.font}; color-scheme: ${dark ? 'dark' : 'light'}; }
.shell-note { width: ${WIDTH}px; max-width: 100%; margin: 0 0 8px; font-size: 12px; opacity: 0.7; }
.shell-tile { box-sizing: border-box; width: ${WIDTH}px; max-width: 100%; flex: 1; min-height: 0; display: flex; flex-direction: column; background: ${shell.tile.bg}; border: ${shell.tile.border}; border-radius: ${shell.tile.radius}; }
.shell-tile svg { display: block; }
/* The frame: contains the viewer's fixed elements (edge markers) like the iframe's viewport. */
.viewer-frame { flex: 1; min-height: 0; position: relative; overflow: hidden; transform: translateZ(0); background: ${shell.frameBg}; }
.viewer-frame > .viewer-root { position: absolute; inset: 0; overflow: auto; }
</style>
${styles}
</head>
<body class="shell">
${notes.map((n) => `<p class="shell-note">Note: ${esc(n)}</p>`).join('\n')}
<div class="shell-tile">
${shell.bars.map((b) => b.replaceAll(file, src)).join('\n')}
<div class="viewer-frame">
<div class="viewer-root" style="${esc(snap.rootStyle).replace(/"/g, '&quot;')}">
<div class="viewer-body">
${snap.body}
</div>
</div>
</div>
</div>
</body>
</html>
`
}

// Open the page headless: no console errors, theme vars on .viewer-root, marks, 720 px tile, code
// token colors, h1 size = the live frame's. PNG beside the HTML.
async function verify(path, png, snap) {
  // The system Chrome (where the page gets opened), else Playwright's own Chromium.
  const b = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
  try {
    const p = await b.newPage({ viewport: { width: 1000, height: 900 } })
    const errors = []
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    p.on('pageerror', (e) => errors.push(e.message))
    p.on('request', (r) => !r.url().startsWith('file:') && !r.url().startsWith('data:') && errors.push(`request ${r.url()}`))
    await p.goto('file://' + path)
    const r = await p.evaluate(() => {
      const root = document.querySelector('.viewer-root')
      const cs = getComputedStyle(root)
      const hl = document.querySelector('.hljs-keyword, .hljs-string, .hljs-title')
      return {
        bg: cs.getPropertyValue('--bg').trim(),
        size: cs.getPropertyValue('--size').trim(),
        changed: document.querySelectorAll('#doc > .changed').length,
        edge: document.querySelectorAll('.edge-mark.on').length,
        tile: document.querySelector('.shell-tile').getBoundingClientRect().width,
        token: hl && getComputedStyle(hl).color,
        text: getComputedStyle(document.querySelector('#doc p')).color,
        h1: getComputedStyle(document.querySelector('#doc h1')).fontSize,
      }
    })
    await p.screenshot({ path: png })
    const fails = []
    if (errors.length) fails.push(`console errors: ${errors.join(' | ')}`)
    if (!r.bg || !r.size) fails.push('theme vars missing on .viewer-root')
    if (r.changed < 2) fails.push(`${r.changed} .changed blocks`)
    if (Math.round(r.tile) !== WIDTH) fails.push(`tile ${r.tile} px wide`)
    if (!r.token || r.token === r.text) fails.push('no code token color')
    if (r.h1 !== snap.h1) fails.push(`h1 ${r.h1} vs live ${snap.h1}`)
    if (fails.length) throw new Error(`verify: ${fails.join('; ')}`)
    return [`verified: no console errors, vars on .viewer-root, ${r.changed} marked blocks + ${r.edge} edge marker, tile ${r.tile} px, code tokens colored, h1 ${r.h1} = live`, `diagrams: ${snap.diagrams.join(' ')}`]
  } finally {
    await b.close()
  }
}
