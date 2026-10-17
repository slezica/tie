// Live updates for block viewers (markdown; text in P2): the file changed on disk, the document
// is rebuilt off-screen and put on screen by a keyed DOM diff, so the view never moves. Blocks
// whose key is new are the changes: marked (marks.ts). docs/MARKDOWN.md "Live updates".
// SECURITY: the diff (morphdom) moves and copies nodes of the already-built tree, never parses
// strings: only what the viewer built (sanitized) enters the page.
import morphdom from 'morphdom'
import * as marks from './marks'
import { style } from './runtime'

// Short stable hash (FNV-1a, base 36): block keys (and diagram ids).
export function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
}

export interface LiveOpts {
  // Block key source (default: its HTML). Markdown diagrams: their source.
  blockHash?(el: Element): string
  // Blocks keyed by source whose rendering may still change (diagrams: theme, rendered later):
  // updated in place, mark carried over. Others with the same key are left alone (same node).
  volatile?(el: Element): boolean
}

export type How = 'page' | 'live' | 'quiet'

// Manual anchoring: native scroll anchoring didn't hold (morphdom moves nodes) and never applies
// at scroll 0.
style(':root { overflow-anchor: none; }')

export function createLive(root: HTMLElement, opts: LiveOpts = {}) {
  root.classList.add('live')
  const keyOf = (n: Node) => (n instanceof Element ? (n.getAttribute('data-k') ?? undefined) : undefined)
  const live = {
    renders: 0,
    // Key the top-level blocks of `next`: data-k = hash + occurrence.
    key(next: HTMLElement) {
      const seen = new Map<string, number>()
      for (const el of next.children) {
        const h = opts.blockHash?.(el) ?? hash(el.outerHTML)
        const n = seen.get(h) ?? 0
        seen.set(h, n + 1)
        el.setAttribute('data-k', n ? `${h}-${n}` : h)
      }
    },
    // Put `next` on screen.
    // - page: replace everything (new document, navigation); marks cleared.
    // - live: DOM diff (keyed by data-k): unchanged blocks stay; blocks with new keys are the
    //   changes: marked. The first block on screen that survives keeps its on-screen position.
    // - quiet: diff without marks (theme, late renders after a page).
    place(next: HTMLElement, how: How) {
      if (how === 'page') {
        root.replaceChildren(...next.childNodes)
        marks.clear()
      } else {
        const before = new Set([...root.children].map(keyOf))
        const kept = new Set([...next.children].map(keyOf))
        const anchor = [...root.children].find((el) => el.getBoundingClientRect().bottom > 0 && kept.has(keyOf(el)))
        const key = anchor && keyOf(anchor)
        const top = anchor?.getBoundingClientRect().top ?? 0
        morphdom(root, next, {
          childrenOnly: true,
          getNodeKey: keyOf,
          onBeforeElUpdated: (from, to) => {
            if (from.parentNode !== root) return true
            if (!opts.volatile?.(to)) return false
            for (const c of ['changed', 'fading']) if (from.classList.contains(c)) to.classList.add(c)
            return true
          },
        })
        const now = key && [...root.children].find((el) => keyOf(el) === key)
        if (now) scrollBy({ top: now.getBoundingClientRect().top - top, behavior: 'instant' })
        if (how === 'live') marks.mark([...root.children].filter((el) => !before.has(keyOf(el))))
      }
      live.renders++
      marks.refresh()
    },
    next: () => marks.next(), // `n`: newest unseen change
    marks: marks.view,
  }
  return live
}
