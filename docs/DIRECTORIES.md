# Directories

Where tiles start, what they inherit, what their titles show. Record: `2026-10-30-working-directories.md`.

## Principles

1. Two notions, never mixed:
   - `cwd`: every tile has one, always defined. Context directory: inheritance, picker start, titles. UX only.
   - `root`: content frames only. What the frame may read (`TILES.md`). Security only.
   - They may coincide (a file opened from its own folder), never by rule. Changing one never changes the other.
2. A new tile inherits the cwd of its context tile, at open time. Lineage, not tab-wide: tabs have no cwd of their own.
3. Tiles from nothing (boot, `+` / `cmd+T` new tab) use the app cwd `S.cwd` (`TIE_CWD`, else home).
4. A tile's cwd changes only by an explicit directory change: a terminal's shell `cd` (polled). File, html and browser tiles keep theirs for life; links switch `root`, never `cwd`.
5. Root = the folder of the file shown (PENDING 22: wider roots, deferred).

Net: `cd` the first terminal of a tab into a project; everything opened from there inherits.

## Model

- `Tile.cwd` (`state.ts`): set by `openTile` / `displaceTile` (`ops.ts`) from `opts.cwd`, else the context tile's stored cwd, else `S.cwd`.
- `contextOf(placement)` (`ops.ts`): the context tile.
  - `slot` at a tile → it; `displace` → the displaced tile.
  - `slot` at null, `float`, `shelf`, none → `S.active` of the target space (`S.current`: `withSpace`).
  - None of those → null (app cwd).
- `cwdOf(id)` (`ops.ts`): fresh cwd for a tile opened from `id`: `Surface.cwdNow?()` (terminal: `lsof` of the shell, never the 2 s poll), else `Tile.cwd`. User actions only (keys, drops).
- Callers wanting the fresh read (`keys.ts`, `drag.ts`, `files.ts`): `cwdOf(contextOf(p))`, then `openTile(kind, p, {cwd})`. Others pass nothing: `openTile` falls back synchronously.
- `setCwd(id, dir)` (`ops.ts`): updates `Tile.cwd`, `refreshTitle` → `tile-meta` (tab titles). Kinds report via `Host.setCwd` (terminal: `pty:cwd` poll); read via `Host.cwd()`.
- Kinds own no directory notion (no `Surface.dir` / `cwd`). Roots stay kind-private (`fileview.ts`, `kinds/html.ts`; probe: `opts.root`, else its cwd).
- Deleted / missing cwd: a terminal fails to spawn, error tile names the directory (`Directory not found: <dir>`). No fallback.

## Pathways

"ctx" = the context tile. A terminal's start dir = its tile cwd.

| Pathway | cwd |
|---|---|
| Boot, `+` / `cmd+T` new tab, last tab closed | `S.cwd` |
| `cmd+D` (split) from any kind | ctx (the source; terminal: fresh) |
| `cmd+O` from a tile | picker from ctx; the picked file's tile: ctx |
| `cmd+D` / `cmd+O`, empty board | the active tile (floating, shelved), else `S.cwd` |
| Template → edge / center of a tile | that tile |
| Template → empty board area, shelf | the visible tab's active tile |
| Template → tab | that tab's active tile |
| Template → new tab (`+`) | `S.cwd` |
| OS file drop | tile under / beside the drop, else the active tile; root = the file's folder |
| `tie add` / `tie replace`, every kind | `--cwd`, else the caller's cwd (resolved in the CLI process); `tie add --tab new` too |
| `tie add probe --root D` (dev) | caller's cwd; root `D` |
| Link in a file view / html, beside | the source tile's |
| Link in the same tile, reload, back / forward | unchanged (root follows the file) |
| Shell `cd` | `Tile.cwd` updated (poll, 2 s) |
| Shell exits, shelve, move, swap | unchanged |

## Titles

| What | Title |
|---|---|
| Tab | custom, else `prettyDir(cwd)` of the active (else first shelved) tile, every kind: basename, `~` for home |
| Terminal | `terminalTitle` modes (`TERMINALS.md`); `directory` = basename of `Tile.cwd`; tooltip: `tildePath(cwd)` |
| File kinds, html | `tildePath(path)`: full path, `~` for home (ellipsized at the end) |
| Browser | host + path of the current URL (no scheme, trailing `/` stripped); before any URL, the start URL's; nothing → `browser` |

- `tie list --json`: `cwd` per tile.
- Scenarios: `cwd-inherit` (terminals, fresh read), `cwd-split` (per kind, titles, `cd`), `cwd-templates` (shelf, empty board, file tile edge, OS drop, file template), `cwd-links` (links beside).

## Limitations

- Stale lineage: a file tile opened from home keeps home after its terminal `cd`s (visible in the tab title when active).
- No "default directory" setting (`S.cwd` = home for installed users).
- File and browser titles duplicate the nav bar's location.
