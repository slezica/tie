# Terminals

Terminal tile lifecycle: create, spawn, size, observe, exit, close.

## Create (`tile.ts`)

1. `createTile()`: element (title bar, `.body`, resize handles) appended to `#tiles`; xterm `Terminal` + fit addon.
2. `place()` + `render()`: element gets its rect.
3. `startTerminal()`: `term.open(body)`, fit, then `tie.pty.spawn({cmd, cwd, cols, rows, env: {TIE_TILE}})`.
4. Spawn returns pty id (= pid) or `{error}`.

xterm options: `scrollback: 5000`, cursor blink, `macOptionIsMeta`, plus appearance (`SETTINGS.md`).

## Spawn (`src/main/pty.ts`)

- argv from settings `shell` (`parseCommand`: whitespace split, quotes group).
- Empty setting → account login shell: `userInfo().shell -l` (ignores `$SHELL`), fallback `$SHELL`, `/bin/zsh`.
- `--cmd C` → `<shell argv> -i -c C`.
- Shell resolved via `PATH` or path (`~/` expanded). Not executable → `{error}`.
- cwd: tile `cwd`, else app cwd (`TIE_CWD` or home).

Env added to the shell:

| Var | Value |
|---|---|
| `TIE_TILE` | tile id |
| `TIE_SOCKET` | instance socket path |
| `TIE_INSTANCE` | instance name |
| `PATH` | `<app>/bin` prepended (`tie` available) |
| `TERM` / `COLORTERM` / `TERM_PROGRAM` | `xterm-256color` / `truecolor` / `tie` |

## Size

- `ResizeObserver` on `.body` → `fitTile()` → xterm resize → `pty.resize`.
- `fitTile()` skips bodies under 10 px (collapsed, hidden tab).
- Resync after spawn: xterm may resize while the pty is spawning.
- `t.ptySize` = last size sent. `tie list --json` exposes `term: {cols, rows, pty}`; mismatch = bug.
- Shelved tiles stay at reveal size: no resize on hover.

## Observe

| Source | How | Updates |
|---|---|---|
| Output | `pty:data` | `term.write`, shelf activity |
| Title | OSC title escape (`onTitleChange`) | `oscTitle` |
| Foreground process | node-pty `process`, polled 500 ms | `proc` (icon, title fallback) |
| Shell working dir | one batched `lsof -d cwd` per 2 s | `cwdNow` (tab title) |

Display title, first match:

1. `customTitle` (menu, `--title`, `tie title`).
2. `oscTitle`.
3. `cmd` (for `--cmd` tiles).
4. `proc` (shell names only if nothing else).
5. `terminal`.

Icon: `customIcon`, else program → emoji table (`icons.ts`, grayscale), else `>_` glyph.

Changes fire DOM event `tile-meta` (shelf items, tab titles listen).

## Exit

- Writes `[process exited with code N]`, sets `exit`, title bar shows `✓` or `✗ N`.
- Shell tiles (no `cmd`): close on exit.
- `--cmd` tiles: stay open, showing exit status.

## Errors

- Spawn failure (shell missing, spawn throws): `showError()`.
  - Centered "Error" + message replaces content.
  - Tile stays open; `tie list --json` shows `error`.
- Settings refuse to save an invalid shell (`SETTINGS.md`).

## Close

- `closeTile()` → `disposeTile()`: kill pty, dispose xterm, remove element, drop from `S.tiles`.
- Page reload kills all ptys. Quit waits for pty exits (`ARCHITECTURE.md`).

## Rules

- Never throw inside node-pty callbacks: aborts the process. `send()` guards everything.

## Limitations

- No terminal read/write over the CLI (by design: secrets, elevated programs).
- cwd via `lsof` polling: up to 2 s stale.
