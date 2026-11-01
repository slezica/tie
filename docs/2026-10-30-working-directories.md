# Working directories

Review of every place Tie picks a directory: how each tile pathway chooses it, how it changes over a tile's life, where the rules diverge, and the principles adopted to unify them. PENDING item 34. Starting points: `TERMINALS.md` "Start directory", `2026-10-30-file-picker.md` "Start directory", PENDING 9 / 22.

# Settled

Principles (2026-11-01):

1. Two notions, named consistently: `cwd` and `root`.
   - `cwd`: every tile has one, always defined. Its context directory: inheritance, picker start, tab title. UX only.
   - `root`: content frames only. What the frame may read. Security only.
   - They may coincide (a markdown file opened in its own folder) but incidentally, never by principle. Changing one never changes the other.
2. A new tile inherits the cwd of its context tile, at open time: split source (hotkeys), drop neighbor / displaced tile (template drops), the tab's active tile (drops on a tab, on the shelf, on empty board area), the calling terminal (`tie` CLI). Lineage, not tab-wide: tabs have no cwd of their own.
3. Only tiles from nothing use the app cwd (`S.cwd`, home by default): boot, `+` new tab. `tie add --tab new` from a terminal inherits (principle 2 wins).
4. A tile's cwd changes only by explicit directory change: a terminal's shell `cd` (polled). File and browser tiles keep the inherited cwd for life. Links in a file view switch `root`, not `cwd`.
5. Root = the folder the file lives in. Today's rule, kept (PENDING 22: wider roots, deferred).

Consequence: the user picks a project context by `cd`-ing the first terminal of a tab; everything opened from there inherits until another explicit `cd`.

# Model

- `Tile.cwd`: on every tile, set by `openTile` from `opts.cwd` (context) else `S.cwd`. Terminals update it from the poll (`cwdNow`); kinds no longer own the notion. `Surface.cwd()` / `Surface.dir()` go away; `cwdOf(id)` reads `Tile.cwd` (terminal: fresh `lsof` first, as today).
- `root`: frame-private, as today (`fileview.ts`, `kinds/html.ts`); probe's `opts.cwd` renamed `root`.
- `S.cwd`: `TIE_CWD`, else home. Setting later if wanted.
- Context resolution in one place (`ops.ts` `contextOf(placement)`): `at` / `with` tile → it; shelf or `at: null` → `S.active` of the target space; none → `S.cwd`. Callers stop computing cwd by hand (`keys.ts`, `drag.ts`, `tabs.ts`).
- Tab title: `prettyDir(active.cwd)` for every kind, browser included. Tile titles: file / html = `tildePath(path)`; browser = host + path.

# Pathways

"ctx" = the context tile, principle 2. Terminal start cwd = tile cwd at open.

| # | Pathway | Today | After |
|---|---|---|---|
| 1 | Boot | `S.cwd` | `S.cwd` |
| 2 | `+` / `cmd+T` new tab | `S.cwd` | `S.cwd` |
| 3 | Split from a terminal | ctx fresh | same |
| 4 | Split from a file tile | file's folder | file tile's cwd (inherited) |
| 5 | Split from html | root | html tile's cwd |
| 6 | Split from a browser | `S.cwd` | browser tile's cwd |
| 7 | Split / `cmd+O`, empty board | `S.cwd` | `S.cwd` |
| 8 | `cmd+O` from a tile (picker start) | ctx fresh; browser → `S.cwd` | ctx cwd, every kind |
| 10 | Template → edge / center of a tile | ctx fresh | same; the new tile's cwd = ctx (file tiles too) |
| 11 | Template → empty board area | `S.cwd` | tab's active tile |
| 12 | Template → tab | tab's active tile | same |
| 13 | Template → new tab (`+`) | `S.cwd` | `S.cwd` |
| 14 | Template → shelf | `S.cwd` | visible tab's active tile |
| 15 | `tie add` terminal | caller cwd (`--cwd`) | same |
| 16 | `tie add <path>` | cwd ignored; root = file's folder | cwd = caller's; root = file's folder |
| 17 | `tie add <url>` / `browser` | cwd ignored | cwd = caller's |
| 18 | `tie add probe --cwd` | cwd = root | `--root`; cwd = caller's |
| 19 | `tie replace` | as 15 / 16 | same |
| 20 | OS file drop | root = file's folder, no cwd | cwd = tile under / beside the drop, else tab's active tile; root = file's folder |
| 21–23 | Links in a file view (same tile, beside, other kind) | root switches; no cwd | root switches; cwd inherited from the source tile |
| 24–26 | Html links, reload, back/forward | root per target | same; cwd unchanged |
| 27 | Picker path line | walk root = typed prefix | same (prefill = ctx cwd) |
| 29 | Shelve / move / swap | unchanged | unchanged |
| 30 | Shell `cd` | `cwdNow` | `Tile.cwd` updated |
| 31 | Shell exits | last `cwdNow`, else start | `Tile.cwd` stays |

Titles:

| Tile | Today | After |
|---|---|---|
| Terminal | `cwdNow` (undefined ≤ 2 s) | `Tile.cwd`, never undefined |
| File kind | file's folder | `Tile.cwd` |
| Html | root | `Tile.cwd` |
| Browser | page title | `Tile.cwd` |

# Changes

Implementation list, in order:

1. `state.ts`: `Tile.cwd: string`. `ops.ts`: `contextOf(placement, space)`, `openTile` sets `cwd`; `cwdOf` reads it (terminal: fresh read via `Surface.cwdNow?()`, optional).
2. `kinds/terminal.ts`: spawn from `tile.cwd`; poll writes `tile.cwd`; drop `dir` / `cwd` / `tip` fallback chains (`tip` = `tildePath(tile.cwd)`).
3. `fileview.ts`, `kinds/html.ts`: remove `dir` / `cwd`; links open beside with `{cwd: tile.cwd}`.
4. `kinds/probe.ts`, `bin/tie`, `driver.ts`: `--root` for probe; `cwd` kept for every kind.
5. `keys.ts`, `drag.ts`, `tabs.ts`, `files.ts`: delete hand-rolled cwd lookups, pass placement, let `openTile` resolve.
6. `tabs.ts` `tabTitle`: `Tile.cwd`. Decide browser.
7. `Surface`: remove `dir` / `cwd`; add optional `cwdNow?(): Promise<string | undefined>` (terminal only, fresh read) if `cwdOf` keeps the fresh `lsof`.
8. Docs: `docs/DIRECTORIES.md` (principles, model, pathway table); drop the tables from `TERMINALS.md` and `2026-10-30-file-picker.md` (pointer). `AGENTS.md` model line.
9. Scenarios: `cwd-*` (split from file / browser / html inherits; template → shelf / empty area; `tie add` file carries caller cwd; link beside inherits; tab title per kind). Existing `terminal-cwd`, picker scenarios updated.

# Flags

From the review (2026-10-30), with status under the principles.

1. `S.cwd` is home for installed users; no setting. Open, independent (setting later).
2. Template → shelf ignores context. Resolved: principle 2 (visible tab's active tile).
3. CLI never consults `S.cwd`. Resolved: by design (caller = context).
4. Split semantics differ by kind. Resolved: `Tile.cwd` for every kind.
5. Terminal: three fallback chains, title flicker. Resolved: one field.
6. Duplicate start-cwd fallback renderer / main; deleted dir errors the tile. Open: keep the error (visible failure), or fall back to the nearest existing ancestor? Lean: error, message names the dir.
7. Root = file's folder always. Kept (principle 5); PENDING 9 / 22 stay open.
8. `OpenOpts.cwd` means root for probe. Resolved: `--root`.
9. Dead `S.cwd` fallback in fileview. Resolved: removed with `dir()`.
10. Picker start mirrors terminal start. Kept, now via `Tile.cwd`.
11. `cwd()` runs `lsof` per call. Kept for the fresh read; still only on user actions.
12. `t.pty` not cleared on exit. Resolved incidentally: cwd lives on the tile.
13. Docs duplicated. Resolved: `DIRECTORIES.md`.

Settled 2026-11-01:

- Inherit reads fresh (`lsof` of the shell pid), never the poll. No race: `tie add` resolves `.` in the CLI process (the shell's real cwd). The poll feeds titles only.
- Deleted cwd: error tile (visible failure), message names the directory.
- "Default directory" setting: not now.
- PENDING 22 (root = caller cwd when it contains the file): stays open, separate. Under principle 5 the root is the file's folder; a wider root would make a home cwd a root, the exact exposure to avoid.
- Stale lineage: a file tile opened from home keeps home even after its terminal `cd`s. Accepted; visible in the tab title when active.

- Titles: tab = basename of the active tile's cwd, every kind (browser tabs too). Tile title: file / html = `~`-abbreviated absolute path (today the file name); browser = host + path of the current URL (today the page title; browsers are http(s) only, never `file:`). Terminal title modes unchanged. Flag: duplicates the nav bar's location; revisit if it bothers.
- Root stays the file's folder. Revisit when it bites (docs with `../img.png` is the known case).

# Pending

- Implementation dispatched 2026-11-01 (Changes list above).
- Done 2026-11-01:
  - `Tile.cwd` on every tile; `ops.ts` `contextOf`, `cwdOf` (fresh via `Surface.cwdNow`), `setCwd`; `Host.cwd` / `setCwd`. `Surface.dir` / `cwd` gone; terminal `Term.cwd` / `cwdNow` gone.
  - Callers (`keys.ts`, `drag.ts`, `files.ts`, `fileview.ts`, `kinds/html.ts`) pass the context's cwd; template → shelf / empty board inherit the active tile.
  - Titles: tab = active tile's cwd (every kind); file / html = `~` path; browser = host + path; terminal tooltip = cwd (every mode).
  - `tie add probe --root`; `tie list --json` `cwd`.
  - Guide `DIRECTORIES.md`; tables in `TERMINALS.md` / `2026-10-30-file-picker.md` → pointers.
  - Scenarios `cwd-split`, `cwd-templates`, `cwd-links`; title assertions updated; `h.tilde`.
