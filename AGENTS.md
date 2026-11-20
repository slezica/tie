# Tie: Tiled Integrated Environment

Full-screen Electron workspace: tabs of tiles (terminals; sandboxed content frames: live markdown, text, image, hex, local html; browser guests) in a slot tree + floating, with a shelf for parking tiles; tabs, shelf and templates placed in four configurable bars; scriptable via the `tie` CLI.

## Guides

- `docs/ARCHITECTURE.md`: processes, IPC, instances, startup, quit, build.
- `docs/LAYOUT.md`: locations, slot tree, floats, collapse, zoom, focus, ping, bars (layout, drops on bars), geometry, rendering.
- `docs/SHELF.md`: the shelf (concept + strip), reveal/pin, selection, group drag, activity.
- `docs/TABS.md`: spaces, `withSpace`, switching, tab list, overflow, drops onto tabs.
- `docs/INPUT.md`: mouse, drops, drags, keys, file picker, menu, dialogs, closing, OS drops.
- `docs/TILES.md`: tile host, nav bar, kind registry, policy table, file view, frame host, requests, links out, `tie-content` protocol, viewers.
- `docs/TERMINALS.md`: create, cwd, spawn, paste, links, size, keys, exit, errors, busy, close.
- `docs/DIRECTORIES.md`: tile `cwd` vs frame `root` (root rule, `/` dialog), inheritance (`contextOf`), pathway table, titles.
- `docs/MARKDOWN.md`: markdown kind (read-only): viewer pipeline, diagrams, links, live updates, history, watching, opening.
- `docs/VIEWERS.md`: text, image, hex, html kinds: kind by extension or content, caps, viewers; html isolation, bootstrap, routing.
- `docs/BROWSER.md`: browser kind: `<webview>` guest, attach + guest guards, partition, downloads, popups, beforeunload, nav bar.
- `docs/CLI.md`: `tie` CLI, socket protocol, placement.
- `docs/SETTINGS.md`: settings file rules, panel, Bindings page, themes, tokens, fonts, window options.
- `docs/HARNESS.md`: `tie-dev`, fresh instances, scenarios, helpers, mdpage, TCC prompts, traces.
- `docs/PACKAGING.md`: Tie.app, release, install while running, bundle, CLI launcher, signing.
- `docs/SECURITY.md`: threat model, rules, guards + their tests, fuses.
- `docs/ENGINE.md`: assumptions about Chromium, Electron, libraries, macOS (evidence per row); upgrade checklist.
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
- `docs/2026-10-17-security-review.md`: full security pass (code, Electron defaults, harness probes): settled and open issues.
- `docs/2026-10-17-security-report.html`: the review's rich report ("Tie Security Landscape"): every issue with where, threat model, exploit, impact.
- `docs/2026-10-21-pty-wedge.md`: macOS pty subsystem wedge (every `openpty` blocks in the kernel); diagnosis, harness check.
- `docs/2026-10-24-terminal-block-glyphs.md`: QR/block-char gaps (DOM renderer draws with font); options; WebGL renderer research.
- `docs/2026-10-25-shelf-in-toolbar.md`: shelf moved from the right sidebar into the toolbar; tab list overflow.
- `docs/2026-10-28-markdown-typography.md`: markdown typography after Pico (scale knob, em/rem), code colors per theme after the author's Neovim.
- `docs/2026-10-28-tile-management.md`: tab drops, swap (drag + keys), cmd+S, pills list + Missing, markdown list markers.
- `docs/2026-10-30-cli-reorg.md`: CLI: current tile, `--tile`, entropic ids, `set`, aliases.
- `docs/2026-10-30-file-picker.md`: Tie's own file picker (replaces the native dialog): design, scorer, walk, TCC research.
- `docs/2026-10-30-working-directories.md`: tile `cwd` vs `root`, inheritance principles, pathway review.
- `docs/2026-11-01-install-while-running.md`: `tie-dev install` while Tie runs: stage, swap at next launch, `--restart`.
- `docs/2026-11-13-content-roots.md`: frame root = the context cwd when it holds the file; `--root`; `/` asks.
- `docs/2026-11-14-plannotator-research.md`: Plannotator (plan/doc annotation for agents): features, hook protocol, annotation model, agent-facing text format, lessons for Tie.
- `docs/2026-11-16-configurable-bindings.md`: configurable key bindings (model, capture, Bindings page; phased plan; manual check results).
- `docs/2026-11-17-shelf-multi-select.md`: shelf multi-select (cmd+click), group actions (close, unshelve, move, group drag).
- `docs/2026-11-18-terminal-color-schemes.md`: custom terminal color schemes: open questions, not started.
- `docs/2026-11-18-test-suite-review.md`: test suite review (5 areas): findings, waves (checks made real, harness helpers, merges / renames by feature glob), final scenario list.
- `docs/2026-11-19-configurable-toolbars.md`: four bars, movable tabs / shelf / templates, edit layout mode, bar resize: settled design, code survey, phased plan.
- `docs/RELEASES.md`: release notes, newest first: changes, pending manual testing, known issues.
- `docs/PENDING.md`: backlog, open questions.

## Stack

- Electron 44 (pinned), electron-vite 5, Vite 7, TypeScript 5.9.
- xterm.js 6 + fit addon; node-pty 1.1 (rebuilt for Electron on install; patched by `patch-package` first: `patches/node-pty+1.1.0.patch`, shells spawned TCC-disclaimed, `TERMINALS.md` "Spawn").
- `native/peer` (`tie-peer`, N-API via node-addon-api, rebuilt for Electron on install): socket peer pid/uid, parent pid, child pids (busy terminals), process names (`tie replace` errors). Main only.
- Markdown viewer (bundled into its IIFE): markdown-it 15 (+ footnote, deflist, emoji plugins), DOMPurify 3, highlight.js 11 (core + common languages). Diagrams: `@mermaid-js/tiny` 12.2.0 (pinned; separate asset, loaded on demand). Live updates: morphdom 2.7.8 (keyed DOM diff).
- `ignore` 7 (main: gitignore matching for picker walks).
- Vitest (unit), Playwright over CDP (scenarios = e2e).
- No UI framework: plain objects + `render()`.
- macOS only (harness uses `Electron.app` binary path, `-ApplePersistenceIgnoreState`).

## Files

- `src/core/`: pure logic, unit-tested beside (`<name>.test.ts`). Users in parentheses.
  - `layout.ts`: slot tree (`insert`, `remove`, `move`, `swapLeaves`, `replaceLeaf`, `normalize`), rects (`compute`, `resize`, `equalize`), drop zones (`dropZone`: `CENTER_ZONE` → swap / displace, else nearest edge; `nearestEdge`: group drops), shelf reveal zone (`inRevealZone`), `insertGroup` (N leaves in the area one would take).
  - `focus.ts`: `neighbor(from, candidates, mru, dir)`: focus / swap direction ranking (renderer).
  - `security.ts`: `isUiSender`, `externalUrl`, `sameDocument`, `resolveInside` (main).
  - `callers.ts`: socket caller rule `callerTile` (peer uid + lineage → tile / external / refused); `replaceBlock` (`tie replace`: direct child, idle shell) (main).
  - `paste.ts`: `pasteRisks` (control chars, would-run), `showControls` (caret preview), `shellQuote` (renderer).
  - `policy.ts`: content kinds security table `POLICY` (`ContentPolicy` rows), `policyOf`, `viewerKinds`, `contentCsp`, `documentCsp` (main + renderer + build).
  - `kinds.ts`: file → kind: `fileKind` (extension), `sniff` / `sniffKind` (content: text / hex), `canOpenAs`, `FILE_KINDS`, `isFileKind`, `extOf` (main + renderer).
  - `links.ts`: `classifyLink` (file views), `externalParts` (link dialog: site, tail, userinfo) (renderer).
  - `content.ts`: content URL / token / path checks, viewer files, nav rule `navAllowed` (viewer-exact, within-root), `routeContent`, `documentUrl`, `bootstrapAt`, `htmlCharset` (main).
  - `roots.ts`: frame roots: `rootFor(cwd, path, current?, explicit?)` (current while it holds the file, else cwd when it does, else the folder), `contains`, `dirOf`, `withinRoot` (renderer).
  - `requests.ts`: frame → host request verbs: `parseRequest`, `needsGesture` (renderer).
  - `watchdog.ts`: content frame watchdog timing (ping, hang, render grace, sleep gaps) (renderer).
  - `guest.ts`: browser rules: `BROWSER_PARTITION`, `guestNavAllowed`, `locationUrl` (location bar), `popupUrl`, `downloadName` / `uniqueName`, `pageTitle` (main + renderer).
  - `log.ts`: log line format: `untrusted(v)` → `<untrusted>…</untrusted>`, `escapeUntrusted`, `BIDI`, `plainLog` (main + renderer).
  - `ids.ts`: `randomId` (prefix + 6 chars, base32 minus `0 1 l o`, live uniqueness check) (renderer).
  - `picker.ts`: file picker scorer: `score` (fzf v1 window, path bonuses, smart case, NFC, AND terms), `rank` (top-K), `merge` (streamed chunks), `parseLine` (line → prefix, dir, query), `joinPath`, `descendOf` (renderer).
  - `keymap.ts`: `ACTIONS` (id, label, default chord, aliases), `Bindings` (sparse overrides), `resolveKeymap`, `conflicts`, `validBinding`, `bindingErrors` / `cleanBindings`, `accelerator` (menu label), `chord`, `actionFor`; `decideKey` (`KeyMode`: every real key → pass / block / action / capture) (main + renderer).
  - `bars.ts`: bars layout: `Bars` (bar → `start` / `end` component lists), `defaultBars`, `validBars`, `cleanBars`, `migrateToolbar` (old `toolbar` key), `placeOf` / `barOf` / `barItems` / `barEmpty`, `isVertical`, `dropComponent` (nearest-component drop rule); edit mode: `sameBars` (structural), `moveComponent`, `barsSummary` (panel row), `barRects` / `barZones` (bar rects, non-overlapping zones), `barAt` / `gravityAt` / `indexAt` (drag target) (core settings + renderer).
  - `barsize.ts`: bar sizes: `BarSizes`, limits `HBAR` / `VBAR`, `defaultSizes`, `clampStored` (static), `shownSize` / `maxSize` (window: side bars ≤ 30%), `barScale` (horizontal content scale, floor `SCALE_MIN`), `barForm` / `LIST_MIN` (side bar narrow / list), `narrowScale` (narrow side bar's shelf / templates scale), `cleanSizes` (untrusted payload), `parseUiState` / `uiStateText` (the UI state file) (main + renderer).
  - `settings.ts`: `Settings`, `DEFAULTS`, `THEME_ALIASES`, `sanitize`, `parseSettings` (file text → settings, `toolbar` migrated), `fileChanged`, `validateSettings(s, executable)`, `parseCommand`, `TERMINAL_TITLES` (main).
  - `zoom.ts`: page zoom `ZOOM_STEPS`, `zoomStep(factor, dir)`, `zoomLabel` (renderer).
  - `cli.test.ts`: `bin/tie` argument errors (subprocess, no socket), help sections.
  - `docs.test.ts`: tree rules: `SECURITY.md` cites only existing scenarios; `ipcMain` and Electron `shell` only in `main/security.ts`.
- `src/main/`:
  - `index.ts`: window, menu, IPC, RPC bridge, quit, dev socket methods (`devMethods`, `HARNESS.md`).
  - `security.ts`: `harden` (navigation / window / permission guards), `uiIpc`, `openExternal`, `serveShell` (`tie://`), `UI_PARTITION` (in memory), `noNetwork`, `noWebRtcUdp`.
  - `guest.ts`: browser guests: `attachGuest`, `guardGuest` (navigation, popups), downloads (`initBrowserSession`, `allowDownload`, `noDownloads`), `noDeviceChoosers`, beforeunload (`unloadGuest`, `leaveGuest`), dev `guestMethod`.
  - `content.ts`: `tie-content://`: token registry (`openContent`), `serveContent`, frame nav lock (`contentFrameAllowed`), hung-frame kill (`killContent`); html documents: CSP, bootstrap injection, folder watch, navigation reports.
  - `keys.ts`: shortcuts in `before-input-event` (`onInput` applies `decideKey`); keymap from settings (`setBindings`, `quitChord`); `watchKeys` per guest; `keyMode` (dev socket `key-mode`).
  - `docs.ts`: viewer files (`fileViewer`, `openDoc` + watch, `closeDoc`; read-only), native dialog `pickFile` (picker's `…`), picker walks `startWalk` / `stopWalk`.
  - `walk.ts`: picker directory walk `walkDir` (streaming BFS, gitignore chain, TCC fences `PROTECTED_HOME`, budgets `WALK_CAP`). Tests: `walk.test.ts`.
  - `watch.ts`: `watchFile`, `readStable`, `revision`. Tests: `watch.test.ts`.
  - `pty.ts`: `initPty`: pty host, polling, `tiles()` (pid → tile), `busy` / `busyIgnoring`.
  - `socket.ts`: `startSocket`: JSON-RPC server, caller gate, `replace` checks + `replaced` on connection close.
  - `settings.ts`: settings file: load at start, baseline, `watchSettings`, writes only on Save / Recreate (`SETTINGS.md` "File"), Reload / Ignore, load errors; `shellArgv`, `resolveExecutable`.
  - `uistate.ts`: UI state file `<state>/<instance>.ui.json` (bar sizes): read at start, `uiState`, `setBarSizes` (IPC payload cleaned, file 0600) (`LAYOUT.md` "Bar sizes").
  - `env.ts`: instance, paths (`stateDir`, `socketPath`, `logPath`), `debugPort`, `log()`.
  - `update.ts`: `applyStaged`: staged update swap at launch, packaged only (`PACKAGING.md` "Install while running").
- `src/preload/index.ts`: `window.tie` bridge (`TieApi`).
- `src/viewers/`: content viewers (`<kind>.html` + `.ts`, IIFE) → `out/viewers/`.
  - Shared: `runtime.ts` (`startViewer`: handshake, theme, zoom, links, keys, guards; `style()`; harness `window.viewer`), `live.ts` (`createLive`: keyed diff, anchoring), `marks.ts` (change marks, edge markers, `n`), `highlight.ts` (highlight.js subset).
  - Kinds: `markdown` (pipeline; `mermaid.ts`: diagrams, lazy library), `text` (lines, gutter, literal), `image` (fit / actual), `hex` (virtualized rows), `probe` (dev, own minimal handshake).
  - `html-bootstrap.ts`: inlined by main into html documents (handshake, pong, zoom, link / `window.open` requests, scroll keep). `markdown-it-plugins.d.ts`: plugin types.
- `src/renderer/`:
  - `index.html`: static layers. `style.css`: tokens, spacing vars, all styles.
  - `state.ts`: `S`, `Space`, `Tile`, geometry (`readGeometry`: insets `TOP` `BOTTOM` `LEFT` `RIGHT`; `boardRect`, `layoutOpts`, `shelfRect`, `revealSize`), `withSpace`, `location`, `spaceOf`, `debug()`.
  - `ops.ts`: all mutations: place / swap / close / move, focus (`activate`, `refocus`), collapse / zoom / pin, shelf selection + group ops (`toggleSelected`, `placeGroup`, `floatGroup`, `shelveGroup`, `unshelveGroup`, `moveGroupToSpace`), `replaceTile` (`tie replace`), `displaceTile`, tile cwd (`contextOf`, `cwdOf`, `setCwd`). `render.ts`: `render()`: state → DOM.
  - `tile.ts`: tile host: `createTile`, `mountTile`, title bar, `Host` for kinds, `showError`, `displayTitle` / `displayIcon`.
  - `nav.ts`: `Nav` capability, nav bar (back / forward / reload / location), `navAction`, `focusLocation`.
  - `kinds/`: `index.ts` (`Surface`, `Host`, `Pill`, `KindSpec` registry: `kindSpec`, `needsFile`; `TEMPLATES`; file kinds: one `fileKind` line each), `terminal.ts` (xterm, pty wiring, links → strip + confirm, drop text, xterm 6.0 fixes `fixWidthCache`, `fixLinkCache`), `html.ts` (static html page: routing, history, live reload, "Scripts blocked" pill), `probe.ts` (dev harness kind; root `--root`, else its cwd).
  - `fileview.ts`: `fileView`: file view for file kinds (doc, history, nav, folders, links, theme message); `reloadViewers` (hot mode).
  - `frame.ts`: `frameSurface`: frame host for content kinds (sandboxed iframe, port, requests, gesture rule, flood cap, focus, watchdog, `post`, `setRoot`).
  - `guest.ts`: browser kind (`browserKind`: `<webview>`, title, editable location, zoom, crash / hang → error, beforeunload Leave / Stay; `initGuests`).
  - `roots.ts`: `resolveRoot(cwd, path, current?, explicit?)`: the root rule + the `/` question (Stop / Use file directory / Open anyway).
  - `external.ts`: `openExternal(url, from, note?)` (link-out confirm unless `confirmExternal` off, then main), `confirmFile` (file outside the document's folder).
  - `prefs.ts`: behaviour settings cached for synchronous reads (`confirmExternal`, `terminalTitle`, `gitignore`).
  - `files.ts`: `dropFiles`: OS file drops → viewer tiles.
  - `drag.ts`: `track()`, `startDrag`, drop targets (group: `groupTarget`, `dropGroup`; previews `showPreviews`), border + float resize.
  - `paste.ts`: guarded paste (`pasteInto`), paste / drop routing to `Surface.paste|drop`.
  - `picker.ts`: file picker `pickPath(startDir)` (path line, fuzzy rows over a `doc:walk`, `…` native dialog; `INPUT.md` "File picker").
  - `bars.ts`: the four bars: `applyBars` (components into their groups, empty bars hidden, `has-<bar>` classes, templates divider), `barDropAt` (which component takes a tile drop over a bar), `bars()`, `barOfComponent`, `verticalComponent`.
  - `barsize.ts`: bar sizes: stored (from main at boot, `initSizes`), shown (`shownSizes`), `applySizes` (CSS: `--size-<bar>`, per bar `--k`; side bars `.narrow`, `--kn`; each render), edge drag + double-click (`initBarEdges`), `setBarSize` (persists).
  - `layoutedit.ts`: edit layout mode (`editLayout(done)`, `abortLayoutEdit`): dim layer, bar indicators, component boxes, labels, floating box, component drag + preview, keys (`LAYOUT.md` "Edit mode").
  - `shelf.ts`: shelf strip (items: icon + `.lbl` title for the list form), template list, overflow wiring, selection de-select paths, group menu. `tabs.ts`: tabs (`newTab`, `switchTab`, `closeTab`), tab list, reorder (`dragTab`), overflow, tab drops (`tabDropAt(x, y)`); along the bar's axis.
  - `overflow.ts`: scrolling lists in bars (tab list, shelf strip), axis per bar: `syncFades` (`.more-start` / `.more-end`), `showChild` (keep in view), `sideWheel`, `edgeScroll` (drag auto-scroll), `edgeHolding`.
  - `menu.ts`: context menus (`showTileMenu`, `showMetaMenu`, `showListMenu`). `dialog.ts`: `infoDialog`, `confirmDialog`, `choiceDialog`.
  - `settings.ts`: settings panel (Appearance (with the Layout row: Reset, Modify → edit mode), Bindings, Terminal, Files, Security, About), changed-on-disk banner, `applySettings`, `settingsLoadDialog`. `bindings.ts`: Bindings page (`bindingsPage`: filters, table, capture edit, conflict dialog).
  - `keys.ts`: runs actions from main, key suspend reporting, split, focus direction (ranking `@core/focus`). `capture.ts`: `captureField` (input taking key presses as a chord name; `INPUT.md` "Capture fields"). `quit.ts`: `askQuit`.
  - `close.ts`: user closes (`requestCloseTile`, `requestCloseGroup`, `requestCloseTab`): busy terminals confirm, browser beforeunload; `runningIn`, `runningList`.
  - `driver.ts`: `initDriver`: socket methods → ops.
  - `themes.ts`: `THEMES` (`Theme {label, dark, accent, palette, code?}`: `code` = viewer code token colors, else ANSI fallback), `xtermTheme`. `appearance.ts`: colors, fonts, window classes, bars layout (→ `applyBars`), `termOptions`.
  - `icons.ts`: SVGs (`ICON` buttons, `GLYPH` tile / template icons), `SHELLS`, `Icon`, `iconHtml`.
  - `main.ts`: boot, delegated tile events, OS-drag shield.
- `native/peer/`: `peer.cc` (`peerOf(fd)`, `parentOf(pid)`, `childrenOf(pid)`: libproc `proc_listchildpids`, `nameOf(pid)`: `proc_name`), `binding.gyp`, `index.js` / `.d.ts`; local dependency `tie-peer`.
- `bin/tie`: product CLI. `bin/tie-dev`: dev toolkit.
- `dev/` (`HARNESS.md`):
  - `lib.mjs`: `launch` (fresh instance; `restart` option: same instance, files kept), `uiStatePath`, `connectPage` (CDP), `tie` / `tieAt` / `tieRaw`, `rpc` (socket), `quitInstance`, `leftovers` (per-instance pty leak check).
  - `helpers.mjs`: scenario helpers (`h`; table in `HARNESS.md`), check counter `checkCount`.
  - `drive.mjs`: scenario runner (`checks=N`, fails at 0; leak check; `ctx.restart()`: same instance again). `e2e.mjs`: `test --e2e` (parallel, selection, leak total, `--strict-leaks`).
  - `scenarios/*.mjs`: e2e, named by feature, one glob each: `layout-*`, `keys*`, `tabs*`, `shelf*`, `templates`, `viewer-*`, `content-*`, `markdown*`, `html*`, `browser*`, `cwd-*`, `terminal*`, `cli*`, `settings*`, `picker*`, `sec-*`; plus `close-busy`, `engine` (engine assumption probes, `ENGINE.md`), `lifecycle`, `menu`, `ping`, `quit`.
  - `viewers.mjs` (+ `viewers.d.mts`): viewer build, `--watch` for hot mode. `mdpage.mjs`: standalone markdown page. `samples/`: viewer fixtures (`markdown.md`).
  - `frames.mjs`, `layout.mjs`, `screenshot.mjs`: `tie-dev frames | layout | screenshot`. `ptydump.sh`: pty wedge snapshot.
  - `package-check.mjs` (fuses + smoke), `install-check.sh` (`tie-dev check-install`), `electron-check.mjs`.
  - `brand-electron.sh` (postinstall: dev Electron named Tie), `icon.cjs` (placeholder icon).
- `electron-builder.yml`, `resources/bin/tie` (CLI launcher), `build/` (icon): packaging. `electron.vite.config.ts`: build.
- `patches/`: `patch-package` patches applied at install (`node-pty`: disclaimed spawn).

## Model

- `S.spaces` (tab order), `S.visible` (shown), `S.current` (ops target; differs only inside `withSpace`).
- Per-space fields, accessed on `S` (accessors onto `S.current`):
  - `tree`: `Leaf {id}` | `Split {dir: 'row'|'col', children, sizes}` (fractions). Normalized. Null when empty.
  - `floats: {id, x, y, w, h}[]`: board-relative px, last = topmost.
  - `shelf: id[]`. `collapsed: Set`, `zoomed`, `active`, `mru`, `pinned` (reveal pinned), `revealed` (hovered), `selected: Set` (shelf selection, cmd+click; non-empty: nothing active; `SHELF.md` "Selection").
- `Space` also: `id` (`s` + 6 random chars, `@core/ids`), `customTitle`, `customIcon`.
- Window chrome (`LAYOUT.md` "Bars"): `#titlebar` (traffic lights only; none when borderless), then bars `#bar-top|bottom|left|right` (`.group.start`, `.bar-space`, `.group.end`; empty: hidden). Components placed by the `bars` setting: tabs = `#brand` + `#tabs` (`#tab-list` scroller + `#tab-add`), shelf = `#shelf` (one `.item` per `S.shelf` entry, `shelfRect()` = its DOM box), templates = `#templates`. The shelf is a concept located in a bar, not a layout region. Left / right bars (`.bar.v`): everything along y; shelf and templates take a form by the bar's width (narrow: scaled icons; list: icon + title; `.narrow` from JS, `SHELF.md` "Forms").
- Bar sizes (`LAYOUT.md` "Bar sizes"): per bar, stored (`renderer/barsize.ts`; main's UI state file `<instance>.ui.json`, not settings) and shown (window limits). Top / bottom 32..60 (40), content × `--k`; left / right 48..30% of the window (160), narrow form's shelf / templates × `--kn`.
- New spaces get a terminal (`newTab({empty})`: none); a space emptied by `closeTile` / `moveToSpace` drops itself (empty-space hook registered by `initTabs`) unless it is the only one; never zero spaces (`TABS.md`).
- `S.tiles: Map<id, Tile>` (all spaces). `S.rects`: last rendered rects (visible space, window coords). `S.cwd`: app cwd (tiles from nothing: boot, new tab).
- A tile is in exactly one of tree / floats / shelf of one space (`location(id)`, `spaceOf(id)`).
- `Tile` (common to all kinds):
  - `id` (`t` + 6 random chars, never reused: `@core/ids`), `kind` (`'terminal'`, `'markdown'`, `'text'`, `'image'`, `'hex'`, `'html'`, `'browser'`, dev `'probe'`), `customTitle`, `customIcon` (user text).
  - `cwd`: context directory, always set (`DIRECTORIES.md`): inherited at open (`contextOf`), terminals follow `cd`; never a frame root.
  - `exit` (code or null), `error` (start error).
  - `activity` (unseen output, shelved), `pinged` (`tie ping`).
  - `el`, `body`, `surface`.
- `Surface` (kind side, `kinds/index.ts`): `mount`, `resize`, `dispose`, `focus`, `title`, `icon` (→ `Glyph` key); optional `tip` (title tooltip), `cwdNow` (fresh cwd read: terminal), `paste`, `drop`, `appearance`, `info`, `busy` (→ `{what}` or null: terminals, `TERMINALS.md`), `unload` (→ may close: browser beforeunload), `nav` (`{state() → {location, back, forward, editable}, back, forward, reload, go?}`), `zoom` (`dir` 1 / -1 / 0: html, browser, markdown, text; `@core/zoom` steps), `pills` (`{label, title, on, toggle?, color?, gravity?}[]`: title-bar states, html "Scripts blocked", file kinds "Missing").
- `Icon` (`icons.ts`): `{glyph: Glyph}` (built-in SVG, `GLYPH` key) | `{text}` (custom icon, escaped). `displayIcon(t)` → `Icon`; `iconHtml(icon)` renders it (title bar, shelf, tabs, ghost).
- `KindSpec`: `kind`, `factory`, `opens` (`'bare'|'file'|'url'`). Shelf templates: `TEMPLATES` (`{id: 'terminal'|'file'|'browser', label, icon: Glyph}`). `OpenOpts`: `title`, `icon`, `cwd` (absent: context tile's), `root` (`--root`: file kinds, dev probe), `cmd`, `path`, `url`, `hash`, `id` (dev: `tie add --id`).
- `ContentPolicy` (`core/policy.ts`, per content kind): `page` (`viewer`|`document`), `sandbox`, `styles` (`nonce`|`inline`), `nav` (`viewer-exact`|`within-root`), `assets`, `payload` (`text`|`bytes`|`none`), `maxBytes`, `bootstrap`, `dev`.
- `Host` (given to a kind): `id`, `body`, `alive`, `changed`, `cwd` / `setCwd` (tile cwd), `activity`, `exit`, `error`, `close`, `hint` (link strip text, bottom-left).
- Terminal state (kind-private, `TERMINALS.md`): `term`, `fit`, `pty` (= pid), `ptySize`, `oscTitle`, `proc`, `cmd` (cwd: the tile's).
- Browser state (private, `guest.ts`): `wv` (the `<webview>`), `url`, `title`, `loading`, `ready` (dom-ready), `gid` (guest webContents id). Rules: `core/guest.ts`. Main: `guests` (live guest webContents).
- File view state (private, `fileview.ts`): `doc {id, path, rev, text?, bytes?, missing}` (payload per policy), `history {list, index}`, `root` (frame root, `DIRECTORIES.md` 5). Main: `docs` (id → path, watcher).

## Patterns

- Mutate only through `ops.ts`; ops end in `render()`, which always renders `S.visible`. Other space: `withSpace(id, fn)`.
- Closing on the user's behalf: `requestCloseTile` / `requestCloseGroup` / `requestCloseTab` (`close.ts`: asks if busy); scripted (`tie close`, exits): `closeTile`.
- Async work on a tile (spawn, drop, menu action) re-checks `S.tiles.has(id)` (kinds: `host.alive()`): it may have closed.
- UI code never reaches into a kind's state: only through `Surface`.
- `refocus()` after closing any modal/menu: keys to the active tile, or blur.
- Tile elements never re-parent (xterm stays mounted); absolute window coords.
- Keyed DOM reconcile where an element may hold pointer capture or hover (borders, shelf items, tabs).
- Drags use `track()`. Pointer capture retargets native `click`/`dblclick`: title clicks come via `startDrag`'s `onClick`.
- Tile metadata changes fire DOM event `tile-meta`; shelf and tabs listen.
- Bar components: axis from their bar (`verticalComponent(c)`); scrolling lists through `overflow.ts`, never a per-axis copy.
- Spacing: CSS vars, `readGeometry()` (`LAYOUT.md`); board layout options `layoutOpts()` (`state.ts`: render, drop previews, group insertion). Colors: `color-mix` of base tokens, never hardcoded (`SETTINGS.md`).
- Menus and dialogs are HTML (Playwright-drivable).
- Failures stay visible: tiles that can't start show `showError`; invalid settings block Save; a settings file that doesn't load raises a dialog at start (Tie on defaults, file untouched).
- Settings file: read at start only, never auto-reloaded (edits: panel banner, Ignore / Reload); written only by explicit user actions (Save, Recreate) (`SETTINGS.md` "File").
- UI state (bar sizes): main's `uistate.ts` only, written at an action's end (a resize released), never during a drag; payload cleaned in main (`@core/barsize`); a bad file = defaults, no dialog. Sizes in a bar's CSS: × `--k` (text × `--kt`), never a fixed px a scaled bar would outgrow.
- Never throw inside node-pty callbacks (aborts the process). Calls into node-pty from IPC (`write`, `resize`, `kill`) are caught in `main/pty.ts`.
- Uncaught exceptions / rejections in main: logged `[error]` (always on) with the stack; dialog except in background instances. The scenario runner fails any run whose `app.log` has an `[error]` line: read it there, never wait for a dialog.
- Browser tiles: only via `browserKind` + main `attachGuest`/`guardGuest`; URL rules only in `core/guest.ts`.
- Content kinds: only via `frameSurface` (`TILES.md`); what may differ per kind only in `core/policy.ts`; new frame verbs in `core/requests.ts` (`gesture` for anything acting for the user). Viewer colors from the host's theme message, set via CSSOM.
- New content kind = policy row + `KindSpec` + viewer pipeline (on `runtime.ts`); file kinds: + `FILE_KINDS` / extensions (`core/kinds.ts`) + `fileKind(kind, glyph, zoom?)` in `kinds/index.ts`.
- Files: main decides (`fileViewer`, reads, writes); the renderer only names paths.
- Security (`SECURITY.md`): IPC via `ipc.on|handle`; URLs out via `renderer/external.ts` → main `openExternal`; text into terminals via `pasteInto`; content never in the UI realm; socket callers by kernel lineage (`@core/callers`), never `TIE_TILE`; every guard has a `sec-*` scenario; security code gets a `// SECURITY:` comment.
- Logs: `debug(tag, ...)` (renderer), `log(tag, ...)` (main), enabled by `TIE_DEBUG`; `security`, `update` and `error` always on. Any logged value that isn't Tie's own text (URL, href, path, name, request body, socket params): wrap with `untrusted(v)` (`@core/log`) → `<untrusted>…</untrusted>`, escaped.
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
  test --e2e [--jobs N] [--strict-leaks] [names|globs...]
                           Scenarios on fresh instances, N at a time (default 4, TIE_JOBS); names or globs
                           (e.g. 'sec-*' shelf* cli-replace) select, none = all; --strict-leaks: leaked
                           ptys fail the run (release)
  typecheck                tsc --noEmit
  layout                   ASCII render of the board
  frames                   Window frame tree: url, origin, pid, out-of-process (content frames)
  screenshot [file]        PNG of current state (default tmp/shots/current.png)
  sample [name]            Open dev/samples/<name>.md (default markdown) in the instance: style iteration fixture
  mdpage [--theme NAME] [--sample NAME] [--out FILE] [--open]
                           Sample as a standalone HTML page (720 px tile, Tie palette, change marks) for devtools CSS
                           tinkering (default tmp/mdpage/<sample>-<theme>.html, PNG beside); fresh instance
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
  install [--restart]      Package, then install to /Applications/Tie.app (TIE_INSTALL_DIR overrides); while it runs:
                           staged, swapped in at its next launch; --restart: quit it (its question), install, open
  check-install            Install while running, end to end in a tmp sandbox (never /Applications, ~/.config/tie):
                           stage, swap at launch, --restart, non-target and incomplete stages
  icon                     Re-render placeholder icon (build/icon.png, build/icon.icns)

Instance: --instance NAME (or =NAME, anywhere) or TIE_INSTANCE (default "dev"; the installed app is "default"). Inside a Tie
terminal TIE_INSTANCE is the host's and is ignored; run/start refuse "default" unless --instance says so. Each instance has its own
socket, lock, debug port, log under ~/.config/tie/.
```

- `tie --help`: `list`, `add` (file, URL, `terminal`, `browser`; `--cmd`, `--cwd`, `--root`, `--title`, `--icon`, placement `--at`/`--side`, `--float`, `--shelved`, `--tab`, `--focus`), `replace` (as `add`, takes the calling terminal's place), `close`, `move` (placement, `--tab`, `--swap`), `focus`, `ping`, `set` (`--title`, `--icon`); tile commands act on the caller, `--tile <id>` for another; aliases `l a r c m f s p`. Unlisted, dev builds only: `state` (internal dump), `frames`, `add probe [--root D]`, `add --id`. See `docs/CLI.md`.
- Ad-hoc scenario: `tie-dev drive - <<'EOF' ... EOF` (`docs/HARNESS.md`).
