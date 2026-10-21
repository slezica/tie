import { rpc } from './lib.mjs'

// Composable scenario helpers. All take ctx = { page, tie, shot, sleep, instance }.

export async function list(ctx) {
  return ctx.tie('list')
}

export async function rectOf(ctx, id) {
  const t = (await list(ctx)).tiles.find((t) => t.id === id)
  if (!t?.rect) throw new Error(`no rect for ${id}`)
  return t.rect
}

// Point on a tile's title bar (left part, clear of buttons).
export async function titlePoint(ctx, id) {
  const r = await rectOf(ctx, id)
  return r.w < 40 ? { x: r.x + r.w / 2, y: r.y + 60 } : { x: r.x + Math.min(80, r.w / 3), y: r.y + 15 }
}

// Point inside target tile near the given side (lands in that side's drop triangle).
export async function sidePoint(ctx, id, side) {
  const r = await rectOf(ctx, id)
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  return {
    l: { x: r.x + r.w * 0.1, y: cy },
    r: { x: r.x + r.w * 0.9, y: cy },
    t: { x: cx, y: r.y + r.h * 0.1 },
    b: { x: cx, y: r.y + r.h * 0.9 },
    c: { x: cx, y: cy },
  }[side]
}

// Low-level drag; optional mid-drag hook (e.g. to take a preview shot).
export async function drag(ctx, from, to, { shift = false, steps = 12, during } = {}) {
  const m = ctx.page.mouse
  await m.move(from.x, from.y)
  await m.down()
  if (shift) await ctx.page.keyboard.down('Shift')
  await m.move(to.x, to.y, { steps })
  await ctx.sleep(120)
  if (during) await during()
  await m.up()
  if (shift) await ctx.page.keyboard.up('Shift')
  await ctx.sleep(150)
}

export async function dragTitle(ctx, id, targetId, side, opts) {
  await drag(ctx, await titlePoint(ctx, id), await sidePoint(ctx, targetId, side), opts)
}

export async function boxOf(ctx, selector) {
  const b = await ctx.page.locator(selector).first().boundingBox()
  if (!b) throw new Error(`not visible: ${selector}`)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b }
}

export const shelfItem = (ctx, id) => boxOf(ctx, `.item[data-id="${id}"]`)
export const template = (ctx, kind = 'terminal') => boxOf(ctx, `.template[data-kind="${kind}"]`)

// Drop a tile onto the shelf (below existing items).
export async function shelve(ctx, id, opts) {
  const items = await ctx.page.locator('#items').boundingBox()
  const shelf = await ctx.page.locator('#shelf').boundingBox()
  const y = Math.min(items.y + items.height + 30, shelf.y + shelf.height - 10)
  await drag(ctx, await titlePoint(ctx, id), { x: shelf.x + shelf.width / 2, y }, opts)
}

export async function unshelve(ctx, id, targetId, side, opts) {
  const p = await shelfItem(ctx, id)
  await drag(ctx, p, targetId ? await sidePoint(ctx, targetId, side) : await boardCenter(ctx), opts)
}

export async function spawnFromTemplate(ctx, targetId, side, opts) {
  const p = await template(ctx)
  await drag(ctx, p, targetId ? await sidePoint(ctx, targetId, side) : await boardCenter(ctx), opts)
}

export async function boardCenter(ctx) {
  const { board } = await list(ctx)
  return { x: board.x + board.w / 2, y: board.y + board.h / 2 }
}

export async function hoverShelf(ctx, id) {
  const p = await shelfItem(ctx, id)
  await ctx.page.mouse.move(p.x, p.y, { steps: 4 })
  await ctx.sleep(150)
}

export async function pin(ctx, id) {
  const p = await shelfItem(ctx, id)
  await ctx.page.mouse.click(p.x, p.y)
  await ctx.sleep(150)
}

export async function clickButton(ctx, id, name) {
  await ctx.page.locator(`.tile[data-id="${id}"] .btn.${name}`).click()
  await ctx.sleep(120)
}

// Three terminals via CLI: a | b over c. Returns ids.
export async function threeWaySplit(ctx) {
  const { tiles } = await list(ctx)
  const a = tiles[0].id
  // --focus: like user splits, c ends active.
  const b = (await ctx.tie('open', 'terminal', '--at', a, '--side', 'r', '--focus')).id
  const c = (await ctx.tie('open', 'terminal', '--at', b, '--side', 'b', '--focus')).id
  await ctx.sleep(300)
  return [a, b, c]
}

export function assert(cond, msg) {
  if (!cond) throw new Error(`assertion failed: ${msg}`)
}

// Every terminal's pty size matches its xterm grid (catches missed resizes).
export async function assertPtySizes(ctx) {
  for (const t of (await list(ctx)).tiles.filter((t) => t.kind === 'terminal')) {
    const { cols, rows, pty } = t.term
    assert(pty && pty.cols === cols && pty.rows === rows, `${t.id} pty ${JSON.stringify(pty)} != xterm ${cols}x${rows}`)
  }
}

// Probe: local http page that reports what it can reach. A hit means content loaded somewhere it
// shouldn't; `bridged` means it also got `window.tie` (= could spawn ptys: full RCE).
// Always `await probe.close()` (try/finally).
export async function probe(ctx) {
  const { createServer } = await import('node:http')
  const hits = []
  const reports = []
  const page = `<!doctype html><script>fetch('/report', { method: 'POST', body: JSON.stringify({ bridged: typeof window.tie === 'object' && !!window.tie, href: location.href }) })</script>`
  const srv = createServer((req, res) => {
    if (req.url === '/report') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => (reports.push(JSON.parse(body)), res.end()))
      return
    }
    hits.push(req.url)
    res.setHeader('content-type', 'text/html')
    res.end(page)
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${srv.address().port}`
  return {
    url,
    hits,
    reports,
    // Wait a bit for anything in flight, then assert nothing reached the probe.
    async assertUntouched(what, ms = 1500) {
      await ctx.sleep(ms)
      assert(!hits.length, `${what}: probe loaded (${hits.join(', ')})${reports.some((r) => r.bridged) ? ' WITH window.tie (RCE)' : ''}`)
    },
    close: () => new Promise((r) => srv.close(r)),
  }
}

// App URL the shell must stay on (guards against navigation).
export const uiUrl = (ctx) => ctx.page.evaluate(() => location.href)

// Paste text into a terminal tile as the OS would (paste event on xterm's textarea).
export async function paste(ctx, id, text) {
  await ctx.page.evaluate(
    ([id, text]) => {
      const ta = document.querySelector(`.tile[data-id="${id}"] textarea`)
      ta.focus()
      const dt = new DataTransfer()
      dt.setData('text/plain', text)
      ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    },
    [id, text],
  )
  await ctx.sleep(400)
}

// Visible text of a terminal tile.
export const screen = (ctx, id) => ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] .xterm-rows`).textContent, id)

// Open paste warning, or null: { warnings: ['control'|'run'], preview }.
export const pasteWarning = (ctx) =>
  ctx.page.evaluate(() => {
    const d = document.querySelector('.dialog.paste-warning')
    return d && { warnings: [...d.querySelectorAll('[data-warning]')].map((w) => w.dataset.warning), preview: d.querySelector('.preview').textContent }
  })

// Content frames (probe kind): window frame tree from main (`tie frames`), and a probe tile's
// Playwright frame (runs code inside the content frame: the untrusted side).
export const frames = (ctx) => ctx.tie('frames')
export async function probeFrame(ctx, id) {
  for (let i = 0; i < 30; i++) {
    const src = await ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] iframe`)?.src, id)
    const f = src && ctx.page.frames().find((f) => f.url() === src)
    if (f && (await f.evaluate(() => window.probe?.inits).catch(() => 0))) return f
    await ctx.sleep(100)
  }
  throw new Error(`no probe frame for ${id}`)
}

// Keys through main (webContents.sendInputEvent): they pass before-input-event, where shortcuts
// live. CDP keys (ctx.page.keyboard) skip it: fine for typing text, not for shortcuts.
// Chords like Playwright's: 'Meta+d', 'Meta+Shift+ArrowLeft', 'Control+Tab'. Modifiers held with
// keyDown('Meta') apply to later keys until keyUp.
const MODS = { Meta: 'meta', Control: 'control', Alt: 'alt', Shift: 'shift' }
const CODES = { ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down' }
const held = new WeakMap()
const heldOf = (ctx) => held.get(ctx) ?? (held.set(ctx, new Set()), held.get(ctx))
const keyCode = (k) => CODES[k] ?? (k.length === 1 ? k.toUpperCase() : k)
const send = (ctx, type, key, mods) => rpc(ctx.instance, 'input', { type, keyCode: keyCode(key), modifiers: [...mods] })

export async function keyDown(ctx, key) {
  const mods = heldOf(ctx)
  await send(ctx, 'keyDown', key, mods)
  if (MODS[key]) mods.add(MODS[key])
}
export async function keyUp(ctx, key) {
  const mods = heldOf(ctx)
  if (MODS[key]) mods.delete(MODS[key])
  await send(ctx, 'keyUp', key, mods)
}
export async function press(ctx, chord) {
  const parts = chord.split('+')
  const key = parts.pop()
  const mods = new Set([...heldOf(ctx), ...parts.map((m) => MODS[m])])
  await send(ctx, 'keyDown', key, mods)
  await send(ctx, 'keyUp', key, mods)
}

// Content frame of a tile (any content kind), once its viewer has answered the handshake. Looked
// up by the tile's iframe src each time: a markdown tile reloads its frame when it navigates to
// another directory (new token).
export async function contentFrame(ctx, id, ms = 5000) {
  for (let t = 0; t < ms; t += 100) {
    const src = await ctx.page.evaluate((id) => document.querySelector(`.tile[data-id="${id}"] iframe`)?.src, id)
    const f = src && ctx.page.frames().find((f) => f.url() === src)
    if (f && (await f.evaluate(() => !!(window.probe?.inits || window.viewer?.port)).catch(() => false))) return f
    await ctx.sleep(100)
  }
  throw new Error(`no content frame for ${id}`)
}

// Html tile's frame (the page's realm: what page scripts can do), once its bootstrap answered the
// handshake. Found by the page URL main reports (`tie list --json` page.url); re-found after
// navigations.
export async function htmlFrame(ctx, id, ms = 5000) {
  for (let t = 0; t < ms; t += 100) {
    const p = (await tileOf(ctx, id))?.page
    const f = p?.ready && ctx.page.frames().find((f) => f.url().split('#')[0] === p.url)
    if (f) return f
    await ctx.sleep(100)
  }
  throw new Error(`no html frame for ${id}`)
}

// Markdown tile as its viewer shows it: rendered text, revision, scroll, renders, source key.
export async function mdState(ctx, id) {
  const f = await contentFrame(ctx, id)
  return f.evaluate(() => ({
    text: document.getElementById('doc').innerText,
    html: document.getElementById('doc').innerHTML,
    rev: window.markdown.rev,
    key: window.markdown.key,
    renders: window.markdown.renders,
    scrollY: Math.round(scrollY),
  }))
}

// Poll until fn() is truthy (returns its value), else throw `what`.
export async function waitFor(ctx, fn, what, ms = 4000) {
  for (let t = 0; t < ms; t += 50) {
    const v = await fn().catch(() => null)
    if (v) return v
    await ctx.sleep(50)
  }
  throw new Error(`timed out: ${what}`)
}

// `tie list --json` entry of a tile.
export const tileOf = async (ctx, id) => (await list(ctx)).tiles.find((t) => t.id === id)

// Next file picker answer in this harness instance (path, or null = cancel). Main, dev socket.
export const pickNext = (ctx, path) => rpc(ctx.instance, 'pick', { path })

// OS drag-and-drop at a point (CDP): data = { files: [paths] } or { items: [{ mimeType, data }] }.
export async function osDrop(ctx, at, data) {
  const cdp = await ctx.page.context().newCDPSession(ctx.page)
  for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, ...at, data: { dragOperationsMask: 1, items: [], ...data } })
  await cdp.detach()
  await ctx.sleep(500)
}

// Real click on an element inside a content frame (hidden-window scenarios route it into the
// frame). `meta`: cmd held.
export async function clickIn(ctx, frame, selector, { meta = false } = {}) {
  const b = await frame.locator(selector).first().boundingBox()
  if (!b) throw new Error(`not visible in frame: ${selector}`)
  if (meta) await ctx.page.keyboard.down('Meta')
  await ctx.page.mouse.click(b.x + Math.min(b.width / 2, 10), b.y + b.height / 2)
  if (meta) await ctx.page.keyboard.up('Meta')
  await ctx.sleep(300)
}

// Local web site for browser tiles: `route(path, req)` → string (html) | {status, headers, body} |
// null (404). Every request recorded in `hits` (path). Always `await site.close()` (try/finally).
export async function site(ctx, route) {
  const { createServer } = await import('node:http')
  const hits = []
  const srv = createServer((req, res) => {
    hits.push(req.url)
    const r = route(req.url, req)
    if (r === null || r === undefined) return void ((res.statusCode = 404), res.end('not found'))
    const o = typeof r === 'string' ? { body: r } : r
    res.statusCode = o.status ?? 200
    res.setHeader('content-type', 'text/html; charset=utf-8')
    for (const [k, v] of Object.entries(o.headers ?? {})) res.setHeader(k, v)
    res.end(o.body ?? '')
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${srv.address().port}`, hits, close: () => new Promise((r) => (srv.closeAllConnections?.(), srv.close(r))) }
}

// Browser tile's guest as a Playwright page (CDP target type webview), found by the tile's URL
// (`tie list --json` web.url), once its page has loaded.
export async function guestPage(ctx, id, ms = 5000) {
  for (let t = 0; t < ms; t += 100) {
    const w = (await tileOf(ctx, id))?.web
    const p = w?.ready && ctx.page.context().browser().contexts().flatMap((c) => c.pages()).find((p) => p.url() === w.url)
    if (p && (await p.evaluate(() => document.readyState === 'complete').catch(() => false))) return p
    await ctx.sleep(100)
  }
  throw new Error(`no guest page for ${id}`)
}

// Input sent to a browser tile's guest by main (sendInputEvent): passes the guest's own
// before-input-event (shortcuts) and input-event (popup gesture), like real input. Chord: 'Meta+d'.
export async function guestKey(ctx, id, chord) {
  const parts = chord.split('+')
  const key = parts.pop()
  const guest = (await tileOf(ctx, id)).web.guest
  await rpc(ctx.instance, 'guest', { action: 'key', id: guest, keyCode: keyCode(key), modifiers: parts.map((m) => MODS[m]) })
}
export async function guestClick(ctx, id, x, y) {
  const guest = (await tileOf(ctx, id)).web.guest
  await rpc(ctx.instance, 'guest', { action: 'click', id: guest, x, y })
}
