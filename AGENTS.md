# Tie: Tiled Integrated Environment

Full-screen Electron workspace: tabs of tiles (terminals; sandboxed content frames: live markdown) in a slot tree + floating, with a shelf for parking tiles, scriptable via the `tie` CLI.

## Guides

- `docs/ARCHITECTURE.md`: processes, IPC, instances, env, startup/quit.
- `docs/LAYOUT.md`: slot tree, floats, collapse, zoom, focus, ping, geometry.
- `docs/SHELF.md`: templates, reveal/pin, activity.
- `docs/TABS.md`: spaces, `withSpace`, tab bar.
- `docs/INPUT.md`: mouse, drops, drags, keys, menu.
- `docs/TILES.md`: tile host, kinds, `Surface`, frame host, requests, `tie-content` protocol, viewers.
- `docs/TERMINALS.md`: spawn, cwd, sizing, titles, exit.
- `docs/MARKDOWN.md`: markdown kind: viewer pipeline, links, history, task toggles, watching, opening.
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
- `docs/2026-10-15-tile-host-plan.md`: tile host, frame isolation, keys in main; phased plan.
- `docs/PENDING.md`: backlog, open questions.

## Stack

- Electron 44 (pinned), electron-vite 5, Vite 7, TypeScript 5.9.
- xterm.js 6 + fit addon; node-pty 1.1 (rebuilt for Electron on install).
- Markdown viewer (bundled into its IIFE): markdown-it 15 (+ footnote, deflist, emoji plugins), DOMPurify 3, highlight.js 11 (core + common languages).
- Vitest (unit), Playwright over CDP (scenarios = e2e).
- No UI framework: plain objects + `render()`.
- macOS only (harness uses `Electron.app` binary path, `-ApplePersistenceIgnoreState`).

## Files

- `src/core/layout.ts`: pure slot-tree logic. Tests: `layout.test.ts`.
- `src/core/security.ts`: pure checks (IPC sender, external URL, path containment). Tests: `security.test.ts`.
- `src/core/paste.ts`: pure paste checks (control chars, would-run), caret preview, shell quoting. Tests: `paste.test.ts`.
- `src/core/content.ts`: content URL/token/path checks, viewer files, content CSP (main). Tests: `content.test.ts`.
- `src/core/requests.ts`: frame → host request verbs + validator (renderer). Tests: `requests.test.ts`.
- `src/core/keymap.ts`: keymap, chords, `actionFor`, `isQuitKey` (main + renderer). Tests: `keymap.test.ts`.
- `src/core/markdown.ts`: `viewerFor`, `noViewer`, `classifyLink`, `toggleTaskLine`, `applyToggle` (main + renderer). Tests: `markdown.test.ts`.
- `src/main/`: `index.ts` (window, menu, IPC, RPC bridge, quit), `security.ts` (navigation/window/permission guards, `shellIpc`, `openExternal`, `tie://` protocol), `content.ts` (`tie-content://`: token registry, handler, frame nav lock), `keys.ts` (shortcuts in `before-input-event`), `docs.ts` (viewer files: check, open + watch, task toggle write, picker), `watch.ts` (file watcher, stable reads, revisions; tests: `watch.test.ts`), `pty.ts` (pty host, polling), `socket.ts` (JSON-RPC server), `settings.ts` (file, sanitize, validate, shell argv), `env.ts` (instance, paths, debug port, `log()`).
- `src/preload/index.ts`: `window.tie` bridge.
- `src/viewers/`: content viewers (`<kind>.html` + `.ts`, IIFE) → `out/viewers/`. `markdown`, `probe` (dev). `markdown-it-plugins.d.ts`: plugin types.
- `src/renderer/`:
  - `index.html`: static layers. `style.css`: tokens, spacing vars, all styles.
  - `state.ts`: `S`, `Space`, `Tile`, geometry, `withSpace`, `location`, rects, `debug()`.
  - `ops.ts`: all mutations. `render.ts`: state → DOM.
  - `tile.ts`: tile host: element, title bar, `Host` for kinds, mount/dispose, error state.
  - `kinds/`: `index.ts` (`Surface`, `Host`, registry), `terminal.ts` (xterm, pty wiring, links, drop text), `markdown.ts` (live file view: doc, links, history, toggles, theme), `probe.ts` (dev harness content kind).
  - `frame.ts`: frame host for content kinds (sandboxed iframe, port, requests, gesture rule, focus, `post`, `setRoot`).
  - `files.ts`: OS file drops → viewer tiles.
  - `drag.ts`: `track()`, drag/drop, border + float resize.
  - `paste.ts`: guarded paste (`pasteInto`), paste/drop routing to `Surface.paste|drop`.
  - `shelf.ts`, `tabs.ts`, `menu.ts` (context menu), `dialog.ts`, `settings.ts` (panel): UI parts.
  - `keys.ts`: runs actions from main, key suspend reporting, split, focus-direction. `quit.ts`: hold-⌘Q.
  - `driver.ts`: socket methods → ops.
  - `themes.ts`, `appearance.ts`: colors, fonts, window classes. `icons.ts`: SVGs, program → emoji.
  - `main.ts`: boot, delegated tile events.
- `bin/tie`: product CLI. `bin/tie-dev`: dev toolkit.
- `dev/`: `lib.mjs` (launch, CDP, tie wrapper, `rpc`), `helpers.mjs` (incl. `probe`, `probeFrame`, `contentFrame`, `mdState`, `osDrop`, `pickNext`), `frames.mjs` (frame tree), `package-check.mjs` (fuses + smoke), `electron-check.mjs`, `drive.mjs` (runner), `screenshot.mjs`, `layout.mjs`, `scenarios/*.mjs` (e2e), `brand-electron.sh` (postinstall), `icon.cjs`.
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
- `Tile` (common to all kinds):
  - `id` (`t1`...), `kind` (`'terminal'`, `'markdown'`, dev `'probe'`), `customTitle`, `customIcon`.
  - `exit` (code or null), `error` (start error).
  - `activity` (unseen output, shelved), `pinged` (`tie ping`).
  - `el`, `body`, `surface`.
- `Surface` (kind side, `kinds/index.ts`): `mount`, `resize`, `dispose`, `focus`, `title`, `icon`; optional `dir`, `cwd`, `paste`, `drop`, `appearance`, `info`, `history`.
- `Host` (given to a kind): `id`, `body`, `alive`, `changed`, `activity`, `exit`, `error`, `close`.
- Terminal state (kind-private, `TERMINALS.md`): `term`, `fit`, `pty` (= pid), `ptySize`, `oscTitle`, `proc`, `cmd`, `cwd`, `cwdNow`.
- Markdown state (kind-private, `MARKDOWN.md`): `doc {id, path, text, rev, missing}`, `history {list, index}`, `root` (frame's directory). Main: `docs` (id → path, watcher).

## Patterns

- Mutate only through `ops.ts`; ops end in `render()`, which always renders `S.visible`. Other space: `withSpace(id, fn)`.
- Async work on a tile (spawn, drop, menu action) re-checks `S.tiles.has(id)` (kinds: `host.alive()`): it may have closed.
- Shell code never reaches into a kind's state: only through `Surface`.
- `refocus()` after closing any modal/menu: keys to the active tile, or blur.
- Tile elements never re-parent (xterm stays mounted); absolute window coords.
- Keyed DOM reconcile where an element may hold pointer capture or hover (borders, shelf items, tabs).
- Drags use `track()`. Pointer capture retargets native `click`/`dblclick`: title clicks come via `startDrag`'s `onClick`.
- Tile metadata changes fire DOM event `tile-meta`; shelf and tabs listen.
- Spacing: CSS vars, `readGeometry()` (`LAYOUT.md`). Colors: `color-mix` of base tokens, never hardcoded (`SETTINGS.md`).
- Menus and dialogs are HTML (Playwright-drivable).
- Failures stay visible: tiles that can't start show `showError`; invalid settings block Save.
- Never throw inside node-pty callbacks (aborts the process).
- Content kinds: only via `frameSurface` (`TILES.md`); new frame verbs in `core/requests.ts` (`gesture` for anything acting for the user). Viewer colors from the host's theme message, set via CSSOM.
- Files: main decides (`fileViewer`, reads, writes); the renderer only names paths.
- Security (`SECURITY.md`): IPC via `ipc.on|handle`; URLs out via `openExternal`; text into terminals via `pasteInto`; content never in the shell realm; every guard has a `sec-*` scenario; security code gets a `// SECURITY:` comment.
- Logs: `debug(tag, ...)` (renderer), `log(tag, ...)` (main), enabled by `TIE_DEBUG`.
- Harness: prefer `tie-dev drive` (fresh offscreen instance). Failed run: read `out/log/runs/<time>-<name>/` first.
- Harness shortcuts: `h.press(ctx, 'Meta+d')` (through main); `ctx.page.keyboard` only for typing. Frame input: `export const hiddenWindow = true`.

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
  frames                   Window frame tree: url, origin, pid, out-of-process (content frames)
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

- `tie --help`: `list`, `open`, `close`, `move`, `focus`, `ping`, `title`, `icon`; dev-only `state`, `frames`, `open probe`. See `docs/CLI.md`.
- Ad-hoc scenario: `tie-dev drive - <<'EOF' ... EOF` (`docs/HARNESS.md`).
