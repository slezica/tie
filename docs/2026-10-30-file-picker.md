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

# Components

- `renderer/picker.ts`: `pickPath(startDir): Promise<string | null>`. Replaces `tie.doc.pick` in `templateOpts` (drag.ts; cmd+O goes through it). Rest of the flow unchanged: `tie.doc.viewer(path)` → kind → `openTile` / `displaceTile`; "Can't open" dialog on error.
- Dialog: line (input), dropdown (list), "…" button (→ `tie.doc.pick(dir)`, result returned as the pick). Backdrop; Esc / click outside → null. `refocus()` after close (pattern).
- Main `doc:list(dir)`: entries `{name, dir}` of one directory, sorted dirs first. Read-only metadata; absolute path only; `~` expanded in the renderer before the call; errors → empty list. `// SECURITY:`; `sec-*` scenario (rejects relative / non-string); SECURITY.md row.
- Completion (pure, `core/picker.ts`, unit-tested): `complete(input, entries)` → `{fill, suggestions}`. Segment = text after the last `/`. Match: case-insensitive prefix first, then substring. Dirs + openable files (`canOpenAs` by extension; unknown ext = openable as text/hex, so hidden = none-openable only). Dotfiles only when the segment starts with `.`.
- Inline fill: top suggestion appended as selected text, only after a typed character insertion (never on delete / paste / IME composition). Tab / Right (caret at end) accept; Up / Down walk the dropdown (line shows the walked entry); Enter: dir → descend (`…/dir/`, relist), file → resolve. Typing a `/` after a dir name descends.
- Listing: per directory, on segment's directory change; cached for the dialog's life.
- Errors (missing path, not a file): inline under the line; dialog stays.

# Harness

- `setNextPick` / `h.pickNext` (main-side hook for the native dialog): removed. Scenarios drive the dialog: `h.pick(ctx, path)` types the path + Enter; cancel = Esc.
- Scenarios touched: `template`, `keys`, `tab-drops`, others using `pickNext` (grep). New: `picker` (completion, dropdown, descend, "…" path via the harness hook if kept for the native fallback), `sec-picker` (`doc:list` checks).
- Full e2e at the end (shared helper change).

# Phases

1. Core: `core/picker.ts` completion + tests; main `doc:list` + preload + `sec-picker`.
2. Dialog: `picker.ts`, styles, keys, "…", inline fill; `templateOpts` switched; `picker` scenario; harness `h.pick`, `pickNext` removed; touched scenarios migrated.
3. Docs: TILES (opening), INPUT (keys table), SHELF (file template), MARKDOWN "Opening", SECURITY, HARNESS. Full e2e.

# Pending

- `~` only, or also `$VAR`? Lean `~` only.
- Walker, scorer, budgets, where ranking runs, streaming shape: after the research agent's report (prior art: fzf, VS Code, Zed/Helix, telescope; libraries: `fzf` npm, `fuzzysort`, `ignore`, `fast-glob`; benchmarks over this repo, `~/projects`, `~`).
- Template → tab drop start dir: `S.cwd` (today) or the target tab's active tile cwd?

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
| Template → tab / new tab | `S.cwd` (pending above) |
| Template → shelf | `S.cwd` |

# Research

- Draft approach before research: BFS walk in main, streamed in chunks, budget (~50k entries / ~1.5 s) with a "partial" marker; `ignore` npm per directory for gitignore; `fzf` npm scorer in `core/` + shallow-depth bonus; cache per dialog only. Rejected for now: spawning `fd`/`rg` (PATH-dependent), Rust N-API walker (toolchain).
