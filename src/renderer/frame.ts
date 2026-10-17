// Frame host: content kinds render in a sandboxed iframe on their own tie-content://<token>/ origin.
// The host applies the baseline (sandbox from the policy table, port handshake, request checks,
// focus, pointer shield); a kind supplies only its viewer name, root and request handlers.
// docs/TILES.md.
import { S, tie, location, debug } from './state'
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
}

// What a content kind gets back: the Surface, plus messages to its viewer and root changes.
export interface FrameSurface extends Surface {
  post(msg: unknown): void // to the viewer, over the port (dropped before the handshake)
  setRoot(root: string): Promise<void> // new token for another directory; the viewer reloads
}

// MessagePort's close event (Chromium): fires when the other end's document goes away.
type Port = MessagePort & { onclose: ((e: Event) => void) | null }

const READY_MS = 5000 // viewer must answer the handshake by then, else the tile shows an error

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

  const stop = () => {
    if (readyTimer) clearTimeout(readyTimer)
    if (ticker) clearInterval(ticker)
    readyTimer = ticker = null
    if (port) port.onmessage = port.onclose = null
    port?.close()
    port = null
  }

  // SECURITY: a stuck or crashed frame is content failing, never the shell's problem: the frame
  // goes away (frees its process: a busy loop would burn a core forever) and the failure stays
  // visible. Once only; nothing restarts it.
  const fail = (message: string, why: string) => {
    if (dead || !host.alive()) return
    dead = true
    stop()
    // Hung: main kills the frame's process first (needs the frame still in the tree), then closes.
    if (token) (why === 'hung' ? tie.content.kill : tie.content.close)(token)
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
  const onRequest = (data: unknown) => {
    const req = parseRequest(data)
    if (!req) return debug('security', 'dropped request', host.id, safeJson(data))
    // SECURITY: verbs acting for the user (open a link, write a file) only while this frame has
    // focus: the user just clicked or typed in it (VS Code's rule). The viewer posts them from its
    // click handler only; script running in the frame without a gesture gets nothing.
    if (needsGesture(req.verb) && (!frame || document.activeElement !== frame)) return debug('security', 'refused request without focus', host.id, req.verb)
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

  // SECURITY: one MessagePort per loaded document, posted to the exact contentWindow. The frame's
  // origin is opaque, so targetOrigin must be '*'; safe because the frame can only ever show this
  // tile's viewer (nav lock in main). No window `message` listener: requests come over the port only.
  const connect = () => {
    if (dead) return
    if (port) port.onmessage = port.onclose = null
    port?.close()
    ready = false
    const ch = new MessageChannel()
    port = ch.port1 as Port
    port.onmessage = (e) => onRequest(e.data)
    // The viewer's end closes when its document goes away: navigation (we close ours first) or its
    // renderer process dying.
    port.onclose = () => fail('Viewer crashed', 'crashed')
    frame?.contentWindow?.postMessage({ type: 'tie:init' }, '*', [ch.port2])
    if (readyTimer) clearTimeout(readyTimer)
    readyTimer = setTimeout(() => fail('Content did not load', 'no ready'), READY_MS)
  }

  const surface: FrameSurface = {
    mount: async () => {
      const policy = policyOf(spec.viewer)
      if (!policy) return host.error(`No policy for ${spec.viewer}`)
      const res = await tie.content.open(spec.root, spec.viewer).catch((e: Error) => ({ error: e.message }))
      if (!host.alive()) return void ('token' in res && tie.content.close(res.token))
      if ('error' in res) return host.error(res.error)
      token = res.token
      frame = document.createElement('iframe')
      frame.className = 'content'
      // SECURITY: sandbox from the policy table (viewers: scripts only. No allow-same-origin: opaque
      // origin, can't reach the shell or its storage; no popups, top navigation, forms, modals,
      // downloads). No permissions, no referrer.
      frame.setAttribute('sandbox', policy.sandbox.join(' '))
      frame.setAttribute('allow', '')
      frame.referrerPolicy = 'no-referrer'
      frame.addEventListener('load', connect)
      frame.src = res.url
      host.body.appendChild(frame)
      debug('content', 'frame', host.id, spec.viewer)
    },
    resize: () => {}, // the iframe fills the body (CSS)
    dispose: () => {
      dead = true
      stop()
      frame?.remove()
      if (token) tie.content.close(token)
    },
    focus: () => {
      if (!frame) return false
      frame.focus()
      return true
    },
    title: () => spec.title,
    icon: () => spec.icon,
    post: (msg) => {
      if (!port) return
      dog.lastPost = Date.now()
      port.postMessage(msg)
    },
    setRoot: async (root) => {
      const res = await tie.content.open(root, spec.viewer).catch((e: Error) => ({ error: e.message }))
      if (!host.alive() || !frame || dead) return void ('token' in res && tie.content.close(res.token))
      if ('error' in res) return host.error(res.error)
      const old = token
      token = res.token
      if (port) port.onmessage = port.onclose = null
      port?.close()
      port = null
      ready = false
      frame.src = res.url // same element: the nav lock binds the new token to this frame
      if (old) tie.content.close(old)
      debug('content', 'root', host.id, spec.viewer)
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

// A click inside a frame never reaches the shell (no pointerdown): the shell window blurs and the
// iframe becomes document.activeElement. Activate its tile, as a pointerdown would.
export function initFrames() {
  window.addEventListener('blur', () =>
    setTimeout(() => {
      const el = document.activeElement
      if (!(el instanceof HTMLIFrameElement)) return
      const id = (el.closest('.tile') as HTMLElement | null)?.dataset.id
      if (!id || !S.tiles.has(id) || S.active === id) return
      if (location(id) === 'shelved' && S.pinned !== id) return
      activate(id)
    }),
  )
}
