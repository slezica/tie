// Driver: socket commands (via main) mapped to space operations.
import { contains, type Side, type TileId } from '@core/layout'
import { S, tie, location, boardRect, getTile, debug, spaceOf, withSpace, type Kind } from './state'
import { tabTitle, switchTab } from './tabs'
import { place, openTile, closeTile, activate, pin, setMeta, setPing, type Placement } from './ops'
import { displayTitle, displayIcon } from './tile'
import { kindFactory, needsFile } from './kinds'

interface Params {
  id?: TileId
  caller?: TileId
  kind?: string
  cmd?: string
  cwd?: string
  path?: string // `tie open <path>`: absolute, resolved against the caller's cwd
  title?: string
  text?: string
  emoji?: string
  at?: TileId
  side?: Side
  float?: boolean
  shelve?: boolean
  shelved?: boolean
  clear?: boolean
}

const SIDES = new Set(['l', 'r', 't', 'b'])

// Flags come from the tile's own space (list runs outside withSpace); rect only for the visible one.
function tileInfo(id: TileId) {
  const t = getTile(id)
  const r = S.rects.get(id)
  const sp = spaceOf(id)
  return {
    id,
    kind: t.kind,
    title: displayTitle(t),
    icon: displayIcon(t),
    state: location(id),
    tab: sp?.id ?? null,
    collapsed: !!sp?.collapsed.has(id),
    zoomed: sp?.zoomed === id,
    active: sp?.active === id,
    pinned: sp?.pinned === id,
    pinged: t.pinged,
    exit: t.exit,
    error: t.error ?? null,
    ...t.surface.info?.(), // terminal: `term` (xterm vs pty size)
    rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) } : null,
  }
}

// Resolve placement flags. Default: split the caller (or active) tile along its longer side.
function placement(p: Params, self?: TileId): Placement {
  if (p.shelve || p.shelved) return { type: 'shelf' }
  if (p.float) return { type: 'float' } // place() keeps a float's rect, else default
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
    tab: S.visible,
    tabs: S.spaces.map((sp) => ({ id: sp.id, title: tabTitle(sp), current: sp.id === S.visible, active: sp.active })),
    active: S.active,
    shelf: S.shelf,
    tiles: [...S.tiles.keys()].map(tileInfo),
  }),
  // Kind (resolved by resolveOpen): a kind name, or a file's viewer.
  open: (p) => {
    const kind = p.kind ?? 'terminal'
    if (!kindFactory(kind)) throw new Error(`unknown kind: ${kind}`)
    const id = openTile(kind as Kind, placement(p), { cmd: p.cmd, cwd: p.cwd, title: p.title, path: p.path })
    return tileInfo(id)
  },
  close: (p) => {
    const id = getTile(p.id ?? p.caller).id
    closeTile(id)
    return { id }
  },
  move: (p) => {
    const id = getTile(p.id ?? p.caller).id
    if (!p.at && !p.float && !p.shelve && !p.shelved) throw new Error('move needs --at, --float or --shelve')
    place(id, placement(p, id))
    return tileInfo(id)
  },
  // Strong: brings the tile to the user (its tab, expanded) and takes input. For scripts/hotkeys.
  focus: (p) => {
    const id = getTile(p.id ?? p.caller).id
    const sp = spaceOf(id)
    if (sp && sp.id !== S.visible) switchTab(sp.id)
    if (location(id) === 'shelved') pin(id)
    else {
      S.collapsed.delete(id)
      activate(id)
    }
    return tileInfo(id)
  },
  // Soft: mark for attention, no focus or layout change.
  ping: (p) => {
    const id = getTile(p.id ?? p.caller).id
    setPing(id, !p.clear)
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

// `tie open <arg>`: a known kind name opens that kind (today's behavior). Otherwise <arg> is a file
// (main checks: exists, regular file, has a viewer) → its viewer kind. Kinds that show a file
// can't be opened bare.
async function resolveOpen(p: Params) {
  const kind = p.kind ?? 'terminal'
  if (kindFactory(kind)) {
    if (needsFile(kind)) throw new Error(`${kind} shows a file: tie open <path>`)
    delete p.path
    return
  }
  if (!p.path) throw new Error(`unknown kind: ${kind}`)
  const v = await tie.doc.viewer(p.path)
  if ('error' in v) throw new Error(v.error)
  p.kind = v.kind
}

export function initDriver() {
  tie.rpc.onRequest(async (reqId, method, params) => {
    debug('rpc', method, params)
    try {
      const fn = methods[method]
      if (!fn) throw new Error(`unknown method: ${method}`)
      const p = (params ?? {}) as Params
      if (method === 'open') await resolveOpen(p) // async: before choosing the space
      // Act in the tab of the tile concerned (or the caller's terminal), else the visible tab.
      const ref = [p.id, p.at, p.caller].find((x) => x && S.tiles.has(x))
      const space = (ref && spaceOf(ref)?.id) || S.visible
      tie.rpc.reply(reqId, null, method === 'list' ? fn(p) : withSpace(space, () => fn(p)))
    } catch (e) {
      tie.rpc.reply(reqId, e instanceof Error ? e.message : String(e), null)
    }
  })
}
