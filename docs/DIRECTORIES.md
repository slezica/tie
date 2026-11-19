# Directories

Where tiles start, what they inherit, what their titles show, what content frames may read. Records: `2026-10-30-working-directories.md`, `2026-11-13-content-roots.md`.

## Principles

1. Two notions, never mixed:
   - `cwd`: every tile has one, always defined. Context directory: inheritance, picker start, titles. UX only.
   - `root`: content frames only. What the frame may read (`TILES.md`). Security only.
   - They often coincide (rule 5), still distinct: a tile's cwd never follows its root, a root never follows a `cd`.
2. A new tile inherits the cwd of its context tile, at open time. Lineage, not tab-wide: tabs have no cwd of their own.
3. Tiles from nothing (boot, `+` / `cmd+T` new tab) use the app cwd `S.cwd` (`TIE_CWD`, else home).
4. A tile's cwd changes only by an explicit directory change: a terminal's shell `cd` (polled). File, html and browser tiles keep theirs for life; links switch `root`, never `cwd`.
5. Root = the context tile's cwd when it holds the file, else the file's folder (`rootFor`, `@core/roots`). Every pathway (every tile has a cwd), every content kind. `tie add --root D`: that, when it holds the file. The user controls the risk: a wide cwd (`~`) is their choice (record 2026-11-13); only `/` asks (rule 7).
6. Navigation (links, back / forward, reload): the root stays while the target is inside it; outside: rule 5 again for the target. Links outside the root ask first (`confirmFile`, `TILES.md`).
7. Root `/` (cwd `/`, a file directly in `/`, `--root /`): `.dialog.root-slash` first: Stop (default, Escape: nothing opens, the tile shows "Stopped…"; a navigation stays put), Use file directory (the file's folder; itself `/`: as Stop), Open anyway. `renderer/roots.ts` `resolveRoot`.

Net: `cd` the first terminal of a tab into a project; everything opened from there inherits, and documents from there see the whole project (`../img.png` loads).

## Model

- `Tile.cwd` (`state.ts`): set by `openTile` / `displaceTile` (`ops.ts`) from `opts.cwd`, else the context tile's stored cwd, else `S.cwd`.
- `contextOf(placement)` (`ops.ts`): the context tile.
  - `slot` at a tile → it; `displace` → the displaced tile.
  - `slot` at null, `float`, `shelf`, none → `S.active` of the target space (`S.current`: `withSpace`).
  - None of those → null (app cwd).
- `cwdOf(id)` (`ops.ts`): fresh cwd for a tile opened from `id`: `Surface.cwdNow?()` (terminal: `lsof` of the shell, never the 2 s poll), else `Tile.cwd`. User actions only (keys, drops).
- Callers wanting the fresh read (`keys.ts`, `drag.ts`, `files.ts`): `cwdOf(contextOf(p))`, then `openTile(kind, p, {cwd})`. Others pass nothing: `openTile` falls back synchronously.
- `setCwd(id, dir)` (`ops.ts`): updates `Tile.cwd`, `refreshTitle` → `tile-meta` (tab titles). Kinds report via `Host.setCwd` (terminal: `pty:cwd` poll); read via `Host.cwd()`.
- Kinds own no directory notion (no `Surface.dir` / `cwd`). Roots stay kind-private (`fileview.ts`, `kinds/html.ts`: `resolveRoot(host.cwd(), path, current, opts.root)` at mount and on navigation; probe: `opts.root`, else its cwd). `tie list --json`: `doc.root` / `page.root`.
- The viewer gets the document's path within the root (`src`, `withinRoot`); markdown images and html assets resolve against it.
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
| `tie add` / `tie replace`, every kind | `--cwd`, else the caller's cwd (resolved in the CLI process); `tie add --tab new` too. File kinds: root by rule 5 from that cwd, or `--root` |
| `tie add probe --root D` (dev) | caller's cwd; root `D` (any) |
| Link in a file view / html, beside | the source tile's |
| Link in the same tile, reload, back / forward | unchanged (root: rule 6) |
| Shell `cd` | `Tile.cwd` updated (poll, 2 s) |
| Shell exits, shelve, move, swap | unchanged |

## Titles

| What | Title |
|---|---|
| Tab | custom, else `prettyDir(cwd)` of the active (else first shelved) tile, every kind: basename, `~` for home |
| Terminal | `terminalTitle` modes (`TERMINALS.md`); `directory` = basename of `Tile.cwd`, tooltip `tildePath(cwd)` |
| File kinds, html | `tildePath(path)`: full path, `~` for home (ellipsized at the end) |
| Browser | host + path of the current URL (no scheme, trailing `/` stripped); before any URL, the start URL's; nothing → `browser` |

- `tie list --json`: `cwd` per tile.
- Scenarios: `cwd-split` (per kind, titles, `cd`, cmd+D from a terminal: fresh read), `cwd-templates` (shelf, empty board, file tile edge, OS drop, file template, terminal edge: fresh read), `cwd-links` (links beside), `cwd-roots` (roots: rule, navigation, `--root`, `/` dialog, html).

## Limitations

- Stale lineage: a file tile opened from home keeps home after its terminal `cd`s (visible in the tab title when active). Its root is home too (rule 5): the document can show any file under it.
- No "default directory" setting (`S.cwd` = home for installed users).
- File and browser titles duplicate the nav bar's location.
