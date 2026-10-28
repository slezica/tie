// Markdown tile: tie open renders (headings, lists, highlighted code, theme colors), live reload for
// every writer (in place, temp + rename, backup rename + new file), scroll kept, deleted → frozen,
// recreated → updates, shelved → activity dot, theme changes reach the frame.
import { mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'

export default async (ctx, h) => {
  const dir = join(process.cwd(), 'tmp', `md-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const f = join(dir, 'doc.md')
  const filler = Array.from({ length: 150 }, (_, i) => `Paragraph ${i}.`).join('\n\n')
  const body = (title) => `# ${title}\n\n## Items\n\n- one\n- two\n\n\`\`\`js\nconst x = 'str' // note\n\`\`\`\n\n${filler}\n`
  writeFileSync(f, body('First'))
  try {
    const [a] = (await h.list(ctx)).tiles.map((t) => t.id)
    // Relative path: resolved against the caller's cwd (bin/tie runs in the repo root here).
    const id = (await ctx.tie('open', relative(process.cwd(), f), '--at', a, '--side', 'r')).id
    const t = await h.waitFor(ctx, async () => (await h.tileOf(ctx, id)).doc, 'doc open')
    h.assert(t.path === f && /^[0-9a-f]{16}$/.test(t.rev) && !t.missing, `doc info: ${JSON.stringify(t)}`)
    const info = await h.tileOf(ctx, id)
    h.assert(info.kind === 'markdown' && info.title === 'doc.md' && info.glyph === 'markdown' && info.icon === '', `title/icon: ${info.title} ${info.glyph} ${info.icon}`)

    // Render: headings, list, highlighted code in theme colors.
    const has = (title) => async () => (await h.mdState(ctx, id)).text.includes(title)
    await h.waitFor(ctx, has('First'), 'first render')
    const fr = await h.contentFrame(ctx, id)
    const dom = await fr.evaluate(() => ({
      h1: document.querySelector('h1')?.textContent,
      h2: document.querySelector('h2')?.id,
      items: [...document.querySelectorAll('ul > li')].map((l) => l.textContent),
      str: document.querySelector('pre code .hljs-string')?.textContent,
      strColor: getComputedStyle(document.querySelector('pre code .hljs-string')).color,
      a2: getComputedStyle(document.documentElement).getPropertyValue('--a2').trim(),
      bg: getComputedStyle(document.documentElement).backgroundColor,
      font: getComputedStyle(document.body).fontFamily,
      size: getComputedStyle(document.body).fontSize,
      h1size: getComputedStyle(document.querySelector('h1')).fontSize,
    }))
    h.assert(dom.h1 === 'First' && dom.h2 === 'user-content-items', `headings: ${JSON.stringify(dom)}`)
    h.assert(dom.items.join() === 'one,two', `list: ${dom.items}`)
    h.assert(dom.str === "'str'" && dom.a2 === '#bdfc69' && dom.strColor === 'rgb(152, 195, 121)', `code string in the theme's code token green (tie-dark code.string, not ANSI): ${JSON.stringify(dom)}`)
    // Prose root = tile font × --scale (1.15: 12 → 13.8 px); h1 = 2em of it (Pico scale).
    h.assert(dom.bg === 'rgb(34, 37, 44)' && !/mono/i.test(dom.font.split(',')[0]) && Math.abs(parseFloat(dom.size) - 13.8) < 0.1 && Math.abs(parseFloat(dom.h1size) - 27.6) < 0.2, `theme bg, proportional font, scaled sizes: ${JSON.stringify(dom)}`)
    await ctx.shot('rendered')

    // In place, scrolled down: text updates, scroll kept.
    await fr.evaluate(() => scrollTo(0, 600))
    const writes = [
      ['in place', 'Second', () => writeFileSync(f, body('Second'))],
      ['temp + rename', 'Third', () => (writeFileSync(join(dir, '.doc.md.tmp'), body('Third')), renameSync(join(dir, '.doc.md.tmp'), f))],
      ['backup rename + new', 'Fourth', () => (renameSync(f, f + '~'), writeFileSync(f, body('Fourth')), rmSync(f + '~'))],
    ]
    for (const [how, title, write] of writes) {
      const before = (await h.mdState(ctx, id)).rev
      write()
      await h.waitFor(ctx, has(title), `reload after ${how}`)
      const s = await h.mdState(ctx, id)
      h.assert(s.rev !== before && s.scrollY === 600, `${how}: new rev, scroll kept (${s.scrollY})`)
      h.assert(!(await h.tileOf(ctx, id)).doc.missing, `${how}: never missing`)
    }

    // Deleted: last render stays, tile knows; recreated: updates.
    rmSync(f)
    await h.waitFor(ctx, async () => (await h.tileOf(ctx, id)).doc.missing, 'missing reported')
    h.assert((await h.mdState(ctx, id)).text.includes('Fourth'), 'frozen on last render')
    writeFileSync(f, body('Fifth'))
    await h.waitFor(ctx, has('Fifth'), 'recreated file shows')
    h.assert(!(await h.tileOf(ctx, id)).doc.missing, 'not missing after recreate')

    // Shelved: a change marks the shelf item.
    await ctx.tie('move', id, '--shelve')
    await ctx.sleep(300)
    h.assert(!(await ctx.page.isVisible(`.item[data-id="${id}"].activity`)), 'no activity yet')
    writeFileSync(f, body('Sixth'))
    await h.waitFor(ctx, () => ctx.page.isVisible(`.item[data-id="${id}"].activity`), 'activity dot on change')
    await ctx.tie('move', id, '--at', a, '--side', 'r')

    // Theme change (settings preview) reaches the frame; light theme.
    await ctx.page.evaluate(() => document.dispatchEvent(new CustomEvent('tie:settings')))
    await ctx.page.waitForSelector('.settings')
    await ctx.page.selectOption('#set-theme', 'solarized-light')
    await h.waitFor(ctx, async () => (await (await h.contentFrame(ctx, id)).evaluate(() => getComputedStyle(document.documentElement).backgroundColor)) === 'rgb(253, 246, 227)', 'light theme in frame')
    await ctx.shot('light')
    await ctx.page.keyboard.press('Escape')

    // Closing stops watching (the watcher itself: unit test "closed: silent").
    await ctx.tie('close', id)
    writeFileSync(f, body('Seventh'))
    await ctx.sleep(600)
    const log = ctx.appLog()
    h.assert(/\[docs\] close \d+/.test(log) && !log.slice(log.lastIndexOf('[docs] close')).includes('[docs] change'), 'doc closed with its tile')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
