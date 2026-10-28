// Viewer runtime: what every Tie viewer (markdown, text, image, hex) runs in its content
// frame (sandboxed, opaque origin, strict CSP). Handshake with the host (one MessagePort per
// document), watchdog pong, theme (CSS custom properties via CSSOM: the CSP blocks style
// attributes), message dispatch, anchors, link clicks → requests (from the click handler only:
// the host also requires frame focus), scroll keys, and the guards (nothing navigates). A viewer
// supplies only its pipeline. Harness view: window.viewer (also window[name]). docs/TILES.md
// "Viewers".

// The page's nonce (script tag): styles and scripts added later carry it (CSP).
export const NONCE = (document.currentScript as HTMLScriptElement | null)?.nonce ?? ''

export interface Theme {
  vars: Record<string, string>
  dark: boolean
}

export type Message = { type: string; [k: string]: unknown }

export interface ViewerSpec {
  name: string // harness global (window[name])
  onMessage(m: Message): void // kind messages (doc, ...); runtime ones are handled here
  onTheme?(t: Theme): void // after the vars are set
  anchor?(id: string): Element | null // in-page target of #id (decoded)
  links?: boolean // <a> clicks → followLink requests (else clicks on links do nothing)
  keys?: Record<string, () => void> // plain keys (no modifiers), frame focused
}

export interface ViewerState {
  name: string
  port: MessagePort | null
  theme: Theme
}

// A <style> carrying the page nonce (works under nonce and 'unsafe-inline' style policies alike).
export function style(css: string) {
  const s = document.createElement('style')
  s.nonce = NONCE
  s.textContent = css
  document.head.append(s)
}

// Shared base: colors from the theme, selection, focus.
style(`
:root {
  --muted: color-mix(in srgb, var(--fg) 62%, var(--bg));
  --mark: color-mix(in srgb, var(--accent) 30%, var(--bg));
  background: var(--bg);
  color: var(--fg);
  -webkit-font-smoothing: antialiased;
}
::selection { background: var(--mark); }
:focus { outline: none; }
:focus-visible { outline: 1px solid var(--accent); outline-offset: 1px; }
`)

let anchorOf: ViewerSpec['anchor'] = undefined

// Scroll to the element of `#id` (percent-decoded), if the viewer has anchors.
export function scrollToHash(hash: string) {
  let id = hash.replace(/^#/, '')
  try {
    id = decodeURIComponent(id)
  } catch {}
  anchorOf?.(id)?.scrollIntoView()
}

// `extra`: the viewer's own harness fields (kept as is, getters included).
export function startViewer<T extends object>(spec: ViewerSpec, extra: T): ViewerState & T {
  const state = Object.assign(extra, { name: spec.name, port: null as MessagePort | null, theme: { vars: {}, dark: true } as Theme })
  const w = window as unknown as Record<string, unknown>
  w.viewer = w[spec.name] = state
  anchorOf = spec.anchor

  // Scroll position to the host (throttled): kept there, restored after a viewer reload (dev).
  let scrollTimer = 0
  addEventListener(
    'scroll',
    () => {
      if (scrollTimer) return
      scrollTimer = setTimeout(() => {
        scrollTimer = 0
        state.port?.postMessage({ verb: 'scrolled', y: Math.max(0, Math.round(scrollY)) })
      }, 200) as unknown as number
    },
    { passive: true },
  )

  function onMessage(m: Message) {
    // Watchdog (frame.ts): answering proves this thread isn't stuck.
    if (m.type === 'tie:ping') return state.port?.postMessage({ verb: 'pong', n: m.n })
    if (m.type === 'theme') {
      const s = document.documentElement.style
      const vars = (m.vars ?? {}) as Record<string, unknown>
      const theme: Theme = { vars: {}, dark: !!m.dark }
      for (const [k, v] of Object.entries(vars)) if (/^--[a-z0-9-]+$/.test(k) && typeof v === 'string') s.setProperty(k, (theme.vars[k] = v))
      s.colorScheme = theme.dark ? 'dark' : 'light'
      state.theme = theme
      return spec.onTheme?.(theme)
    }
    if (m.type === 'scroll') return scrollToHash(String(m.hash ?? ''))
    spec.onMessage(m)
  }

  // Handshake: the host posts tie:init with one port after load; everything after goes over it.
  addEventListener('message', (e) => {
    if (state.port || e.source !== parent || (e.data as { type?: string })?.type !== 'tie:init' || !e.ports[0]) return
    state.port = e.ports[0]
    state.port.onmessage = (m) => typeof m.data?.type === 'string' && onMessage(m.data as Message)
    state.port.postMessage({ verb: 'ready' })
  })

  // Clicks on links: nothing navigates. With `links`, anchors scroll here and the rest become
  // requests (only from here: a real click). SVG links may use xlink:href.
  addEventListener('click', (e) => {
    const a = (e.target as Element).closest?.('a')
    if (!a) return
    e.preventDefault()
    if (!spec.links) return
    const href = a.getAttribute('href') ?? a.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? ''
    if (!href) return
    if (href.startsWith('#')) return scrollToHash(href)
    state.port?.postMessage({ verb: 'followLink', href, newTile: e.metaKey })
  })

  // Shift+Up / Shift+Down: scroll a third of the tile's height (fast scanning). Plain arrows keep the
  // browser's small step. Plain keys: the viewer's (`keys`); viewers have no text input to steal from.
  addEventListener('keydown', (e) => {
    const plain = !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey
    const fn = plain && spec.keys && Object.hasOwn(spec.keys, e.key) ? spec.keys[e.key] : null
    if (fn) {
      e.preventDefault()
      return fn()
    }
    if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return
    e.preventDefault()
    scrollBy({ top: (e.key === 'ArrowDown' ? 1 : -1) * Math.round(innerHeight / 3), behavior: 'instant' })
  })

  // Pointer over a link: the host shows its real target in the tile's link strip ('' = left).
  if (spec.links) {
    let hovered = ''
    const hrefOf = (t: EventTarget | null) => {
      const a = (t as Element | null)?.closest?.('a')
      return a ? (a.getAttribute('href') ?? a.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? '') : ''
    }
    addEventListener('mouseover', (e) => {
      const h = hrefOf(e.target)
      if (h !== hovered) state.port?.postMessage({ verb: 'hover', href: (hovered = h) })
    })
    addEventListener('mouseout', (e) => {
      if (hovered && !hrefOf(e.relatedTarget)) state.port?.postMessage({ verb: 'hover', href: (hovered = '') })
    })
  }

  // Middle clicks, drops: never navigate (the nav lock would refuse anyway).
  addEventListener('auxclick', (e) => (e.target as Element).closest?.('a') && e.preventDefault())
  addEventListener('dragover', (e) => e.preventDefault())
  addEventListener('drop', (e) => e.preventDefault())

  return state
}
