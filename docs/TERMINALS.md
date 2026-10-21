# Terminals

## Create

Terminal = a tile kind (`kinds/terminal.ts`) behind the `Surface` interface (`kinds/index.ts`). The host (`tile.ts`) owns element, title bar, error state.

1. `createTile()` (host): element (title bar, `.body`, `.rz` handles) in `#tiles`; `terminalKind()`: xterm + fit addon (`scrollback: 5000`, `macOptionIsMeta`, appearance options, `linkHandler`).
2. `place()` + `render()`: element gets its rect.
3. `mountTile()` → `Surface.mount()`: `term.open(body)`, fit, `tie.pty.spawn({cmd, cwd, cols, rows, env: {TIE_TILE}})`.
4. Returns pty id (= pid) or `{error}`; rejection counts as `{error}`.
5. Tile closed while spawning (`host.alive()` false): new pty killed.

Terminal state (`Term`, kind-private): `term`, `fit`, `pty`, `ptySize`, `oscTitle`, `proc`, `cmd`, `cwd`, `cwdNow`. Shell code reaches it only through `Surface` (`title`, `icon`, `dir`, `cwd`, `paste`, `drop`, `appearance`, `info`).

## Start directory

| Opened by | cwd |
|---|---|
| `tie open` | `--cwd` resolved against caller's cwd; default caller's cwd |
| `cmd+D`, template dropped next to a tile | that shell's cwd, read fresh (`cwdOf` → `pty:cwd` → `lsof`), not the 2 s poll |
| Other | `S.cwd` (`TIE_CWD`, else home) |

## Spawn (`src/main/pty.ts`, `settings.ts`)

- argv: settings `shell` (`parseCommand`: whitespace split, quotes group).
- Empty → `defaultShell()`: `userInfo().shell -l` (ignores `$SHELL`, which rc files may override), fallback `$SHELL`, `/bin/zsh`.
- `--cmd C` → `<argv> -i -c C`.
- Shell resolved via `PATH` or path (`~/` expanded). Not executable → `{error}`.
- cwd not a directory → `{error}` (`Directory not found`).
- Env added: `TIE_TILE`, `TIE_SOCKET`, `TIE_INSTANCE`, `PATH` with `bin/` prepended (`tie` available; `PACKAGING.md`), `TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=tie`.

## Paste (`paste.ts`)

- cmd+V and drops on a tile go to `Surface.paste` / `Surface.drop` (capture listener on `#tiles`). The terminal's go through `pasteInto()`, never straight to xterm.
- Asks first (`confirmDialog`, preview with control chars as red `^X`):
  - control characters (C0 except tab/LF/CR, DEL, C1): `warnPasteControl`.
  - newlines while the program hasn't enabled bracketed paste (would run): `warnPasteRun`.
- Cancel = nothing. "Paste anyway" or check off = raw text via `term.paste()`.
- Drops (`dropText`): files → shell-quoted paths + space; else first link; else plain text. Then activate + guarded paste.

## Links

- OSC 8 hyperlinks only (no plain-URL detection). Hover: the tile's link strip (`Host.hint`, bottom-left, UI realm) shows the real URL, or "Blocked link: …" for non-http(s) schemes.
- cmd-click on http(s) → confirm dialog (`external.ts`, setting `confirmExternal`) → `tie.openExternal` → main, http(s) only. Plain click, other schemes: nothing. `SECURITY.md`.

## Size

- `ResizeObserver` on `.body` (host, after a successful mount) → `Surface.resize()` → `fitTerm()` → xterm resize → `pty.resize`.
- `fitTerm()` skips bodies under 10 px (collapsed, hidden tab).
- Resync after spawn: xterm may resize while the pty spawns.
- `t.ptySize` = last size sent; `tie list --json` `term` shows both. Mismatch = bug (`assertPtySizes`).

## Observe

| Source | How | Sets |
|---|---|---|
| Output | `pty:data` | `term.write`, shelf activity (`host.activity()`) |
| Title escape | xterm `onTitleChange` | `oscTitle` |
| Foreground process | node-pty `process`, polled 500 ms | `proc` |
| Shell cwd | one batched `lsof -d cwd` every 2 s | `cwdNow` (tab title) |

`displayTitle()`: `customTitle`, else `Surface.title()`: first of `oscTitle`, `cmd`, `proc`, `terminal`.

`displayIcon()`: `customIcon`, else `Surface.icon()`: `PROGRAMS[proc]` (`icons.ts`), else `>_` glyph. Icons are escaped text, never markup; emoji grayscale.

Meta changes: `host.changed()` → `refreshTitle()` → `tile-meta` event.

## Exit

- Writes `[process exited with code N]`, `host.exit(code)`: sets tile `exit`, title shows `✓` / `✗ N`.
- Shell tiles (no `cmd`): `host.close()`. `--cmd` tiles: stay open.

## Errors

- Spawn failure (shell, cwd, throw): `host.error()` → `showError()`: "Error" + message replaces content. Tile stays open; `tie list --json` shows `error`.
- Settings refuse to save an invalid shell (`SETTINGS.md`).

## Close

`closeTile()` → `disposeTile()`: `Surface.dispose()` (kill pty, dispose xterm), remove element, drop from `S.tiles`.

## Limitations

- No terminal read/write over the CLI (by design: secrets, elevated programs).
- `cwdNow` up to 2 s stale.
