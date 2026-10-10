# Tie: Tiled Integrated Environment

Full-screen Electron workspace: a board of terminal tiles (slot tree + floating) and a shelf for parking tiles, scriptable via the `tie` CLI.

## Docs

- `docs/IDEA.md`: original concept.
- `docs/2026-10-09-mvp-spec.md`: MVP spec, decisions, plan.
- `docs/2026-10-09-daemon-client-architecture.md`: shelved daemon/client design.
- `docs/2026-10-09-electron-crash-on-quit.md`: node-pty quit crash + macOS launch block.
- `docs/2026-10-10-tabs-single-renderer.md`: tabs = spaces in one renderer.

## Stack

- Electron 44 (pinned), electron-vite 5, Vite 7, TypeScript 5.9.
- xterm.js 6 + fit addon; node-pty 1.1 (N-API prebuilds).
- Vitest (unit), Playwright over CDP (scenarios/e2e).
- No UI framework: plain objects + `render()`.

## Files

- `src/core/layout.ts`: pure slot-tree logic (insert, remove, move, normalize, compute rects, resize, drop side).
- `src/core/layout.test.ts`: unit tests.
- `src/main/index.ts`: window, single-instance lock, IPC, renderer RPC bridge, graceful quit.
- `src/main/pty.ts`: pty host (spawn, data, resize, foreground process poll, killAll).
- `src/main/socket.ts`: unix socket, newline-delimited JSON-RPC → renderer.
- `src/main/settings.ts`: user settings (`~/.tie/settings.json`, `TIE_SETTINGS` override), shell command parsing.
- `src/main/env.ts`: instance name, paths (`~/.tie/<instance>.*`), debug port, tagged logs.
- `src/preload/index.ts`: `window.tie` bridge (pty, rpc, info, log, ready).
- `src/renderer/state.ts`: state `S`, geometry constants, `Tile` type.
- `src/renderer/ops.ts`: all mutations (place, openTile, closeTile, activate, collapse, zoom, pin, meta).
- `src/renderer/render.ts`: state → DOM (absolute positioning, reveals, borders).
- `src/renderer/tile.ts`: tile element + terminal (xterm, pty wiring, titles).
- `src/renderer/drag.ts`: drag/drop, drop targets + preview, border and float resize.
- `src/renderer/shelf.ts`: shelf column (templates, keyed items, hover reveal, pin, activity).
- `src/renderer/settings.ts`: settings panel, left nav: Appearance | Terminal (app menu, cmd+,; harness opens via `tie:settings` DOM event).
- `src/renderer/themes.ts`: themes (palette + accent), xterm theme mapping.
- `src/renderer/appearance.ts`: applies theme to CSS tokens + terminals, line height to tile content.
- `src/renderer/keys.ts`: keymap (chord → action), capture-phase handler before xterm, split/focus-direction actions.
- `src/renderer/tabs.ts`: tab bar (keyed), new/switch/cycle/close (empty only), titles from cwd.
- `src/renderer/dialog.ts`: HTML info dialog.
- `src/renderer/menu.ts`: HTML context menu (rename, icon).
- `src/renderer/driver.ts`: socket methods → ops (`list`, `open`, `close`, `move`, `focus`, `title`, `icon`, `state`).
- `src/renderer/icons.ts`: SVG buttons, program → emoji table.
- `src/renderer/main.ts`: bootstrap, delegated tile events.
- `bin/tie`: product CLI. `bin/tie-dev`: dev toolkit.
- `dev/lib.mjs`: harness utils (launch instance, CDP connect, tie wrapper).
- `dev/helpers.mjs`: scenario helpers. `dev/drive.mjs`, `dev/screenshot.mjs`, `dev/layout.mjs`.
- `dev/scenarios/*.mjs`: Playwright scenarios (also the e2e suite).

## Model

- `S.spaces: Space[]`, `S.visible` (shown), `S.current` (ops target; differs only inside `withSpace`). Per-space fields below are accessors onto `S.current`.
- `S.tree: Node | null`: slot tree. `Leaf {id}` | `Split {dir: 'row'|'col', children, sizes (fractions)}`. Normalized.
- `S.floats: {id, x, y, w, h}[]`: board-relative px, last = topmost.
- `S.shelf: id[]`: shelved order.
- `S.collapsed: Set`, `S.zoomed`, `S.active`, `S.mru`, `S.pinned`, `S.revealed`.
- A tile is in exactly one of tree / floats / shelf (`location(id)`).
- `Tile`: `id`, `kind`, `cwdNow` (polled shell cwd), `customTitle`, `customIcon`, `oscTitle`, `proc`, `cmd`, `exit`, `activity`, `pty`, `el`, `term`, `fit`.

## Patterns

- Settings scopes: app-wide (theme), all tiles (line height), tile-kind (terminal shell).
- Spacing: CSS vars in `style.css` `:root` (`--top-bar`, `--pad`, `--gap`, `--title-h`, `--shelf-w`, `--peak`, `--tile-pad`); `readGeometry()` feeds them to layout code on every render.
- Colors: only base tokens (`--bg`, `--text`, `--accent`, `--red`, `--green`) are set; everything else is `color-mix` of them. Never hardcode colors.
- Mutate only through `ops.ts`, which ends in `render()`.
- Tile elements never re-parent (xterm stays mounted); position is absolute window coords.
- Shelved tiles stay laid out at reveal size (hidden), so pty size doesn't churn.
- Drags use pointer capture; native `click`/`dblclick` are retargeted, so title clicks come via `startDrag`'s `onClick`.
- DOM re-renders must keep elements under an active pointer capture (keyed borders, keyed shelf items).
- Errors: settings validated on save (`validateSettings`, shown in panel status line); tiles that can't start show an error state (`showError`) instead of closing.
- Scenarios can `export const settings = {...}` to pre-seed a fresh instance.
- Never throw inside node-pty callbacks (aborts the process).
- Harness instances (`TIE_BACKGROUND=1`) render offscreen: no window, no dock icon, no focus stealing; real user input can't interfere.
- Harness instances use their own settings file (`tmp/<instance>.settings.json`).
- Launch harness instances with `-ApplePersistenceIgnoreState YES` (see crash record).

## Toolkit

```
tie-dev [--instance NAME] <command> [args]

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
  scenarios                List scenarios
```

`tie --help` documents the product CLI (`list`, `open`, `close`, `move`, `focus`, `title`, `icon`).
Ad-hoc scenario: `tie-dev drive - <<'EOF' ... EOF` (helpers in scope, `ctx.shot(name)`, `return` value printed).
