# File picker

Session record. Replace the native open dialog (`doc:pick` → `pickFile`, `dialog.showOpenDialog`) with Tie's own picker dialog: keyboard-first, path-typing, terminal-like. Also this session: toolbar drop polish (`34600aa`..`5b42608`), cmd+O / cmd+shift+O (`78f4c51`..`9229514`).

# Idea

- Same contract as today: the file template (drops, tabs, cmd+O) asks for a path; a tile opens only once a file is picked; dismissed = nothing happens.
- The dialog is Tie's: centered floating HTML dialog over the window (`dialog.ts` family, Playwright-drivable), `max-width: max(60%, 480px)`.
- fzf-like: one line, a dropdown of ranked suggestions filtering on every keystroke, the top one highlighted; Enter opens it, arrows move. From a repo root, `reti` + Enter opens `src/renderer/tile.ts` (what fzf selects). Fast enough that muscle memory outruns the eye.
- No inline fill (incompatible with fuzzy, non-adjacent matches).
- The native dialog stays reachable: a "…" button in the picker (Finder search, favorites, iCloud).

# Settled

- Dialog, not a tile: no new tile kind, no tile model change.
- Suggestions: filesystem only (no recents).
- Non-openable files: hidden.
- Via shelf / tab drop: dialog first, then the tile lands as today (shelved / in the switched tab).
- Start directory = where a terminal dropped there would start: beside / onto a tile → that tile's cwd (`cwdOf(at)`); cmd+O → the active tile's cwd; empty board, tab drop, shelf drop → default `S.cwd`. Prefill only: the picker navigates anywhere (`..`, `/`, `~`).
- Native dialog kept behind "…".
- Dropdown: 8 rows.
- Fuzzy over the tree (not just completion of the current directory). Gitignore-aware walk: setting in a new "Files" settings section (next to "Terminal"), default on.
- Picker is UI-only: the CLI keeps refusing a file kind without a path.
- No inline fill: top suggestion highlighted, Enter opens, arrows move.
- Smart case (as fzf): case-insensitive unless the query has an uppercase letter, then case-sensitive.
- `~` is the only special token (home). No `$VAR` expansion: paths are literal.
- Walker, scorer, streaming, budgets, TCC handling: the research recommendation (below), adopted.
- Template → tab: start dir = the target tab's active tile cwd, for the terminal template too (TABS.md change); new tab → `S.cwd`.

# Components

- `core/picker.ts` (pure, unit-tested): `score(query, path) → {score, positions} | null` (fzf v1 window: forward scan for the first subsequence match, backward shrink; fzf path-scheme constants: match 16, gap start -3, extend -1, boundary after `/` 9 / after `_-. ` 8 / camel 7, consecutive 4, first char ×2), smart case, NFC on both sides, space-separated terms all required (scores summed, positions merged). `rank(query, paths, k) → top-K` by score desc, then depth asc, then length asc; `topK` merge for streamed chunks (`merge(top, chunk)`).
- `main/walk.ts`: BFS from `dir`, `readdir({withFileTypes})`, 16 reads in flight, never follows dir symlinks, skips `.git`; hidden entries skipped unless `hidden` requested; gitignore via `ignore` npm: per-directory chain, nested repo (`.git` present) resets it, `.git/info/exclude`, global excludes from `git config core.excludesFile` (fallback `~/.config/git/ignore`, `~/.gitignore`); emits files and dirs (dirs with trailing `/`), paths relative to `dir`. Budget: 50k entries or 2 s → `partial`. TCC: at depth 1 under home skip Desktop, Documents, Downloads, Pictures, Music, Movies, Library, `Google Drive`, symlinks into `Library/CloudStorage`; `/Volumes` under `/`; skipped dirs still emitted as entries; walked only when they are the root (typed into). Per-read timeout 400 ms → dir dropped, reported `waiting`; at most 1 read in flight into a protected root. EPERM / ENAMETOOLONG: skip, count. Cancellable.
- IPC (`// SECURITY:` absolute-path string check, one walk per gen, stop on renderer request or window close): invoke `doc:walk(dir, {gen, gitignore})` → `{ok: true} | {error}`; main → renderer `doc:walk-chunk(gen, {paths, done, partial?, waiting?})`, chunks at 1024 paths or 16 ms; send `doc:walk-stop(gen)`. Preload `tie.doc.walk / onWalkChunk / stopWalk`.
- Setting `gitignore` (flat camelCase key like the others; bool, default true): `main/settings.ts` sanitize/validate; panel section "Files" (next to "Terminal") with "Respect .gitignore"; `prefs.ts` cached read.
- `renderer/picker.ts`: `pickPath(startDir): Promise<string | null>`; replaces `tie.doc.pick` in `templateOpts` (drag.ts; cmd+O goes through it). Rest unchanged: `tie.doc.viewer(path)` → kind → `openTile` / `displaceTile`; "Can't open" dialog on error.
- Dialog (`dialog.ts` family, Playwright-drivable; `refocus()` on close): one input holding the full path text (`~/proj/` prefix + query); prefix = text up to the last `/`, expanded `~`; query = the rest. Dropdown of 8 rows: ranked hits under the prefix, relative paths with matched chars highlighted (positions), top row selected. Keys: Up / Down move; Enter on a file → resolve absolute path; Enter on a dir → the line becomes `prefix + dir/` (re-roots the walk); Tab → same descend into the selected entry's dir; Esc / click outside → null; Backspace just edits the text (deleting the trailing `/` re-roots to the parent, naturally). "…" button → `tie.doc.pick(prefix dir)`, returned as the pick. Status line: "partial" when capped, "waiting for permission: Documents" when a read timed out, "n files" otherwise.
- Ranking in the renderer: on each chunk, `merge` into the top-K for the current query; on each keystroke re-rank the held list (≤ 50k: ≤ 4 ms). The walk re-runs only when the prefix changes (new `gen`); the list is held for the dialog's life.
- First paint on the first chunk or 30 ms. The native dialog remains reachable; `doc:pick` stays.

# Harness

- `setNextPick` / `h.pickNext` (main-side hook for the native dialog): removed. Scenarios drive the dialog: `h.pick(ctx, path)` types the absolute path (or a prefix + query) + Enter; cancel = Esc.
- Scenarios touched: `template`, `keys`, `tab-drops`, others using `pickNext` (grep). New: `picker` (reti → tile.ts from the repo root with a fixture tree, descend, Backspace re-root, partial marker with a small cap via a dev hook, "…" through the dev `setNextPick` if kept for the native fallback only), `sec-walk` (`doc:walk` rejects relative / non-string dir, stop cancels, one walk per gen).
- Full e2e at the end (shared helper change).

# Phases

1. (parallel) a: `core/picker.ts` + tests. b: `main/walk.ts` + IPC + preload + setting `gitignore` + "Files" panel section + `sec-walk` scenario + SECURITY.md row + SETTINGS.md.
2. Dialog: `renderer/picker.ts`, styles, keys, "…", highlighting; `templateOpts` switched; `dropOnTab` start dir = target tab's active tile cwd (both templates); `picker` scenario; harness `h.pick`, `pickNext` removed; touched scenarios migrated.
3. Docs: TILES (opening), INPUT (keys table), SHELF (file template), TABS (template drop cwd), MARKDOWN "Opening", TERMINALS cwd table, HARNESS. Full e2e.

# Done

- Phase 1: `14553f1`, `bbe3508`..`841dd0e`.
- Phases 2, 3: `picker: fuzzy file picker dialog`, `drag: template on a tab starts in that tab's cwd`, `harness: h.pick drives the picker; picker scenario`, `docs: file picker`.
- Deviations from the plan:
  - Enter: a typed path naming a file wins over the top row unless arrows moved the selection (the walk may not have reached it, or hides it: dot files, ignored). Checked with `doc:viewer`; no file + no rows → status error, dialog stays.
  - `setNextPick` / dev socket `pick` kept, for `…` only: `h.nativePickNext`.
  - Partial marker: own scenario `picker-partial` (`TIE_WALK_CAP=5` is per instance; it would starve `picker`).
  - Row click = Enter on that row. Parent part of a row dimmed, dir names tinted.
  - Status keeps `n files` and appends `partial` / `waiting for permission: …` / errors (` · `-joined); `…` suffix while walking.

# Pending

- (none; directory consistency review → PENDING.md 34)

# Start directory

`S.cwd` = `TIE_CWD`, else home (never the process cwd).

| Pathway | Start dir |
|---|---|
| cmd+O, active terminal | shell cwd (fresh, `cwdOf`) |
| cmd+O, active file tile | file's dir |
| cmd+O, active browser | `S.cwd` |
| cmd+O, empty board | `S.cwd` |
| Template → edge / center of a tile | that tile's cwd |
| Template → empty board | `S.cwd` |
| Template → tab | target tab's active tile cwd (changed from `S.cwd`; the terminal template too, for consistency) |
| Template → new tab | `S.cwd` |
| Template → shelf | `S.cwd` |

# Research

Agent report 2026-10-30 (scripts: scratchpad `research/`; M3 Max, warm cache, medians of 3). Pre-grant `~` runs discarded (TCC prompts blocked the walk), `~` re-run after grants.

Prior art:
- fzf: v1 greedy window O(n), v2 Smith-Waterman O(nm); `--scheme=path` (`/` delimiter, filename tiebreak) auto on a TTY. No index: built-in walker since 0.48 (skips `.git`, `node_modules`, no gitignore). Streams in 1024 chunks. No depth bonus.
- VS Code: spawns `rg --files`, caches the list per quick-open session, filters the cache when the query extends. Filename-first tiers (+2^17 prefix, +2^16 any), bonuses after `/` and `_-. :`. Batches of 512. No depth term.
- Helix: `ignore` crate walk, 30 ms sync push then background thread; nucleo (fzf v2 port), `/` delimiter.
- Zed: persistent in-memory worktree index; scorer with gap penalties, `penalize_length` divides by last-segment length.
- telescope / fzf-lua: spawn fd/rg, pipe to fzf or a C port. Sublime: background index, bonuses for consecutive / separator / camel.

Libraries (`reti` on this repo's `git ls-files` must give `src/renderer/tile.ts`):
- `fzf` npm 0.5.2: correct (v1 and v2), smart-case, positions; unmaintained since 2023; 146 MB index at 200k; v2 716 ms / v1 114 ms per query at 200k.
- `fuzzysort`: fast (56 ms at 200k) but wrong top hit. `ufuzzy`: won't span `/`. `fzy.js`: no prefilter, 579 ms. `fuse`: wrong and slow.
- Own prototype (fzf-v1 window + path constants + top-K + depth tiebreak, ~80 lines): correct, 3.9 ms at 50k, 25 ms at 200k, +37 MB.
- Gitignore walkers: hand BFS + `ignore` 7.0.14 = 0 diffs vs `git ls-files --exclude-standard` (nested, negation, dir-only, info/exclude, global). globby / ignore-walk miss info/exclude + global. fast-glob / nodelib: no gitignore.

Walks (entries, total ms, ms to 1k / 10k / 50k):
- tie gitignored: BFS 234 in 3.5 ms (fd 8.5, rg 8.9). tie no-ignore: 18.9k in 31 ms.
- ~/projects gitignored: 3.5k in 22 ms. No-ignore: 208k in 353 ms (fd 1031, rg 812), 1k in 3 ms, 50k in 60 ms.
- ~ (non-hidden, cap 200k): BFS 666 ms, 1k 2.3 / 10k 50 / 50k 234. Skipping `~/Library` (41% of entries): 302 ms, 10k 11 / 50k 65. fd 335, rg 231–256. Full ~ = 1.56M files (733k gitignored).
- BFS vs DFS: DFS reaches 10k faster only by diving into Library. libuv pool: default 4 threads best; 16 reads in flight.
- Memory 200k paths: 37 MB strings, 17 MB JSON over IPC.

TCC (packaged app, bundle `com.salezica.tie`; grants went to Tie.app via node-pty's spawn-helper):
- Prompted: Documents, Desktop, Downloads, Photos (`~/Pictures/Photos Library`: blocked 171 s), MediaLibrary (`~/Music`), AppData (`~/Library/Containers`). FDA dirs (`~/Library/Mail` + 137 others) fail EPERM silently.
- A blocked `readdir` holds a libuv thread; 4 pending prompts stall all fs work in main (watchers, doc reads). Dev instance (Electron.app bundle) prompts again.

Recommendation (agent, adopted unless Pending says otherwise):
- Walker: hand BFS in main on `readdir({withFileTypes})` + `ignore`; 16 reads in flight; never follow dir symlinks; `.git` skipped; nested repo resets the chain; read `git config core.excludesFile`. No fd/rg.
- Scorer: own `core/picker.ts` (fzf-v1 window, path-scheme constants, space-separated AND terms, smart case, NFC, top-K with positions). Tiebreak: score, depth, length.
- Ranking in the renderer (main handles every keystroke in `before-input-event`); Web Worker if cap > 50k. Score new chunks into the top-K, don't re-rank.
- Stream `{gen, paths, done}`: chunk at 512–1024 or 16 ms; `gen` per directory prefix; cancel on close / prefix change.
- Budgets: 50k entries or 2 s; first paint at first chunk or 30 ms; "partial" marker.
- `~`: skip at depth 1 by default: Desktop, Documents, Downloads, Pictures, Music, Movies, Library, Google Drive, symlinks into `Library/CloudStorage`; `/Volumes` under `/`. Skipped dirs still listed as entries; walked only when typed into (intent = prompt expected). Per-read timeout 300–500 ms → "waiting for permission", keep streaming; at most 1 read in flight into protected roots. EPERM: count, skip.
- Risks: NFC/NFD coexist on APFS (normalize both sides); ENAMETOOLONG skip; case-insensitive FS fine.
