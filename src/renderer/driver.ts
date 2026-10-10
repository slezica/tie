// Driver: socket commands (via main) mapped to space operations.
import { contains, type Side, type TileId } from '@core/layout'
import { S, tie, location, boardRect, getTile, debug } from './state'
import { place, openTile, closeTile, activate, pin, setMeta, defaultFloatRect, type Placement } from './ops'
import { displayTitle, displayIcon } from './tile'

interface Params {
  id?: TileId
  caller?: TileId
  kind?: string
  cmd?: string
  cwd?: string
  title?: string
  text?: string
  emoji?: string
  at?: TileId
  side?: Side
  float?: boolean
  shelve?: boolean
  shelved?: boolean
}

const SIDES = new Set(['l', 'r', 't', 'b'])

function tileInfo(id: TileId) {
  const t = getTile(id)
  const r = S.rects.get(id)
  return {
    id,
    kind: t.kind,
    title: displayTitle(t),
    icon: displayIcon(t),
    state: location(id),
    collapsed: S.collapsed.has(id),
    zoomed: S.zoomed === id,
    active: S.active === id,
    pinned: S.pinned === id,
    exit: t.exit,
    error: t.error ?? null,
    term: { cols: t.term.cols, rows: t.term.rows, pty: t.ptySize ?? null }, // mismatch = sizing bug
    rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) } : null,
  }
}

// Resolve placement flags. Default: split the caller (or active) tile along its longer side.
function placement(p: Params, self?: TileId): Placement {
  if (p.shelve || p.shelved) return { type: 'shelf' }
  if (p.float) return { type: 'float', rect: defaultFloatRect() }
  if (p.side && !SIDES.has(p.side)) throw new Error(`bad side: ${p.side} (use l|r|t|b)`)
  const candidates = [p.at, p.caller, S.active, ...S.mru].filter((x): x is TileId => !!x && x !== self)
  const at = p.at ?? candidates.find((c) => contains(S.tree, c)) ?? null
  if (p.at && !contains(S.tree, p.at)) throw new Error(`not on board: ${p.at}`)
  let side = p.side
  if (!side) {
    const r = at ? S.rects.get(at) : null
    side = r && r.h > r.w ? 'b' : 'r'
  }
  return { type: 'slot', at, side }
}

const methods: Record<string, (p: Params) => unknown> = {
  list: () => ({
    board: boardRect(),
    active: S.active,
    shelf: S.shelf,
    tiles: [...S.tiles.keys()].map(tileInfo),
  }),
  open: (p) => {
    if ((p.kind ?? 'terminal') !== 'terminal') throw new Error(`unknown kind: ${p.kind}`)
    const id = openTile('terminal', placement(p), { cmd: p.cmd, cwd: p.cwd, title: p.title })
    return tileInfo(id)
  },
  close: (p) => {
    const id = getTile(p.id ?? p.caller).id
    closeTile(id)
    return { id }
  },
  move: (p) => {
    const id = getTile(p.id ?? p.caller).id
    if (!p.at && !p.float && !p.shelve) throw new Error('move needs --at, --float or --shelve')
    place(id, placement(p, id))
    return tileInfo(id)
  },
  focus: (p) => {
    const id = getTile(p.id ?? p.caller).id
    if (location(id) === 'shelved') pin(id)
    else activate(id)
    return tileInfo(id)
  },
  title: (p) => {
    const id = getTile(p.id ?? p.caller).id
    setMeta(id, { title: p.text ?? null })
    return tileInfo(id)
  },
  icon: (p) => {
    const id = getTile(p.id ?? p.caller).id
    setMeta(id, { icon: p.emoji ?? null })
    return tileInfo(id)
  },
  // Dev: full internal state.
  state: () => ({
    tree: S.tree,
    floats: S.floats,
    shelf: S.shelf,
    collapsed: [...S.collapsed],
    zoomed: S.zoomed,
    active: S.active,
    mru: S.mru,
    pinned: S.pinned,
    revealed: S.revealed,
  }),
}

export function initDriver() {
  tie.rpc.onRequest((reqId, method, params) => {
    debug('rpc', method, params)
    try {
      const fn = methods[method]
      if (!fn) throw new Error(`unknown method: ${method}`)
      tie.rpc.reply(reqId, null, fn((params ?? {}) as Params))
    } catch (e) {
      tie.rpc.reply(reqId, e instanceof Error ? e.message : String(e), null)
    }
  })
}
