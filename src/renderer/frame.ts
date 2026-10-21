// Frame host: content kinds render in a sandboxed iframe on their own tie-content://<token>/ origin.
// The host applies the baseline (sandbox from the policy table, port handshake, request checks,
// focus, pointer shield, watchdog); a kind supplies only its viewer name, root and request
// handlers. Document kinds (html: nav 'within-root') also name a page and may navigate: main
// reports their navigations and folder changes; a navigation isn't a crash. docs/TILES.md.
import { S, tie, location, debug } from './state'
import { untrusted } from '@core/log'
import { activate } from './ops'
import { parseRequest, needsGesture, type Request, type Verb } from '@core/requests'
import { watchdog, tick, pong, TICK_MS } from '@core/watchdog'
import { policyOf } from '@core/policy'
import type { Host, Surface } from './kinds'

export type Handlers = { [V in Verb]?: (req: Extract<Request, { verb: V }>) => void }

export interface FrameSpec {
  viewer: string // content kind (policy table row; viewer out/viewers/<viewer>.html|js)
  root: string // directory the frame may read files from
  title: string
  icon: string
  handlers: Handlers
  onReady?: () => void // viewer answered the handshake (each load): send it its content
  page?: string // document kinds: the page to show, path relative to root (as on disk)
  onNavigate?: (page: string) => void // document kinds: the frame now shows `page` (relative, decoded)
  onChanged?: () => void // document kinds: something in the root folder changed
}

// What a content kind gets back: the Surface, plus messages to its viewer and root changes.
export interface FrameSurface extends Surface {
  post(msg: unknown, transfer?: Transferable[]): void // to the viewer, over the port (dropped before the handshake)
  setRoot(root: string, page?: string): Promise<void> // new token for another directory; the viewer reloads
  load(page: string): void // document kinds: show another page of the root (or reload this one)
  origin(): string | null // the frame's tie-content://<token> (null before mount)
}

// Main's reports for document frames, by token (initFrames).
const byToken = new Map<string, { navigated(path: string): void; failed(url: string): void; changed(): void }>()
const docUrl = (token: string, page: string) => `tie-content://${token}/${page.split('/').map(encodeURIComponent).join('/')}`

// MessagePort's close event (Chromium): fires when the other end's document goes away.
type Port = MessagePort & { onclose: ((e: Event) => void) | null }

const READY_MS = 5000 // viewer must answer the handshake by then, else the tile shows an error
const GESTURE_MS = 150 // an unfocused gesture request waits this long for the frame's focus
const NAV_GRACE_MS = 5000 // documents: port closed, a load must follow by then (else crashed)
const FLOOD_MAX = 1000 // frame messages handled per second; the rest dropped (a flooding page can't jank the UI)

// SECURITY: focus. A cross-origin iframe could call window.focus() / el.focus() at any time and
// become document.activeElement (the gesture rule's signal; and the keyboard would follow). Blink
// refuses such calls from a frame without transient user activation when the frame's permissions
// policy denies `focus-without-user-activation` (`allow` below; feature enabled in main/index.ts):
// a frame is focused only by a click / Tab into it, the UI focusing it, or a script within a
// few seconds of the user's last click in it (sec-focus).

// Watchdog (timing: core/watchdog.ts): the host pings the viewer over the port. No pong in time =
// the viewer is stuck (busy loop, runaway layout, OOM); a closed port = its process died. Either
// way the tile shows an error and the frame is removed (a hung one's process killed). No automatic
// reload: a document that hangs the viewer would hang it again; the user reopens the tile.
export function frameSurface(host: Host, spec: FrameSpec): FrameSurface {
  let token: string | null = null
  let frame: HTMLIFrameElement | null = null
  let port: Port | null = null
  let readyTimer: ReturnType<typeof setTimeout> | null = null
  let ready = false // viewer answered this document's handshake
  let dog = watchdog(Date.now())
  let ticker: ReturnType<typeof setInterval> | null = null
  let dead = false // failed: frame gone, error shown
  const policy = policyOf(spec.viewer)
  const navigates = policy?.nav === 'within-root' // documents navigate: a closed port may be a navigation
  let page = spec.page ?? '' // documents: page shown now (relative to root, decoded)
  let graceTimer: ReturnType<typeof setTimeout> | null = null

  const stop = () => {
    if (readyTimer) clearTimeout(readyTimer)
    if (ticker) clearInterval(ticker)
    if (graceTimer) clearTimeout(graceTimer)
    readyTimer = ticker = graceTimer = null
    if (port) port.onmessage = port.onclose = null
    port?.close()
    port = null
  }

  // SECURITY: a stuck or crashed frame is content failing, never the UI's problem: the frame
  // goes away (frees its process: a busy loop would burn a core forever) and the failure stays
  // visible. Once only; nothing restarts it.
  const fail = (message: string, why: string) => {
    if (dead || !host.alive()) return
    dead = true
    stop()
    // Hung: main kills the frame's process first (needs the frame still in the tree), then closes.
    if (token) (why === 'hung' ? tie.content.kill : tie.content.close)(token)
    if (token) byToken.delete(token)
    token = null
    frame?.remove()
    frame = null
    debug('content', why, host.id, spec.viewer)
    host.error(message)
  }

  const onTick = () => {
    if (!port || !ready) return void (dog.lastTick = Date.now())
    const r = tick(dog, Date.now())
    if (r === 'hung') fail('Viewer stopped responding', 'hung')
    else if (r === 'ping') port.postMessage({ type: 'tie:ping', n: dog.ping!.n })
  }

  // SECURITY: frame messages are untrusted: parseRequest (shape) first, then the kind's handler
  // for that verb, if any. Everything else is dropped and logged, never thrown into the frame.
  // Beyond FLOOD_MAX a second: dropped unparsed (a tight postMessage loop costs the UI nothing).
  let msgs = 0
  let msgsAt = 0
  const onRequest = (data: unknown) => {
    const now = Date.now()
    if (now - msgsAt > 1000) (msgsAt = now), (msgs = 0)
    if (++msgs > FLOOD_MAX) return void (msgs === FLOOD_MAX + 1 && debug('security', 'message flood, dropping', host.id))
    const req = parseRequest(data)
    if (!req) return debug('security', 'dropped request', host.id, untrusted(safeJson(data)))
    // SECURITY: verbs acting for the user (open a link, write a file) only while this frame has
    // focus: the user clicked or typed in it (VS Code's rule; a script can't take focus by itself:
    // see "focus" above). The viewer posts them from its click handler only. A click into a frame
    // that wasn't focused: its request can arrive (other process) before the UI sees the focus
    // move, so an unfocused request waits GESTURE_MS for it, then is refused.
    if (needsGesture(req.verb) && !focused()) {
      const r = req
      return void setTimeout(() => (focused() ? handle(r) : debug('security', 'refused request without focus', host.id, r.verb)), GESTURE_MS)
    }
    handle(req)
  }
  const focused = () => !!frame && document.activeElement === frame

  const handle = (req: Request) => {
    if (dead || !host.alive()) return
    if (req.verb === 'pong') return pong(dog, req.n)
    if (req.verb === 'ready') {
      if (readyTimer) clearTimeout(readyTimer)
      readyTimer = null
      ready = true
      dog = watchdog(Date.now())
      ticker ??= setInterval(onTick, TICK_MS)
      spec.onReady?.()
    }
    const fn = spec.handlers[req.verb] as ((r: Request) => void) | undefined
    if (fn) fn(req)
    else if (req.verb !== 'ready') debug('security', 'unhandled request', host.id, req.verb)
  }

  // SECURITY: one MessagePort per loaded document, posted to the exact contentWindow. Viewer
  // frames' origin is opaque, so targetOrigin must be '*'; safe because the frame can only ever show
  // this tile's viewer, or (documents) its token's own pages (nav lock in main). No window `message`
  // listener: requests come over the port only.
  const connect = () => {
    if (dead) return
    if (port) port.onmessage = port.onclose = null
    port?.close()
    ready = false
    const ch = new MessageChannel()
    port = ch.port1 as Port
    port.onmessage = (e) => onRequest(e.data)
    // The viewer's end closes when its document goes away: navigation (we close ours first) or its
    // renderer process dying. Documents also navigate themselves: then a load follows (connect
    // again); no load in time = crashed.
    port.onclose = () => {
      if (!navigates) return fail('Viewer crashed', 'crashed')
      if (port) port.onmessage = port.onclose = null
      port = null
      ready = false
      if (readyTimer) clearTimeout(readyTimer)
      readyTimer = null
      graceTimer ??= setTimeout(() => fail('Page crashed', 'crashed'), NAV_GRACE_MS)
    }
    frame?.contentWindow?.postMessage({ type: 'tie:init' }, '*', [ch.port2])
    if (readyTimer) clearTimeout(readyTimer)
    readyTimer = setTimeout(() => fail('Content did not load', 'no ready'), READY_MS)
  }

  // Documents: main's reports for this token.
  const track = (t: string) =>
    byToken.set(t, {
      navigated: (path) => {
        let p = path.replace(/^\//, '')
        try {
          p = decodeURIComponent(p)
        } catch {}
        if (p === page) return
        page = p
        spec.onNavigate?.(p)
      },
      // SECURITY: the page tried to leave (http(s), file:, another scheme) and the UI CSP refused:
      // the frame shows an error page. No retry (decision 2026-10-21: predictability): the tile
      // fails at once, saying where the page tried to go (untrusted text, shown as text, bounded).
      failed: (url) => fail(`Page navigated away: ${url.slice(0, 200)}`, 'navigation away'),
      changed: () => spec.onChanged?.(),
    })

  // Close our end before the host navigates the frame itself (not a crash, no grace needed).
  const detach = () => {
    if (port) port.onmessage = port.onclose = null
    port?.close()
    port = null
    ready = false
  }

  const surface: FrameSurface = {
    mount: async () => {
      if (!policy) return host.error(`No policy for ${spec.viewer}`)
      const res = await tie.content.open(spec.root, spec.viewer, spec.page).catch((e: Error) => ({ error: e.message }))
      if (!host.alive()) return void ('token' in res && tie.content.close(res.token))
      if ('error' in res) return host.error(res.error)
      token = res.token
      if (navigates) track(token)
      frame = document.createElement('iframe')
      frame.className = 'content'
      // SECURITY: sandbox from the policy table (viewers: scripts only. No allow-same-origin: opaque
      // origin, can't reach the UI or its storage. Documents: allow-same-origin = their own
      // token's origin, still cross-origin to the UI: they can't lift the sandbox. No popups, top
      // navigation, forms, modals, downloads). No permissions, no referrer.
      frame.setAttribute('sandbox', policy.sandbox.join(' '))
      frame.setAttribute('allow', "focus-without-user-activation 'none'") // Blink refuses focus() from the frame without a user gesture (main/index.ts)
      frame.referrerPolicy = 'no-referrer'
      frame.addEventListener('load', () => {
        if (graceTimer) clearTimeout(graceTimer)
        graceTimer = null
        connect()
      })
      frame.src = res.url
      host.body.appendChild(frame)
      debug('content', 'frame', host.id, spec.viewer)
    },
    resize: () => {}, // the iframe fills the body (CSS)
    dispose: () => {
      dead = true
      stop()
      frame?.remove()
      if (token) byToken.delete(token)
      if (token) tie.content.close(token)
    },
    focus: () => {
      if (!frame) return false
      frame.focus()
      return true
    },
    title: () => spec.title,
    icon: () => spec.icon,
    post: (msg, transfer = []) => {
      if (!port) return
      dog.lastPost = Date.now()
      port.postMessage(msg, transfer)
    },
    setRoot: async (root, p) => {
      const res = await tie.content.open(root, spec.viewer, p).catch((e: Error) => ({ error: e.message }))
      if (!host.alive() || !frame || dead) return void ('token' in res && tie.content.close(res.token))
      if ('error' in res) return host.error(res.error)
      const old = token
      token = res.token
      if (navigates) track(token)
      if (p !== undefined) page = p
      detach()
      frame.src = res.url // same element: the nav lock binds the new token to this frame
      if (old) byToken.delete(old)
      if (old) tie.content.close(old)
      debug('content', 'root', host.id, spec.viewer)
    },
    origin: () => (token ? `tie-content://${token}` : null),
    load: (p) => {
      if (!frame || !token || dead || !navigates) return
      const [path, hash] = [p.replace(/#.*$/, ''), p.match(/#.*$/)?.[0] ?? '']
      // Same page with a #fragment: an in-page scroll, the document (and its port) stays.
      if (!(path === page && hash)) detach()
      page = path
      frame.src = docUrl(token, path) + hash // the nav lock: documents of this root only
      debug('content', 'load', host.id, page)
    },
  }
  return surface
}

const safeJson = (v: unknown) => {
  try {
    return JSON.stringify(v)?.slice(0, 200)
  } catch {
    return String(v)
  }
}

// A click inside a frame (or a browser guest) never reaches the UI (no pointerdown): the UI
// window blurs and the iframe (webview) becomes document.activeElement. Activate its tile, as a
// pointerdown would. (Frames can't focus themselves by script: "focus" above.)
export function initFrames() {
  tie.content.onNavigated((token, path) => byToken.get(token)?.navigated(path))
  tie.content.onNavFailed((token, url) => byToken.get(token)?.failed(String(url)))
  tie.content.onChanged((token) => byToken.get(token)?.changed())
  window.addEventListener('blur', () =>
    setTimeout(() => {
      const el = document.activeElement
      if (!(el instanceof HTMLIFrameElement) && el?.tagName !== 'WEBVIEW') return
      const id = (el.closest('.tile') as HTMLElement | null)?.dataset.id
      if (!id || !S.tiles.has(id) || S.active === id) return
      if (location(id) === 'shelved' && S.pinned !== id) return
      activate(id)
    }),
  )
}
