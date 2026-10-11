# Tie: Tiled Integrated Environment

Full-screen Electron workspace: tabs of terminal tiles (slot tree + floating) with a shelf for parking tiles, scriptable via the `tie` CLI.

## Guides

- `docs/ARCHITECTURE.md`: processes, IPC, renderer modules, instance files, startup/quit.
- `docs/LAYOUT.md`: slot tree, floats, collapse, zoom, focus/MRU, geometry vars, z-order.
- `docs/SHELF.md`: templates, shelved items, reveal/pin, activity.
- `docs/TABS.md`: spaces, `withSpace`, tab bar, titles, close rules.
- `docs/INPUT.md`: mouse map, drop targets, drag mechanics, shortcuts, context menu.
- `docs/TERMINALS.md`: terminal lifecycle: spawn, env, sizing, titles, exit, errors.
- `docs/CLI.md`: `tie` CLI, socket JSON-RPC protocol, placement defaults.
- `docs/SETTINGS.md`: settings file + panel, themes, color tokens, fonts.
- `docs/HARNESS.md`: `tie-dev`, instances, scenarios, helpers, logs.

## Records and backlog

- `docs/IDEA.md`: original concept.
- `docs/2026-10-09-mvp-spec.md`: MVP spec, decisions, plan.
- `docs/2026-10-09-daemon-client-architecture.md`: shelved daemon/client design.
- `docs/2026-10-09-electron-crash-on-quit.md`: node-pty quit crash + macOS launch block.
- `docs/2026-10-10-tabs-single-renderer.md`: tabs = spaces in one renderer.
- `docs/PENDING.md`: backlog and open questions.

## Stack

- Electron 44 (pinned), electron-vite 5, Vite 7, TypeScript 5.9.
- xterm.js 6 + fit addon; node-pty 1.1 (rebuilt for Electron on install).
- Vitest (unit), Playwright over CDP (scenarios/e2e).
- No UI framework: plain objects + `render()`.
- Harness assumes macOS (`Electron.app` binary path, `-ApplePersistenceIgnoreState`).

## Files

- `src/core/layout.ts`: pure slot-tree logic (insert, remove, move, normalize, compute rects, resize, drop side).
- `src/core/layout.test.ts`: unit tests.
- `src/main/index.ts`: window, app menu, single-instance lock, IPC handlers, renderer RPC bridge, graceful quit.
- `src/main/pty.ts`: pty host (spawn, data, resize, kill, process + cwd polling, killAll).
- `src/main/socket.ts`: unix socket, newline-delimited JSON-RPC → renderer.
- `src/main/settings.ts`: settings file, defaults, sanitize at load/save, unreadable-file guard, validation, shell argv/resolution.
- `src/main/env.ts`: instance name, paths (`~/.tie/<instance>.*`), debug port, tagged logs.
- `src/preload/index.ts`: `window.tie` bridge (info, ready, settings, pty, rpc, log).
- `src/renderer/index.html`: static layers (`#top`, `#shelf`, `#tiles`, `#borders`, `#preview`, ...).
- `src/renderer/style.css`: tokens, spacing vars, all styles.
- `src/renderer/state.ts`: `S`, `Space`, `Tile`, geometry, `withSpace`, `location`, board/shelf rects.
- `src/renderer/ops.ts`: all mutations (place, openTile, closeTile, activate, refocus, focusNext, collapse, zoom, pin, float rect, meta).
- `src/renderer/render.ts`: state → DOM (absolute positioning, reveals, peak, borders, hidden spaces).
- `src/renderer/tile.ts`: tile element + terminal (xterm, pty wiring, titles, error state).
- `src/renderer/drag.ts`: pointer tracking, drag/drop targets + preview, border and float resize.
- `src/renderer/shelf.ts`: shelf column (templates, keyed items, hover reveal, pin, activity).
- `src/renderer/tabs.ts`: tab bar (keyed), new/switch/cycle/close (empty only), reorder, titles from cwd.
- `src/renderer/keys.ts`: keymap (chord → action), capture-phase handler, split/focus-direction.
- `src/renderer/driver.ts`: socket methods → ops (`list`, `open`, `close`, `move`, `focus`, `title`, `icon`, `state`).
- `src/renderer/settings.ts`: settings panel, nav Appearance | Terminal.
- `src/renderer/themes.ts`: themes (palette + accent), xterm theme mapping.
- `src/renderer/appearance.ts`: theme → CSS tokens + terminals; fonts, line height, char width; font list.
- `src/renderer/menu.ts`: HTML context menu (rename, icon, reset) for tiles and tabs.
- `src/renderer/dialog.ts`: HTML info dialog.
- `src/renderer/icons.ts`: SVG buttons, program → emoji table, shell names.
- `src/renderer/main.ts`: boot, delegated tile events (activate, title click/drag, buttons, menu).
- `bin/tie`: product CLI. `bin/tie-dev`: dev toolkit.
- `dev/lib.mjs`: harness utils (launch fresh instance, CDP connect, tie wrapper).
- `dev/helpers.mjs`: scenario helpers.
- `dev/drive.mjs`: scenario runner. `dev/screenshot.mjs`, `dev/layout.mjs`: inspection.
- `dev/scenarios/*.mjs`: Playwright scenarios (also the e2e suite).
- `dev/brand-electron.sh`: postinstall, names dev Electron bundle "Tie".
- `electron.vite.config.ts`: build config, `@core` alias, CJS preload.

## Model

- `S.spaces: Space[]` (tab order), `S.visible` (shown), `S.current` (ops target; differs only inside `withSpace`).
- Per-space fields on `S` are accessors onto `S.current`:
  - `tree: Node | null`: `Leaf {id}` | `Split {dir: 'row'|'col', children, sizes (fractions)}`. Normalized.
  - `floats: {id, x, y, w, h}[]`: board-relative px, last = topmost.
  - `shelf: id[]`: shelved order.
  - `collapsed: Set`, `zoomed`, `active`, `mru`, `pinned` (reveal pinned), `revealed` (hovered).
- `Space` also: `id` (`s1`...), `customTitle`, `customIcon`.
- `S.tiles: Map<id, Tile>`: all spaces. `S.rects`: last rendered rects, visible space.
- A tile is in exactly one of tree / floats / shelf of one space (`location(id)`, `spaceOf(id)`).
- `Tile`:
  - `id` (`t1`...), `kind` (`'terminal'`).
  - `customTitle`, `customIcon`: user overrides.
  - `oscTitle`: title escape. `proc`: foreground process. `cmd`: `--cmd` command.
  - `cwd`: start dir. `cwdNow`: polled shell cwd.
  - `pty`: pty id (pid) or null. `ptySize`: last size sent. `exit`: code or null. `error`: start error.
  - `activity`: unseen output while shelved.
  - `el`, `body`, `term`, `fit`: DOM + xterm.

## Patterns

- Mutate only through `ops.ts`, which ends in `render()`.
- Keyboard focus: `refocus()` (ops.ts) gives keys to the active tile, or nowhere if it can't take them (collapsed); call it after closing any modal/menu.
- Async or deferred work on a tile (spawn, drop, menu action) re-checks `S.tiles.has(id)`: it may have closed meanwhile.
- `render()` always renders the visible space; use `withSpace(id, fn)` to act on another (follows a tab switch inside `fn`).
- Tile elements never re-parent (xterm stays mounted); position is absolute window coords.
- Shelved tiles stay laid out at reveal size (hidden), so pty size doesn't churn.
- Settings scopes: app-wide (theme), all tiles (font, size, line height, char width), tile-kind (terminal shell).
- Spacing: CSS vars in `style.css` `:root`. `readGeometry()` reads `--top-bar`, `--pad`, `--gap`, `--title-h`, `--shelf-w`, `--peak` on every render; `--tile-pad` is CSS-only.
- Colors: only base tokens (`--bg`, `--text`, `--accent`, `--red`, `--green`, `--yellow`) are set; everything else is `color-mix` of them. Never hardcode colors.
- Drags use `track()` (window capture listeners + pointer capture); native `click`/`dblclick` are retargeted, so title clicks come via `startDrag`'s `onClick`.
- DOM re-renders must keep elements under an active pointer capture (keyed borders, shelf items, tabs).
- Tile metadata changes fire DOM event `tile-meta`; shelf and tabs listen.
- Menus and dialogs are HTML (drivable by Playwright).
- Errors: settings validated on save (`validateSettings`, panel status line); an unreadable settings file blocks Save (never overwritten); tiles that can't start show `showError` instead of closing.
- Scenarios can `export const settings = {...}` (or a raw string) to pre-seed a fresh instance.
- Never throw inside node-pty callbacks (aborts the process).
- Debug logs: `debug(tag, ...)` in renderer, `log(tag, ...)` in main; enabled by `TIE_DEBUG`.
- Harness instances (`TIE_BACKGROUND=1`) render offscreen: no window, no dock icon, no focus stealing.
- Harness instances use their own settings file (`tmp/<instance>.settings.json`).
- Launch harness instances with `-ApplePersistenceIgnoreState YES` (see crash record).

## Toolkit

```
tie-dev - Tie development toolkit

Usage: tie-dev [--instance NAME] <command> [args]

Commands:
  run [--hot]              Run in foreground; --hot: dev server, UI hot-reloads on change
  build                    Build to out/
  start                    Build if needed, launch app in background
  stop                     Stop instance
  status                   Show instance info (pid, socket, debug port)
  logs [-f]                Show instance log (enable tags with TIE_DEBUG=layout,shelf,pty,rpc or *)
  test --unit              Unit tests (vitest)
  test --e2e               Run every scenario in dev/scenarios on fresh instances
  typecheck                tsc --noEmit
  layout                   ASCII render of the board
  screenshot [file]        PNG of current state (default tmp/shots/current.png)
  drive <scenario|-> [--attach] [--keep]
                           Run Playwright scenario (file in dev/scenarios, path, or - for stdin).
                           Fresh instance by default; --attach uses running instance;
                           --keep leaves fresh instance running.
  scenarios                List scenarios

Instance: --instance NAME (or =NAME, anywhere) or TIE_INSTANCE (default "default"). Each instance has its own
socket, lock, debug port, log under ~/.tie/.
```

- `tie --help`: product CLI (`list`, `open`, `close`, `move`, `focus`, `title`, `icon`; dev-only `state`). See `docs/CLI.md`.
- Ad-hoc scenario: `tie-dev drive - <<'EOF' ... EOF` (helpers in scope, `ctx.shot(name)`, `return` value printed). See `docs/HARNESS.md`.
