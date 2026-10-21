// Html bootstrap: injected by main (content.ts) first in the <head> of every html document an html
// tile shows, inline (the document CSP allows inline scripts). The page's only link to the host:
// handshake (one MessagePort from the UI), watchdog pong, link hovers, clicks and window.open → requests,
// scripts the CSP blocked (count)
// (the host routes them: same folder in the tile, other files beside, the web after a confirm),
// scroll kept across reloads. docs/VIEWERS.md "Html".
//
// SECURITY: not a boundary. Page scripts share this realm and may break or drive it (synthetic
// clicks, window.open): every request it can send is one any page script could. The host treats
// them as hostile (typed verbs, gesture rule, routing, confirm for the web). What keeps the page in
// is the sandbox, its own origin, the document CSP and the nav lock, not this file. Built ASCII-only
// and without "</script" (main checks before injecting).
;(() => {
  // Captured before any page script runs: later patches of these don't affect the bootstrap.
  const addEvent = EventTarget.prototype.addEventListener
  const postTo = MessagePort.prototype.postMessage
  const stop = Event.prototype.stopImmediatePropagation
  const prevent = Event.prototype.preventDefault
  const closest = Element.prototype.closest
  const getAttr = Element.prototype.getAttribute
  let store: Storage | null = null
  try {
    store = window.sessionStorage
  } catch {}
  const top = window.parent
  let port: MessagePort | null = null
  const send = (m: object) => port && postTo.call(port, m)

  // Handshake: the host posts tie:init with one port after each load. Capture phase, first
  // listener: the page never sees the port.
  addEvent.call(
    window,
    'message',
    ((e: MessageEvent) => {
      if (e.source !== top || (e.data as { type?: string })?.type !== 'tie:init' || !e.ports[0]) return
      stop.call(e)
      if (port) return
      port = e.ports[0]
      port.onmessage = (m) => {
        // Watchdog (frame.ts): answering proves the page's thread isn't stuck.
        if (m.data?.type === 'tie:ping') send({ verb: 'pong', n: m.data.n })
      }
      send({ verb: 'ready' })
    }) as EventListener,
    true,
  )

  // Scripts the document CSP refused (the page's own: inline, handlers, files, modules): counted
  // and reported, debounced; the host shows "Scripts blocked". Style and other violations don't count.
  let blocked = 0
  let blockedTimer: ReturnType<typeof setTimeout> | null = null
  addEvent.call(
    document,
    'securitypolicyviolation',
    ((e: SecurityPolicyViolationEvent) => {
      if (!/^script-src/.test(e.effectiveDirective)) return
      blocked++
      if (blockedTimer) clearTimeout(blockedTimer)
      blockedTimer = setTimeout(() => send({ verb: 'blocked', n: blocked }), 200)
    }) as EventListener,
    true,
  )
  addEvent.call(window, 'load', () => blocked && send({ verb: 'blocked', n: blocked }))

  // Pointer over a link: the host shows its real target (link strip). '' when it leaves.
  let hovered = ''
  const hoverOf = (e: Event) => {
    const a = e.target instanceof Element ? (closest.call(e.target, 'a[href], area[href]') as Element | null) : null
    return a ? (getAttr.call(a, 'href') ?? '').trim() : ''
  }
  addEvent.call(window, 'mouseover', ((e: MouseEvent) => {
    const h = hoverOf(e)
    if (h !== hovered) send({ verb: 'hover', href: (hovered = h) })
  }) as EventListener)
  addEvent.call(window, 'mouseout', ((e: MouseEvent) => {
    const to = e.relatedTarget instanceof Element ? (closest.call(e.relatedTarget, 'a[href], area[href]') as Element | null) : null
    if (!to && hovered) send({ verb: 'hover', href: (hovered = '') })
  }) as EventListener)

  // Link clicks the page didn't handle: the host decides (no navigation from here). In-page anchors
  // and javascript: links stay the page's. target=_blank / cmd-click: a new tile (or the web).
  addEvent.call(window, 'click', ((e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0) return
    const a = e.target instanceof Element ? (closest.call(e.target, 'a[href], area[href]') as HTMLAnchorElement | null) : null
    if (!a) return
    const href = (getAttr.call(a, 'href') ?? '').trim()
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return
    prevent.call(e)
    const target = getAttr.call(a, 'target') ?? ''
    send({ verb: 'followLink', href, newTile: e.metaKey || (target !== '' && target !== '_self' && target !== '_top' && target !== '_parent') })
  }) as EventListener)

  // window.open: never a popup (the sandbox has no allow-popups anyway): a request, like a link in
  // a new tile. Returns null (no window).
  const open = (url?: string | URL) => {
    if (url !== undefined && url !== null && String(url) !== '') send({ verb: 'followLink', href: String(url), newTile: true })
    return null
  }
  Object.defineProperty(window, 'open', { value: open, writable: true, configurable: true })

  // Scroll across reloads (live reload, cmd+R): saved when the page goes, restored on load if it's
  // the same page.
  const KEY = '__tie_scroll'
  addEvent.call(window, 'pagehide', () => {
    try {
      store?.setItem(KEY, JSON.stringify({ p: location.pathname, x: scrollX, y: scrollY }))
    } catch {}
  })
  addEvent.call(window, 'load', () => {
    try {
      const s = JSON.parse(store?.getItem(KEY) ?? 'null')
      store?.removeItem(KEY)
      if (s && s.p === location.pathname) scrollTo(s.x, s.y)
    } catch {}
  })
})()
