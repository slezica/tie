// Frame host: content kinds render in a sandboxed iframe on their own tie-content://<token>/ origin.
// The host applies the baseline (sandbox, port handshake, request checks, focus, pointer shield);
// a kind supplies only its viewer name, root and request handlers. docs/TILES.md.
import { S, tie, location, debug } from './state'
import { activate } from './ops'
import { parseRequest, type Request, type Verb } from '@core/requests'
import type { Host, Surface } from './kinds'

export type Handlers = { [V in Verb]?: (req: Extract<Request, { verb: V }>) => void }

export interface FrameSpec {
  viewer: string // viewer name: out/viewers/<viewer>.html|js
  root: string // directory the frame may read files from
  title: string
  icon: string
  handlers: Handlers
}

const READY_MS = 5000 // viewer must answer the handshake by then, else the tile shows an error

export function frameSurface(host: Host, spec: FrameSpec): Surface {
  let token: string | null = null
  let frame: HTMLIFrameElement | null = null
  let port: MessagePort | null = null
  let readyTimer: ReturnType<typeof setTimeout> | null = null

  // SECURITY: frame messages are untrusted: parseRequest (shape) first, then the kind's handler
  // for that verb, if any. Everything else is dropped and logged, never thrown into the frame.
  const onRequest = (data: unknown) => {
    const req = parseRequest(data)
    if (!req) return debug('security', 'dropped request', host.id, safeJson(data))
    if (req.verb === 'ready') {
      if (readyTimer) clearTimeout(readyTimer)
      readyTimer = null
    }
    const fn = spec.handlers[req.verb] as ((r: Request) => void) | undefined
    if (fn) fn(req)
    else if (req.verb !== 'ready') debug('security', 'unhandled request', host.id, req.verb)
  }

  // SECURITY: one MessagePort per loaded document, posted to the exact contentWindow. The frame's
  // origin is opaque, so targetOrigin must be '*'; safe because the frame can only ever show this
  // tile's viewer (nav lock in main). No window `message` listener: requests come over the port only.
  const connect = () => {
    port?.close()
    const ch = new MessageChannel()
    port = ch.port1
    port.onmessage = (e) => onRequest(e.data)
    frame?.contentWindow?.postMessage({ type: 'tie:init' }, '*', [ch.port2])
    if (readyTimer) clearTimeout(readyTimer)
    readyTimer = setTimeout(() => host.alive() && host.error('Content did not load'), READY_MS)
  }

  return {
    mount: async () => {
      const res = await tie.content.open(spec.root, spec.viewer).catch((e: Error) => ({ error: e.message }))
      if (!host.alive()) return void ('token' in res && tie.content.close(res.token))
      if ('error' in res) return host.error(res.error)
      token = res.token
      frame = document.createElement('iframe')
      frame.className = 'content'
      // SECURITY: scripts only. No allow-same-origin (opaque origin: can't reach the shell or its
      // storage), no popups, top navigation, forms, modals, downloads. No permissions, no referrer.
      frame.setAttribute('sandbox', 'allow-scripts')
      frame.setAttribute('allow', '')
      frame.referrerPolicy = 'no-referrer'
      frame.addEventListener('load', connect)
      frame.src = res.url
      host.body.appendChild(frame)
      debug('content', 'frame', host.id, spec.viewer)
    },
    resize: () => {}, // the iframe fills the body (CSS)
    dispose: () => {
      if (readyTimer) clearTimeout(readyTimer)
      port?.close()
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
  }
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
