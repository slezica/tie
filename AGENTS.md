# Tie: Tiled Integrated Environment

Full-screen Electron workspace: tabs of terminal tiles (slot tree + floating) with a shelf for parking tiles, scriptable via the `tie` CLI.

## Guides

- `docs/ARCHITECTURE.md`: processes, IPC, instances, env, startup/quit.
- `docs/LAYOUT.md`: slot tree, floats, collapse, zoom, focus, ping, geometry.
- `docs/SHELF.md`: templates, reveal/pin, activity.
- `docs/TABS.md`: spaces, `withSpace`, tab bar.
- `docs/INPUT.md`: mouse, drops, drags, keys, menu.
- `docs/TERMINALS.md`: spawn, cwd, sizing, titles, exit.
- `docs/CLI.md`: `tie` CLI, socket protocol, placement.
- `docs/SETTINGS.md`: settings, themes, tokens, fonts.
- `docs/HARNESS.md`: `tie-dev`, scenarios, helpers, traces.
- `docs/PACKAGING.md`: Tie.app, release, CLI launcher.
- `docs/SECURITY.md`: threat model, guards + their tests, fuses, rules.

## Records and backlog

- `docs/IDEA.md`: original concept.
- `docs/2026-10-09-mvp-spec.md`: MVP spec, decisions, plan.
- `docs/2026-10-09-daemon-client-architecture.md`: shelved daemon/client design.
- `docs/2026-10-09-electron-crash-on-quit.md`: node-pty quit crash + macOS launch block.
- `docs/2026-10-10-tabs-single-renderer.md`: tabs = spaces in one renderer.
- `docs/2026-10-14-security-research.md`: prior art (Wave, VS Code, Joplin, Hyper/Tabby, Electron), methodology.
- `docs/PENDING.md`: backlog, open questions.

## Stack

- Electron 44 (pinned), electron-vite 5, Vite 7, TypeScript 5.9.
- xterm.js 6 + fit addon; node-pty 1.1 (rebuilt for Electron on install).
- Vitest (unit), Playwright over CDP (scenarios = e2e).
- No UI framework: plain objects + `render()`.
- macOS only (harness uses `Electron.app` binary path, `-ApplePersistenceIgnoreState`).

## Files

- `src/core/layout.ts`: pure slot-tree logic. Tests: `layout.test.ts`.
- `src/core/security.ts`: pure checks (IPC sender, external URL, path containment). Tests: `security.test.ts`.
- `src/main/`: `index.ts` (window, menu, IPC, RPC bridge, quit), `security.ts` (navigation/window/permission guards, `shellIpc`, `openExternal`, `tie://` protocol), `pty.ts` (pty host, polling), `socket.ts` (JSON-RPC server), `settings.ts` (file, sanitize, validate, shell argv), `env.ts` (instance, paths, debug port, `log()`).
- `src/preload/index.ts`: `window.tie` bridge.
- `src/renderer/`:
  - `index.html`: static layers. `style.css`: tokens, spacing vars, all styles.
  - `state.ts`: `S`, `Space`, `Tile`, geometry, `withSpace`, `location`, rects, `debug()`.
  - `ops.ts`: all mutations. `render.ts`: state → DOM.
  - `tile.ts`: tile element, xterm, pty wiring, titles, error state.
  - `drag.ts`: `track()`, drag/drop, border + float resize.
  - `shelf.ts`, `tabs.ts`, `menu.ts` (context menu), `dialog.ts`, `settings.ts` (panel): UI parts.
  - `keys.ts`: keymap, split, focus-direction. `quit.ts`: hold-⌘Q.
  - `driver.ts`: socket methods → ops.
  - `themes.ts`, `appearance.ts`: colors, fonts, window classes. `icons.ts`: SVGs, program → emoji.
  - `main.ts`: boot, delegated tile events.
- `bin/tie`: product CLI. `bin/tie-dev`: dev toolkit.
- `dev/`: `lib.mjs` (launch, CDP, tie wrapper), `helpers.mjs` (incl. `probe`), `package-check.mjs` (fuses + smoke), `electron-check.mjs`, `drive.mjs` (runner), `screenshot.mjs`, `layout.mjs`, `scenarios/*.mjs` (e2e), `brand-electron.sh` (postinstall), `icon.cjs`.
- `electron-builder.yml`, `resources/bin/tie` (CLI launcher): packaging. `electron.vite.config.ts`: build.

## Model

- `S.spaces` (tab order), `S.visible` (shown), `S.current` (ops target; differs only inside `withSpace`).
- Per-space fields, accessed on `S` (accessors onto `S.current`):
  - `tree`: `Leaf {id}` | `Split {dir: 'row'|'col', children, sizes}` (fractions). Normalized. Null when empty.
  - `floats: {id, x, y, w, h}[]`: board-relative px, last = topmost.
  - `shelf: id[]`. `collapsed: Set`, `zoomed`, `active`, `mru`, `pinned` (reveal pinned), `revealed` (hovered).
- `Space` also: `id` (`s1`...), `customTitle`, `customIcon`.
- `S.tiles: Map<id, Tile>` (all spaces). `S.rects`: last rendered rects (visible space). `S.cwd`: default start dir.
- A tile is in exactly one of tree / floats / shelf of one space (`location(id)`, `spaceOf(id)`).
- `Tile`:
  - `id` (`t1`...), `kind` (`'terminal'`), `customTitle`, `customIcon`.
  - `oscTitle` (title escape), `proc` (foreground process), `cmd` (`--cmd`).
  - `cwd` (start dir), `cwdNow` (polled).
  - `pty` (= pid, or null), `ptySize` (last sent), `exit` (code or null), `error` (start error).
  - `activity` (unseen output, shelved), `pinged` (`tie ping`).
  - `el`, `body`, `term`, `fit`.

## Patterns

- Mutate only through `ops.ts`; ops end in `render()`, which always renders `S.visible`. Other space: `withSpace(id, fn)`.
- Async work on a tile (spawn, drop, menu action) re-checks `S.tiles.has(id)`: it may have closed.
- `refocus()` after closing any modal/menu: keys to the active tile, or blur.
- Tile elements never re-parent (xterm stays mounted); absolute window coords.
- Keyed DOM reconcile where an element may hold pointer capture or hover (borders, shelf items, tabs).
- Drags use `track()`. Pointer capture retargets native `click`/`dblclick`: title clicks come via `startDrag`'s `onClick`.
- Tile metadata changes fire DOM event `tile-meta`; shelf and tabs listen.
- Spacing: CSS vars, `readGeometry()` (`LAYOUT.md`). Colors: `color-mix` of base tokens, never hardcoded (`SETTINGS.md`).
- Menus and dialogs are HTML (Playwright-drivable).
- Failures stay visible: tiles that can't start show `showError`; invalid settings block Save.
- Never throw inside node-pty callbacks (aborts the process).
- Security (`SECURITY.md`): IPC via `ipc.on|handle`; URLs out via `openExternal`; content never in the shell realm; every guard has a `sec-*` scenario; security code gets a `// SECURITY:` comment.
- Logs: `debug(tag, ...)` (renderer), `log(tag, ...)` (main), enabled by `TIE_DEBUG`.
- Harness: prefer `tie-dev drive` (fresh offscreen instance). Failed run: read `out/log/runs/<time>-<name>/` first.

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
  package                  Build out/package/mac-arm64/Tie.app (arm64, signed ad hoc), then check-package
  check-package [app]      Packaged app: fuses as expected, smoke launch (boots, CLI answers)
  electron-check           Pinned Electron vs latest of its major (npm); exit 1 if behind
  release --version X.Y.Z  Clean repo, all checks, bump + commit version, tag vX.Y.Z, package
  install                  Package, then install to /Applications/Tie.app (Tie must not be running)
  icon                     Re-render placeholder icon (build/icon.png, build/icon.icns)

Instance: --instance NAME (or =NAME, anywhere) or TIE_INSTANCE (default "dev"; the installed app is "default"). Each instance has its own
socket, lock, debug port, log under ~/.config/tie/.
```

- `tie --help`: `list`, `open`, `close`, `move`, `focus`, `ping`, `title`, `icon`; dev-only `state`. See `docs/CLI.md`.
- Ad-hoc scenario: `tie-dev drive - <<'EOF' ... EOF` (`docs/HARNESS.md`).
