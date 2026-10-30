// Driver: socket commands (via main) mapped to space operations.
import { contains, type Side, type TileId } from '@core/layout'
import { S, tie, location, boardRect, getTile, debug, spaceOf, withSpace, type Kind } from './state'
import { tabTitle, switchTab, newTab } from './tabs'
import { place, openTile, closeTile, activate, pin, setMeta, setPing, swap, moveToSpace, replaceTile, type Placement } from './ops'
import { displayTitle } from './tile'
import { kindSpec } from './kinds'
import { locationUrl } from '@core/guest'

interface Params {
  id?: TileId
  caller?: TileId
  kind?: string
  cmd?: string
  cwd?: string
  path?: string // `tie add <path>`: absolute, resolved against the caller's cwd
  url?: string // `tie add <url>`, `tie add browser [url]`
  title?: string // add, replace, set ('' = automatic)
  icon?: string // add, replace, set ('' = automatic)
  at?: TileId
  side?: Side
  float?: boolean
  shelve?: boolean
  shelved?: boolean
  focus?: boolean // add, replace, move: give the tile input
  tab?: string // add, move: target tab (`s1`..., 1-based position, or `new`)
  swap?: TileId // move: exchange places with this tile (same tab)
  old?: TileId // replaced (main only, socket.ts): the tile to replace
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
    icon: t.customIcon ?? '', // custom icon (user text); '' = automatic
    glyph: t.surface.icon(), // built-in icon (icons.ts GLYPH)
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

// `--tab`: a tab id (`s1`...), a 1-based position (tie list's TAB column) or `new` (created by the
// caller, once every check passed). No other placement flag: the tile goes beside the target tab's
// active tile (an empty tab: root), as a drop onto a tab.
function tabTarget(p: Params): string {
  if (p.at || p.side || p.float || p.shelve || p.shelved) throw new Error('--tab takes no other placement (--at, --side, --float, --shelve)')
  const t = String(p.tab)
  if (t === 'new') return t
  const sp = /^\d+$/.test(t) ? S.spaces[Number(t) - 1] : S.spaces.find((x) => x.id === t)
  if (!sp) throw new Error(`no such tab: ${t}`)
  return sp.id
}

// `--tab new`: an empty tab after the visible one, not shown (--focus switches afterwards).
const addTab = () => newTab({ empty: true, show: false })

// Brings the tile to the user: its tab, expanded and active (shelved: reveal pinned). `focus`, --focus.
function bring(id: TileId) {
  const sp = spaceOf(id)
  if (!sp) return
  if (sp.id !== S.visible) switchTab(sp.id)
  withSpace(sp.id, () => {
    if (location(id) === 'shelved') pin(id)
    else {
      S.collapsed.delete(id)
      activate(id)
    }
  })
}

// `move --tab`: active in the target tab (`moveToSpace`). The visible tab changes only with --focus,
// or when the tile was the last one of the tab on screen: that tab closes, the user follows the tile
// (rather than land on the tab before). The tab left empty closes (as closeTile).
function moveTab(id: TileId, p: Params) {
  const target = tabTarget(p)
  const from = spaceOf(id)!
  const to = target === 'new' ? addTab() : target
  const last = from.id === S.visible && to !== from.id && [...S.tiles.keys()].every((t) => t === id || spaceOf(t) !== from)
  const show = !!p.focus || last
  if (show) switchTab(to)
  moveToSpace(id, to, { activate: show || to !== S.visible })
  if (p.focus) bring(id)
}

// `move --swap`: exchange places (slot, float rect, shelf index) with a tile of the same tab (`swap`).
function swapWith(id: TileId, p: Params) {
  if (p.at || p.side || p.float || p.shelve || p.shelved || p.tab !== undefined) throw new Error('--swap takes no placement (--at, --side, --float, --shelve, --tab)')
  const other = getTile(p.swap).id
  if (spaceOf(other) !== spaceOf(id)) throw new Error(`not in the same tab: ${other}`)
  swap(id, other)
  if (p.focus) bring(id)
}

// The tile a command acts on: `--tile` (explicit: unknown → no such tile), else the caller's tile.
// No caller tile (external caller, or a stale TIE_TILE) → the user must name one.
function target(p: Params): TileId {
  if (p.id !== undefined) return getTile(p.id).id
  if (p.caller && S.tiles.has(p.caller)) return p.caller
  throw new Error('no current tile: use --tile <id>')
}

// `add`, `replace`: the kind (resolved by resolveOpen) and its open options.
function toOpen(p: Params) {
  const kind = p.kind ?? 'terminal'
  if (!kindSpec(kind)) throw new Error(`unknown kind: ${kind}`)
  return { kind, opts: { cmd: p.cmd, cwd: p.cwd, title: p.title, icon: p.icon, path: p.path, url: p.url } }
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
  add: (p) => {
    const { kind, opts } = toOpen(p)
    // Input moves to the new tile only with --focus: a script showing something never redirects typing.
    if (p.tab === undefined) return tileInfo(openTile(kind as Kind, placement(p), opts, { activate: !!p.focus }))
    // Another tab: shown only with --focus; a hidden one gets the tile active (as move --tab).
    const target = tabTarget(p)
    const to = target === 'new' ? addTab() : target
    if (p.focus) switchTab(to)
    return withSpace(to, () => tileInfo(openTile(kind as Kind, placement(p), opts, { activate: !!p.focus || to !== S.visible })))
  },
  // Main checked the caller (socket.ts). Waits hidden on the caller's shelf; main swaps it in once
  // tie exits (`replaced`).
  replace: (p) => {
    if (p.at || p.side || p.float || p.shelve || p.shelved || p.tab !== undefined) throw new Error('replace takes no placement (--at, --side, --float, --shelve, --tab)')
    const { kind, opts } = toOpen(p)
    return tileInfo(openTile(kind as Kind, { type: 'shelf' }, opts, { activate: false }))
  },
  // Main only (socket.ts refuses it from clients): after `replace`, tie exited.
  replaced: (p) => {
    replaceTile(String(p.old), String(p.id), { focus: !!p.focus })
    return null
  },
  close: (p) => {
    const id = target(p)
    closeTile(id)
    return { id }
  },
  move: (p) => {
    const id = target(p)
    if (p.swap !== undefined) return swapWith(id, p), tileInfo(id)
    if (p.tab !== undefined) return moveTab(id, p), tileInfo(id)
    if (!p.at && !p.float && !p.shelve && !p.shelved) throw new Error('move needs --at, --float, --shelve, --tab or --swap')
    place(id, placement(p, id), { activate: !!p.focus })
    return tileInfo(id)
  },
  // Strong: brings the tile to the user (its tab, expanded) and takes input. For scripts/hotkeys.
  focus: (p) => {
    const id = target(p)
    bring(id)
    return tileInfo(id)
  },
  // Soft: mark for attention, no focus or layout change.
  ping: (p) => {
    const id = target(p)
    setPing(id, !p.clear)
    return tileInfo(id)
  },
  // Custom title / icon: given fields only ('' = automatic); at least one.
  set: (p) => {
    const id = target(p)
    if (p.title === undefined && p.icon === undefined) throw new Error('set needs --title or --icon')
    setMeta(id, { ...(p.title !== undefined && { title: String(p.title) }), ...(p.icon !== undefined && { icon: String(p.icon) }) })
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

// `tie add|replace <arg>`: a known kind name opens that kind (today's behavior). An http(s) URL (`url`,
// kind unset or 'browser') → a browser tile. Otherwise <arg> is a file (main checks: exists, regular
// file, has a viewer) → its viewer kind. Kinds that show a file can't be opened bare.
async function resolveOpen(p: Params) {
  if (p.url !== undefined) {
    // SECURITY: only http(s) (bare host → https://, as the location bar); the tile checks again.
    const u = typeof p.url === 'string' ? locationUrl(p.url) : null
    if (!u) throw new Error(`Not a web address: ${String(p.url)} (http(s) only)`)
    p.kind ??= 'browser'
    if (kindSpec(p.kind)?.opens !== 'url') throw new Error(`${p.kind} doesn't open a URL`)
    p.url = u
    delete p.path
    return
  }
  const kind = p.kind ?? 'terminal'
  const spec = kindSpec(kind)
  if (spec) {
    if (spec.opens === 'file') throw new Error(`${kind} shows a file: tie add <path>`)
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
      if (method === 'add' || method === 'replace') await resolveOpen(p) // async: before choosing the space
      // Act in the tab of the tile concerned (or the caller's terminal), else the visible tab.
      const ref = [p.id, p.at, p.caller].find((x) => x && S.tiles.has(x))
      const space = (ref && spaceOf(ref)?.id) || S.visible
      tie.rpc.reply(reqId, null, method === 'list' ? fn(p) : withSpace(space, () => fn(p)))
    } catch (e) {
      tie.rpc.reply(reqId, e instanceof Error ? e.message : String(e), null)
    }
  })
}
