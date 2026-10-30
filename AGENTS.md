# Tie: Tiled Integrated Environment

Full-screen Electron workspace: tabs of tiles (terminals; sandboxed content frames: live markdown, text, image, hex, local html; browser guests) in a slot tree + floating, with a shelf for parking tiles (icons in the toolbar, with the tabs), scriptable via the `tie` CLI.

## Guides

- `docs/ARCHITECTURE.md`: processes, IPC, instances, env, startup/quit.
- `docs/LAYOUT.md`: slot tree, floats, collapse, zoom, focus, ping, geometry.
- `docs/SHELF.md`: the shelf (concept + strip), templates, reveal/pin, activity.
- `docs/TABS.md`: spaces, `withSpace`, toolbar, tab list overflow.
- `docs/INPUT.md`: mouse, drops, drags, keys, menu.
- `docs/TILES.md`: tile host, nav bar, kind registry, policy table, file view, frame host, requests, `tie-content` protocol, viewers.
- `docs/TERMINALS.md`: spawn, cwd, sizing, titles, exit.
- `docs/MARKDOWN.md`: markdown kind (read-only): viewer pipeline, links, history, watching, opening.
- `docs/VIEWERS.md`: text, image, hex, html kinds: kind by extension or content, caps, viewers; html isolation, bootstrap, routing.
- `docs/BROWSER.md`: browser kind: `<webview>` guest, attach + guest guards, partition, downloads, popups, nav bar.
- `docs/CLI.md`: `tie` CLI, socket protocol, placement.
- `docs/SETTINGS.md`: settings, themes, tokens, fonts.
- `docs/HARNESS.md`: `tie-dev`, scenarios, helpers, traces.
- `docs/PACKAGING.md`: Tie.app, release, CLI launcher.
- `docs/SECURITY.md`: threat model, guards + their tests, fuses, rules.
- `docs/EXECUTION-AND-SECURITY.html`: onboarding explainer: processes, realms, per-tile doors matrix, layers, threats, attack stories, change checklist (`tie add docs/EXECUTION-AND-SECURITY.html`).

## Records and backlog

- `docs/IDEA.md`: original concept.
- `docs/2026-10-09-mvp-spec.md`: MVP spec, decisions, plan.
- `docs/2026-10-09-daemon-client-architecture.md`: shelved daemon/client design.
- `docs/2026-10-09-electron-crash-on-quit.md`: node-pty quit crash + macOS launch block.
- `docs/2026-10-10-tabs-single-renderer.md`: tabs = spaces in one renderer.
- `docs/2026-10-14-security-research.md`: prior art (Wave, VS Code, Joplin, Hyper/Tabby, Electron), methodology.
- `docs/2026-10-15-tile-host-plan.md`: tile host, frame isolation, keys in main; phased plan.
- `docs/2026-10-16-viewers-and-browser-plan.md`: text, image, hex, html, browser kinds; architecture, dependency graph.
- `docs/2026-10-21-pty-wedge.md`: macOS pty subsystem wedge (every `openpty` blocks in the kernel); diagnosis, harness check.
- `docs/2026-10-24-terminal-block-glyphs.md`: QR/block-char gaps (DOM renderer draws with font); options; WebGL renderer research.
- `docs/2026-10-25-shelf-in-toolbar.md`: shelf moved from the right sidebar into the toolbar; tab list overflow.
- `docs/2026-10-28-markdown-typography.md`: markdown typography after Pico (scale knob, em/rem), code colors per theme after the author's Neovim.
- `docs/2026-10-28-tile-management.md`: tab drops, swap (drag + keys), cmd+S, pills list + Missing, markdown list markers.
- `docs/PENDING.md`: backlog, open questions.

## Stack

- Electron 44 (pinned), electron-vite 5, Vite 7, TypeScript 5.9.
- xterm.js 6 + fit addon; node-pty 1.1 (rebuilt for Electron on install; patched by `patch-package` first: `patches/node-pty+1.1.0.patch`, shells spawned TCC-disclaimed, `TERMINALS.md` "Spawn").
- `native/peer` (`tie-peer`, N-API via node-addon-api, rebuilt for Electron on install): socket peer pid/uid, parent pid, child pids (busy terminals), process names (`tie replace` errors). Main only.
- Markdown viewer (bundled into its IIFE): markdown-it 15 (+ footnote, deflist, emoji plugins), DOMPurify 3, highlight.js 11 (core + common languages). Diagrams: `@mermaid-js/tiny` 12.2.0 (pinned; separate asset, loaded on demand). Live updates: morphdom 2.7.8 (keyed DOM diff).
- Vitest (unit), Playwright over CDP (scenarios = e2e).
- No UI framework: plain objects + `render()`.
- macOS only (harness uses `Electron.app` binary path, `-ApplePersistenceIgnoreState`).

## Files

- `src/core/layout.ts`: pure slot-tree logic (`insert`, `remove`, `swapLeaves`, `replaceLeaf`); drop zones on a tile (`dropZone`: centered `CENTER_ZONE` rectangle → swap / displace, else nearest edge band); shelf reveal hover zone (`inRevealZone`). Tests: `layout.test.ts`.
- `src/core/security.ts`: pure checks (IPC sender, external URL, path containment). Tests: `security.test.ts`.
- `src/core/callers.ts`: socket caller rule `callerTile` (peer uid + lineage → tile / external / refused); `replaceBlock` (`tie replace`: direct child, idle shell) (main). Tests: `callers.test.ts`.
- `src/core/paste.ts`: pure paste checks (control chars, would-run), caret preview, shell quoting. Tests: `paste.test.ts`.
- `src/core/policy.ts`: content kinds security table (page, sandbox, CSP, nav rule, assets, payload, cap, bootstrap, dev), `contentCsp`, `documentCsp` (main + renderer + build). Tests: `policy.test.ts`.
- `src/core/kinds.ts`: file → kind by extension (`fileKind`), else content (`sniff`, `sniffKind`: text/hex), `canOpenAs`, `extsOf`, `FILE_KINDS` (main + renderer). Tests: `kinds.test.ts`.
- `src/core/links.ts`: `classifyLink` for file views (main + renderer). Tests: `links.test.ts`.
- `src/core/content.ts`: content URL/token/path checks, viewer files, nav rules `navAllowed` (viewer-exact, within-root), `documentUrl`, `bootstrapAt`, `htmlCharset` (main). Tests: `content.test.ts`.
- `src/core/requests.ts`: frame → host request verbs + validator (renderer). Tests: `requests.test.ts`.
- `src/core/watchdog.ts`: content frame watchdog timing (ping, hang, render grace, sleep gaps). Tests: `watchdog.test.ts`.
- `src/core/keymap.ts`: keymap, chords, `actionFor` (main + renderer). Tests: `keymap.test.ts`.
- `src/main/`: `index.ts` (window, menu, IPC, RPC bridge, quit, dev socket methods incl. `window-size`), `security.ts` (navigation/window/permission guards, `uiIpc`, `openExternal`, `tie://` protocol, `UI_PARTITION` (in memory), `noNetwork`), `guest.ts` (browser guests: attach guard, navigation/popup/download guards, beforeunload (`unloadGuest`, `leaveGuest`), keys, partition, dev `guest` method), `content.ts` (`tie-content://`: token registry, handler, frame nav lock, hung-frame kill; html documents: CSP, bootstrap injection, folder watch, navigation reports), `keys.ts` (shortcuts in `before-input-event`; `watchKeys` per guest), `docs.ts` (viewer files: check, open + watch, picker; read-only), `watch.ts` (file watcher, stable reads, revisions; tests: `watch.test.ts`), `pty.ts` (pty host, polling, `tiles()` pid → tile, `busy` / `busyIgnoring`), `socket.ts` (JSON-RPC server, caller gate, `replace` checks + `replaced` on connection close), `settings.ts` (file, sanitize, validate, shell argv), `env.ts` (instance, paths, debug port, `log()`).
- `src/preload/index.ts`: `window.tie` bridge.
- `src/viewers/`: content viewers (`<kind>.html` + `.ts`, IIFE) → `out/viewers/`. Shared: `runtime.ts` (handshake, theme, links, keys, guards, `style()`, harness `window.viewer`), `live.ts` (keyed diff, anchoring), `marks.ts` (change marks, edge markers, `n`), `highlight.ts` (highlight.js subset). Kinds: `markdown` (pipeline; + `mermaid.ts`: diagrams, lazy library), `text` (lines, gutter, literal), `image` (fit/actual), `hex` (virtualized rows), `probe` (dev, own minimal handshake). `html-bootstrap.ts`: inlined by main into html documents (handshake, pong, link/window.open requests, scroll keep). `markdown-it-plugins.d.ts`: plugin types.
- `src/renderer/`:
  - `index.html`: static layers. `style.css`: tokens, spacing vars, all styles.
  - `state.ts`: `S`, `Space`, `Tile`, geometry, `withSpace`, `location`, rects, `debug()`.
  - `ops.ts`: all mutations (incl. `replaceTile`: `tie replace`; `displaceTile`: a new tile takes a leaf, its tile shelved). `render.ts`: state → DOM.
  - `tile.ts`: tile host: element, title bar, nav bar, `Host` for kinds, mount/dispose, error state.
  - `nav.ts`: `Nav` capability, nav bar (back / forward / reload / location), `navAction`, `focusLocation`.
  - `kinds/`: `index.ts` (`Surface`, `Host`, `Pill`, `PillColor`, `KindSpec` registry: `kindSpec`, `needsFile`; `TEMPLATES`), `terminal.ts` (xterm, pty wiring, links → strip + confirm, drop text, xterm 6.0 width-cache fix), `html.ts` (html page, static: routing, history, live reload, scripts-blocked tag), `probe.ts` (dev harness content kind).
  - `external.ts`: links out (`openExternal(url, from, note?)`: confirm dialog, setting `confirmExternal`, then main). `prefs.ts`: behaviour settings cached for synchronous reads (`confirmExternal`, `terminalTitle`). File kinds (markdown, text, image, hex): one line each in `index.ts` (file view + viewer).
  - `fileview.ts`: file view for file kinds (doc, history, nav, folders, links, theme message).
  - `frame.ts`: frame host for content kinds (sandboxed iframe, port, requests, gesture rule, focus, watchdog, `post`, `setRoot`).
  - `guest.ts`: browser kind (`browserKind`: `<webview>`, title, nav bar with editable location, focus, crash/hang → error, beforeunload Leave / Stay; `initGuests`).
  - `files.ts`: OS file drops → viewer tiles.
  - `drag.ts`: `track()`, drag/drop, border + float resize.
  - `paste.ts`: guarded paste (`pasteInto`), paste/drop routing to `Surface.paste|drop`.
  - `shelf.ts` (shelf strip + template list), `tabs.ts` (tab list, overflow), `menu.ts` (context menu), `dialog.ts`, `settings.ts` (panel: Appearance, Terminal, Security): UI parts.
  - `keys.ts`: runs actions from main, key suspend reporting, split, focus-direction. `quit.ts`: quit question (`askQuit`).
  - `close.ts`: user closes (`requestCloseTile`, `requestCloseTab`): busy terminals confirm, browser beforeunload; `runningIn`, `runningList`.
  - `driver.ts`: socket methods → ops.
  - `themes.ts` (`Theme {label, dark, accent, palette, code?}`: `code` = per-token colors for viewer code blocks, else ANSI fallback), `appearance.ts`: colors, fonts, window classes. `icons.ts`: SVGs (`ICON` buttons, `GLYPH` tile/template icons), `SHELLS`, `Icon`, `iconHtml`.
  - `main.ts`: boot, delegated tile events.
- `native/peer/`: `peer.cc` (`peerOf(fd)`, `parentOf(pid)`, `childrenOf(pid)`: libproc `proc_listchildpids`, `nameOf(pid)`: `proc_name`), `binding.gyp`, `index.js` / `.d.ts`; local dependency `tie-peer`.
- `bin/tie`: product CLI. `bin/tie-dev`: dev toolkit.
- `dev/`: `lib.mjs` (launch, CDP, tie wrapper, `rpc`, `leftovers`: per-instance pty leak check), `helpers.mjs` (incl. waits `eventually`, `wait*`; `probe`, `probeFrame`, `contentFrame`, `mdState`, `clickIn`, `osDrop`, `pickNext`, `site`, `guestPage`, `guestKey`, `guestClick`), `frames.mjs` (frame tree), `package-check.mjs` (fuses + smoke), `electron-check.mjs`, `drive.mjs` (runner), `e2e.mjs` (`test --e2e`: parallel, selection), `viewers.mjs` (viewer build + `--watch` for hot mode), `screenshot.mjs`, `layout.mjs`, `scenarios/*.mjs` (e2e), `samples/` (viewer fixtures: `markdown.md`), `brand-electron.sh` (postinstall), `icon.cjs`.
- `electron-builder.yml`, `resources/bin/tie` (CLI launcher): packaging. `electron.vite.config.ts`: build.
- `patches/`: `patch-package` patches applied at install (`node-pty`: disclaimed spawn).

## Model

- `S.spaces` (tab order), `S.visible` (shown), `S.current` (ops target; differs only inside `withSpace`).
- Per-space fields, accessed on `S` (accessors onto `S.current`):
  - `tree`: `Leaf {id}` | `Split {dir: 'row'|'col', children, sizes}` (fractions). Normalized. Null when empty.
  - `floats: {id, x, y, w, h}[]`: board-relative px, last = topmost.
  - `shelf: id[]`. `collapsed: Set`, `zoomed`, `active`, `mru`, `pinned` (reveal pinned), `revealed` (hovered).
- `Space` also: `id` (`s1`...), `customTitle`, `customIcon`.
- Toolbar (`TABS.md`): `#toolbar` in `#bottom` or `#top` (`toolbar` setting): `#brand`, `#tabs` (`#tab-list` scroller + `#tab-add`), `#shelf` (one `.item` per `S.shelf` entry, `shelfRect()` = its DOM box), `#templates`. The shelf is a concept located in the toolbar, not a layout region.
- New spaces get a terminal (`newTab({empty})`: none); a space emptied by `closeTile` / `moveToSpace` drops itself (empty-space hook registered by `initTabs`); only the last space may be empty; never zero spaces (`TABS.md`).
- `S.tiles: Map<id, Tile>` (all spaces). `S.rects`: last rendered rects (visible space). `S.cwd`: default start dir.
- A tile is in exactly one of tree / floats / shelf of one space (`location(id)`, `spaceOf(id)`).
- `Tile` (common to all kinds):
  - `id` (`t1`...), `kind` (`'terminal'`, `'markdown'`, `'text'`, `'image'`, `'hex'`, `'html'`, `'browser'`, dev `'probe'`), `customTitle`, `customIcon` (user text).
  - `exit` (code or null), `error` (start error).
  - `activity` (unseen output, shelved), `pinged` (`tie ping`).
  - `el`, `body`, `surface`.
- `Surface` (kind side, `kinds/index.ts`): `mount`, `resize`, `dispose`, `focus`, `title`, `icon` (→ `Glyph` key); optional `tip` (title tooltip), `dir`, `cwd`, `paste`, `drop`, `appearance`, `info`, `busy` (→ `{what}` or null: terminals, `TERMINALS.md`), `unload` (→ may close: browser beforeunload), `nav` (`{state() → {location, back, forward, editable}, back, forward, reload, go?}`), `pills` (`{label, title, on, toggle?, color?, gravity?}[]`: title-bar states, html "Scripts blocked", file kinds "Missing").
- `Icon` (`icons.ts`): `{glyph: Glyph}` (built-in SVG, `GLYPH` key) | `{text}` (custom icon, escaped). `displayIcon(t)` → `Icon`; `iconHtml(icon)` renders it (title bar, shelf, tabs, ghost).
- `KindSpec`: `kind`, `factory`, `opens` (`'bare'|'file'|'url'`). Shelf templates: `TEMPLATES` (`{id: 'terminal'|'file'|'browser', label, icon: Glyph}`). `OpenOpts`: `title`, `cwd`, `cmd`, `path`, `hash`, `url`.
- `ContentPolicy` (`core/policy.ts`, per content kind): `page` (`viewer`|`document`), `sandbox`, `styles`, `nav` (`viewer-exact`|`within-root`), `assets`, `payload` (`text`|`bytes`|`none`), `maxBytes`, `bootstrap`, `dev`.
- `Host` (given to a kind): `id`, `body`, `alive`, `changed`, `activity`, `exit`, `error`, `close`, `hint` (link strip text, bottom-left).
- Terminal state (kind-private, `TERMINALS.md`): `term`, `fit`, `pty` (= pid), `ptySize`, `oscTitle`, `proc`, `cmd`, `cwd`, `cwdNow`.
- Browser state (private, `guest.ts`): `wv` (the `<webview>`), `url`, `title`, `loading`, `ready` (dom-ready), `gid` (guest webContents id). Rules: `core/guest.ts`. Main: `guests` (live guest webContents).
- File view state (private, `fileview.ts`): `doc {id, path, rev, text?, bytes?, missing}` (payload per policy), `history {list, index}`, `root` (frame's directory). Main: `docs` (id → path, watcher).

## Patterns

- Mutate only through `ops.ts`; ops end in `render()`, which always renders `S.visible`. Other space: `withSpace(id, fn)`.
- Closing on the user's behalf: `requestCloseTile` / `requestCloseTab` (`close.ts`: asks if busy); scripted (`tie close`, exits): `closeTile`.
- Async work on a tile (spawn, drop, menu action) re-checks `S.tiles.has(id)` (kinds: `host.alive()`): it may have closed.
- UI code never reaches into a kind's state: only through `Surface`.
- `refocus()` after closing any modal/menu: keys to the active tile, or blur.
- Tile elements never re-parent (xterm stays mounted); absolute window coords.
- Keyed DOM reconcile where an element may hold pointer capture or hover (borders, shelf items, tabs).
- Drags use `track()`. Pointer capture retargets native `click`/`dblclick`: title clicks come via `startDrag`'s `onClick`.
- Tile metadata changes fire DOM event `tile-meta`; shelf and tabs listen.
- Spacing: CSS vars, `readGeometry()` (`LAYOUT.md`). Colors: `color-mix` of base tokens, never hardcoded (`SETTINGS.md`).
- Menus and dialogs are HTML (Playwright-drivable).
- Failures stay visible: tiles that can't start show `showError`; invalid settings block Save.
- Never throw inside node-pty callbacks (aborts the process).
- Browser tiles: only via `browserKind` + main `attachGuest`/`guardGuest`; URL rules only in `core/guest.ts`.
- Content kinds: only via `frameSurface` (`TILES.md`); what may differ per kind only in `core/policy.ts`; new frame verbs in `core/requests.ts` (`gesture` for anything acting for the user). Viewer colors from the host's theme message, set via CSSOM.
- New content kind = policy row + `KindSpec` + viewer pipeline (on `runtime.ts`); file kinds: + `FILE_KINDS` / extensions (`core/kinds.ts`) + `fileKind(kind, glyph)` in `kinds/index.ts`.
- Files: main decides (`fileViewer`, reads, writes); the renderer only names paths.
- Security (`SECURITY.md`): IPC via `ipc.on|handle`; URLs out via `renderer/external.ts` → main `openExternal`; text into terminals via `pasteInto`; content never in the UI realm; socket callers by kernel lineage (`@core/callers`), never `TIE_TILE`; every guard has a `sec-*` scenario; security code gets a `// SECURITY:` comment.
- Logs: `debug(tag, ...)` (renderer), `log(tag, ...)` (main), enabled by `TIE_DEBUG`; `security` always on. Any logged value that isn't Tie's own text (URL, href, path, name, request body, socket params): wrap with `untrusted(v)` (`@core/log`) → `<untrusted>…</untrusted>`, escaped.
- Harness: prefer `tie-dev drive` (fresh offscreen instance). Failed run: read `out/log/runs/<time>-<name>/` first.
- Harness runs: after a change, only the scenarios of the feature worked on (`test --e2e <names|globs>`) + `test --unit` + `typecheck`. Full `test --e2e` only when specifically needed (shared harness / `lib.mjs`, layout core, handing back a large refactor) and for release prep (`tie-dev release` runs it).
- Scenarios wait, never sleep for something observable: `h.eventually`, `h.wait*` (`HARNESS.md`); a `ctx.sleep` only for "nothing happens" / debounce, commented.
- Harness shortcuts: `h.press(ctx, 'Meta+d')` (through main); `ctx.page.keyboard` only for typing. Frame and guest input (real clicks): `export const hiddenWindow = true`. Clicks into content frames: `h.clickIn` (Playwright `evaluate` carries a user gesture: test gesture-less script behaviour from page timers). Guest keys: `h.guestKey(ctx, id, 'Meta+d')`.

## Toolkit

```
tie-dev - Tie development toolkit

Usage: tie-dev [--instance NAME] <command> [args]

Commands:
  run [--hot]              Run in foreground; --hot: dev server, UI hot-reloads on change, viewers rebuild + tiles reload
  build                    Build to out/
  start                    Build if needed, launch app in background
  stop                     Stop instance
  status                   Show instance info (pid, socket, debug port)
  logs [-f]                Show instance log (enable tags with TIE_DEBUG=layout,shelf,pty,rpc or *)
  test --unit              Unit tests (vitest)
  test --e2e [--jobs N] [names|globs...]
                           Scenarios on fresh instances, N at a time (default 4, TIE_JOBS); names or globs
                           (e.g. 'sec-*' shelf* cli-replace) select, none = all
  typecheck                tsc --noEmit
  layout                   ASCII render of the board
  frames                   Window frame tree: url, origin, pid, out-of-process (content frames)
  screenshot [file]        PNG of current state (default tmp/shots/current.png)
  sample [name]            Open dev/samples/<name>.md (default markdown) in the instance: style iteration fixture
  drive <scenario|-> [--attach] [--keep]
                           Run Playwright scenario (file in dev/scenarios, path, or - for stdin).
                           Fresh instance by default; --attach uses running instance;
                           --keep leaves fresh instance running.
  scenarios                List scenarios
  ptys                     Live pty count (/dev/ttys*) and spawn-helpers stuck in the kernel (pty wedge: reboot)
  ptydump [dir]            Snapshot for a pty wedge: processes, stacks, probes, power + kernel logs, Tie state (out/log/ptydump/)
  package                  Build out/package/mac-arm64/Tie.app (arm64, signed ad hoc), then check-package
  check-package [app]      Packaged app: fuses as expected, smoke launch (boots, CLI answers)
  electron-check           Pinned Electron vs latest of its major (npm); exit 1 if behind
  release --version X.Y.Z  Clean repo, all checks, bump + commit version, tag vX.Y.Z, package
  install                  Package, then install to /Applications/Tie.app (Tie must not be running)
  icon                     Re-render placeholder icon (build/icon.png, build/icon.icns)

Instance: --instance NAME (or =NAME, anywhere) or TIE_INSTANCE (default "dev"; the installed app is "default"). Inside a Tie
terminal TIE_INSTANCE is the host's and is ignored; run/start refuse "default" unless --instance says so. Each instance has its own
socket, lock, debug port, log under ~/.config/tie/.
```

- `tie --help`: `list`, `add` (file, URL, kind; `--tab`), `replace` (as `add`, takes the calling terminal's place), `close`, `move` (`--tab`, `--swap`), `focus`, `ping`, `title`, `icon`; dev-only `state`, `frames`, `add probe`. See `docs/CLI.md`.
- Ad-hoc scenario: `tie-dev drive - <<'EOF' ... EOF` (`docs/HARNESS.md`).
