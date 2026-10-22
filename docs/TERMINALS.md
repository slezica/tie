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
- Grid from the fit addon: parent (`.body`) border box minus `.xterm` padding minus 14 px (xterm's scrollbar, hidden here: right slack). So terminal tiles pad `.xterm` (`--tile-pad`), not `.body`: body padding was counted as space, last row cut up to 4 px.
- Renderer: xterm's DOM renderer (no WebGL). xterm 6.0.0 bug: its width cache measures glyphs with integer `offsetWidth` (12 px: 7.1875 vs 7.2), the gap becomes row letter-spacing, text runs `cols × 0.0125` px past its `overflow: hidden` row, last column cut (2.8 px at 225 cols). `fixWidthCache()` measures fractionally (private API; no-op if it changes). Drop on xterm ≥ 6.1 (canvas measure upstream).
- Fonts: system fonts only (`appearance.ts`), no web-font load to wait for.
- Check: `terminal-fit` scenario (`termFit`, `assertTermFit`: screen inside body, no text past its row, full rows exactly `cols` cells; float size sweep).

## Keys

- Shortcuts: main, `before-input-event` (`INPUT.md`). Everything else: xterm's hidden textarea.
- Why shift+letters: xterm cancels the keydown of printable keys (the text system never sees them, held lowercase repeats), except A-Z, left to `keypress` for macOS caps-lock input methods (`CoreBrowserTerminal.ts` "HACK: Process A-Z"). Those reach the text system, which shows the accent picker.
- macOS press-and-hold (accent picker, e.g. holding shift+W in nvim → `Ŵ` bubble) off: main registers `ApplePressAndHoldEnabled = false` at startup (`systemPreferences.registerDefaults`), so held keys repeat.
  - Registration domain: in memory, nothing written (dev bundle id `com.github.Electron` is shared); before any window, so no relaunch.
  - User override: `defaults write com.salezica.tie ApplePressAndHoldEnabled -bool true` (app domain beats registration domain).
  - Check: log `[keys] press-and-hold "0"` (`keys` scenario). The picker itself needs a held real key in a visible window: not drivable by the harness.

## Observe

| Source | How | Sets |
|---|---|---|
| Output | `pty:data` | `term.write`, shelf activity (`host.activity()`) |
| Title escape | xterm `onTitleChange` | `oscTitle` |
| Foreground process | node-pty `process`, polled 500 ms | `proc` |
| Shell cwd | one batched `lsof -d cwd` every 2 s | `cwdNow` (tab title) |

`displayTitle()`: `customTitle`, else `Surface.title()`, by setting `terminalTitle` (`SETTINGS.md`, read from `prefs`):

| `terminalTitle` | Title (first match) | Tooltip |
|---|---|---|
| `auto` | `oscTitle`, `cmd`, `proc` (shells too: `zsh`), `terminal` | none |
| `command` (default) | `cmd`, `proc`, `terminal` (program titles ignored) | none |
| `directory` | basename of `cwdNow`, else start dir (`cwd`, `S.cwd`); `~` for home | full path, `~`-abbreviated (`Surface.tip`) |

- Basename + tooltip: titles ellipsize at the end (title bar, shelf, tab), so a full path would hide its last part.
- Setting saved: panel calls `refreshTitle` on every tile.

`displayIcon()`: `customIcon` (user text: escaped, never markup), else `Surface.icon()`: always glyph `terminal`, whatever the program (no per-program icons). Glyphs: `GLYPH` line SVGs, muted `currentColor`.

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
