// Direction ranking for cmd+arrow focus and cmd+shift+arrow swap (renderer keys.ts). Pure,
// unit-tested (focus.test.ts). docs/INPUT.md "Keyboard".

import type { Rect, Side, TileId } from './layout'

// The tile next to `from` in direction `dir`, or undefined. Candidates: every other visible tile
// (slotted and floating; the caller filters), in a stable order (first wins a full tie). Only tiles
// whose center lies more than 1 px past `from`'s center in that direction count. Prefers tiles
// overlapping on the perpendicular axis, then the smallest gap along the axis (overlapping rects:
// 0), then the smallest perpendicular center offset (rounded), then the most recently used (`mru`:
// most recent first; absent = last), like i3.
export function neighbor(from: Rect, candidates: Iterable<{ id: TileId; rect: Rect }>, mru: readonly TileId[], dir: Side): TileId | undefined {
  const horizontal = dir === 'l' || dir === 'r'
  const sign = dir === 'r' || dir === 'b' ? 1 : -1
  const cx = (r: Rect) => r.x + r.w / 2
  const cy = (r: Rect) => r.y + r.h / 2
  let best: { id: TileId; score: number[] } | null = null
  for (const { id, rect: r } of candidates) {
    const along = horizontal ? cx(r) - cx(from) : cy(r) - cy(from)
    if (along * sign <= 1) continue
    const gap = horizontal
      ? sign > 0 ? r.x - (from.x + from.w) : from.x - (r.x + r.w)
      : sign > 0 ? r.y - (from.y + from.h) : from.y - (r.y + r.h)
    const overlap = horizontal
      ? Math.min(from.y + from.h, r.y + r.h) - Math.max(from.y, r.y)
      : Math.min(from.x + from.w, r.x + r.w) - Math.max(from.x, r.x)
    const offset = horizontal ? Math.abs(cy(r) - cy(from)) : Math.abs(cx(r) - cx(from))
    const recent = mru.indexOf(id)
    const score = [overlap > 0 ? 0 : 1, Math.max(0, gap), Math.round(offset), recent < 0 ? Infinity : recent] // ties: most recently used
    if (!best || compare(score, best.score) < 0) best = { id, score }
  }
  return best?.id
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}
