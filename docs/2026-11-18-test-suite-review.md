# Test suite review

Status: waves 1-3 applied 2026-11-18 (review, scenario fixes, harness, merges / renames). Wave 4 (product side) open.

# Topic

Improve the suite: drop stale / vacuous cases, merge what gains nothing apart, names that glob by feature, add missing coverage.

# Method

- 5 read-only reviewers, one per area. Findings below: from reading code, not from runs, unless noted.
- Then one plan, applied by sub-agents, one commit per change.
- IDs: area letter + reviewer's id (L = layout / keys, S = shelf / tabs, C = content viewers, X = security / browser, H = CLI / settings / harness).

# Findings

## L: board layout, keys

Cannot fail / loose.

- L-R1 `collapse-zoom:86-88`: `waitText(...).catch()` always burns its 4 s (keys go nowhere: `refocus` blurs on a collapsed active tile). Assert focus instead.
- L-V1 `swap:41-47`: accepts any tile but c; assert `active === b` (MRU).
- L-V2 `splits:10`: passes if b lands above a; assert leaves order.
- L-V3 `lifecycle:41-42`: only "no page errors"; assert tree, preview / ghost hidden.
- L-V4 `swap:49-60`: cmd+S on pinned only checks slotted; assert beside b.
- L-V5 `collapse-zoom:96-98`: precondition (lone collapsed) not asserted.
- L-V6 `window-layout:67-68`: reads back what the panel saved; dup of `settings:97`.

Stale comments: `float:14`, `splits:1` + `helpers:26` ("triangle"), `menu:1,20-21` (shelf part asserts nothing), `keys:37`.

Flake.

- L-R2: `ctx.tie('state')` (process per call) inside wait loops, many scenarios; use `h.state`.
- L-R3 `keys:31,42`, `keys-bindings:17,27`, `swap:24`: 250 ms absence sleeps can pass before the key arrives; follow with a key that acts, assert count +1.
- L-R4 `keys:44`: no wait for `.settings` detached.

Merge.

- L-M1 `splits` → `center-swap` (as `layout-drop`).
- L-M2 `menu:23-30`: dup of `close-busy:29-41`; delete.
- L-M3 `window-layout:60-65` vs `settings:89-97` (borderless): keep one.

Rename: `borders` → `layout-borders`, `center-swap` → `layout-drop`, `center-displace` → `layout-displace`, `collapse-zoom` → `layout-collapse-zoom`, `float` → `layout-float`, `window-layout` → `layout-geometry`, `swap` → `keys-swap`. Keep `keys`, `keys-bindings`, `lifecycle`, `menu`, `ping`.

Gaps (by risk).

- L-G1 cmd+D on an empty board (the hint's recovery path).
- L-G2 floating zoom; ended by activating a board tile.
- L-G3 float clamp on window shrink, 200×120 minimum.
- L-G4 collapsed float. L-G5 single drop on a squashed bar = swap. L-G6 target closed mid-drag.
- L-G7 menu: reset title & icon, empty rename, rename from shelf item, Escape / outside close.
- L-G8 ping cleared by tab switch. L-G9 zooming a collapsed tile. L-G10 swap up / down.

Unit.

- L-U1 `keys.ts:156-181` `neighbor()` → core, unit tests (ranking rules).
- L-U2 `compute` border `length` / `path`, `resize` nested / gaps / collapsed: round-trip test.
- L-U3 `clampFloat` / `defaultFloatRect` → core.
- L-U4 `main/keys.ts:47-66` `onInput` decision table → pure `decide`, unit-tested (security-relevant).
- L-U5 `insertGroup` with zoomed / collapsed. L-U6 `layout.test:470`: assert where g1 lands.
- L-U7 `zoom.ts:10`: `zoomStep(6, ±1)` returns 0.25 (latent, unreachable today). L-U8 `keymap.test`: two `describe('chord')`; `chordsOf` untested.

## S: shelf, tabs, close / quit

Cannot fail / loose.

- S-V1 `tabs:130-132`: "shelf-only tab title" never reaches the shelf branch (t3 still slotted).
- S-V2 `tabs:166-167`: `tiles.length > 0` always true.
- S-V3 `shelf-select:177-183`: tab-switch de-select masked by `tie focus` (activate clears anyway).
- S-V4 `tab-drops:64-68`: own-tab drop checks membership only. S-V5 `shelf-select:117-119`. S-V6 `shelf:20` (null passes). S-V7 `template:9`. S-V8 `toolbar-overflow:67`.

Stale: `template:1`, `close-busy:92`, `quit:2` (pty kill claimed, not asserted), `tabs:55`, helper `pin` (also unpins; → `clickShelf`), `HARNESS.md:87` (lacks `selectShelf` / `selected`), `TABS.md:42` (title rule 3 not in code).

Merge.

- S-M1 `quit-empty` → `quit` (prelude). Ref: `dev/drive.mjs:85`.
- S-M2 `toolbar-overflow` + `tab-autoscroll` → `tabs-overflow` (one tab loop).
- S-M3 `shelf:21-41` → covered by `shelf-reveal`; keep the item-click pin assert there.
- S-M4 `tabs:78-85` dup of 134-145. S-M5 `tabs:55-66` → `cli-tabs`. S-M6 `shelf-select:151-155` dup of `shelf-select-drag:158-164`. S-M7 `tabs:94-101` dup of `close-busy:24-27`.

Rename: `tab-drops` → `tabs-drops`, `template` → `templates`, (optional) `close-busy` → `close` (`SECURITY.md:90` cites it).

Gaps (by risk).

- S-G1 closing the only tab → fresh space + terminal.
- S-G2 busy tab close confirmed. S-G3 quit kills ptys (assert pids gone). S-G4 × on a hidden tab.
- S-G5 reveal / pin never resizes the pty. S-G6 strip reorder to the right.
- S-G7 `tie add` (no `--focus`) keeps a selection. S-G8 unpin by close / drag to board. S-G9 last item toggled out → `focusNext`.
- S-G10 activity cleared by hover, exit mark. S-G11 cmd+T from a non-last tab. S-G12 tab close with beforeunload page. S-G13 wheel → `scrollLeft`. S-G14 `tie focus` on a shelved tile of another tab. S-G15 quit list, one tab.

Unit: S-U1 shelf drop slot / index math (`drag.ts:97-108`) → core.

Flake: S-F1 `tabs:160` (`sleep 1; tie close` can land while the tab is visible: false pass). S-F2 `close-busy:74-79` (`sleep 2` window). S-F3 `tab-drops:83,107` nested retries.

## C: content viewers

`html` failure: stale scenario, product fine (high confidence, from reading). Since `e404f87` (content roots) the root is the tile cwd; `html.mjs:36` opens without `--cwd` → root = repo → no "other folder" dialog. Fix: `--cwd dir` (as `markdown-links:25`).

Cannot fail / loose.

- C-V1 `markdown-links:138-142`: "cmd+[ on a terminal" has nothing to go back to.
- C-V2 `text:55,59`: `rev0` taken from the wrong tile's view.
- C-V3 `watch.test:125-139`: "re-armed" satisfied by the 200 ms poll alone.
- C-V4 `html:133-134`: base taken before the first write. C-V5 `html-static:37-39`: no proof the click landed.

Stale: `SECURITY.md:42` (`html-scripts` → `html-static`), `hex:3`, `image:2-3`, `markdown-open:3,54`, `requests.test:40,63`, `AGENTS.md:65` + `MARKDOWN.md:14` (`extsOf`, `noViewer` removed).

Merge / trim.

- C-M1 `html:143-149` dup of `sec-storage:114-117`. C-M2 `html:106-118` dup of `sec-html:201-217`. C-M3 `markdown-open:82-88` dup of `sec-drop:43-53`.
- C-M4 `image:60-64`, `hex:62-67`: template + picker, same path as `markdown-open:90-99`.
- C-M5 `markdown-keys` → `markdown-nav`. C-M6 `markdown-links:70-77`. C-M7 `markdown:58-70`: keep one writer (others in `watch.test`). C-M8 (optional) `frame-input` → `content-paint`.

Rename: `markdown-open` → `viewer-open`, `text` / `image` / `hex` → `viewer-text` / `-image` / `-hex`, `frame-input` → `content-input`. Refs: `SECURITY.md:61,87`, `VIEWERS.md:73`, `HARNESS.md:64`.

Gaps (by risk).

- C-G1 html "Page crashed". C-G2 html root-absolute / own-origin links. C-G3 html new-tile throttle. C-G4 back / forward scroll restore.
- C-G5 `watch`: growth past `maxBytes`. C-G6 hex scroll mapping above `MAX_PX` (→ core + unit). C-G7 viewer pure logic (`langOf`, `visible` / `markControls`, `splitLines`, `slug`, `localImage`) → modules + unit.
- C-G8 `FLOOD_MAX`. C-G9 "Content did not load" (needs a probe hook). C-G10 image mode kept on change. C-G11 reload of a missing file.

Flake: C-F1 `content-watchdog:68` (`!alive(pb)` not waited). C-F2 reads right after `clickIn` (unconfirmed). C-F3 latency < 250 ms under load.

Unit: C-U1 `requests.test:61` hand-written verb list (omits `scrolled`). C-U2 `scrolled` upper bound.

## X: security, browser

Cross-cutting: probes listen on 127.0.0.1; the UI session sends everything (loopback included) through a dead proxy (`main/security.ts:100`). So `h.assertUntouched` in UI-session scenarios can never see a hit: it re-checks `noNetwork` only, never the guard the case is named for.

Guard not verified by its case (removing the guard keeps it green; from reading, no mutation run).

- X-U1 `sec-navigate:18-23`: `window.open` / `_blank` deny (`security.ts:68`). Assert the `blocked window.open` log + page count.
- X-U2 `assertUntouched` (10 scenarios): noNetwork layer only. Each case needs its guard's own signal.
- X-U3 `sec-content-escape:53-67`: viewer CSP to the network: probe-only. Require CSP violations (as `sec-html`).
- X-U4 `sec-content-escape:38-51`: frame popups: probe-only. Assert `window.open` returns null, no new page.
- X-U5 `sec-browser:81-82`: guest subframe nav guard: `location.href` throws for any cross-origin frame. Assert the log / frame URLs.
- X-U6 `sec-browser:110-111`: webSecurity: fetch to a closed port fails anyway. Fetch a second `h.site`; same-origin control.
- X-U7 `sec-browser:64-69`: redirect guard, no assertion (reachability unconfirmed). X-U8 `:164-171`: `blocked popup` branch never reached; mailto check can't fail.
- X-U9 `sec-html:44,69-71`: "bootstrap port invisible": the counter is set by a page script that never runs. Relabel; fix `SECURITY.md:40` mutation claim.
- X-U10 `sec-keys:23-24`: frame half has no positive control. X-U11 `sec-navigate:11-17` (likely real, unconfirmed). X-U12 `:24-26`: "no pty kill on a blocked navigation" not checked.
- X-U13 `sec-content-protocol:24`: `..` forms normalized by the URL parser (404 before the check); two containment layers, either removable. Assert per-layer log.
- X-U14 `sec-protocol:9,16`: refused by the UI CSP before the host check. X-U15 `sec-browser:124-134`: tests Electron, not Tie's embedder check. X-U16, X-U18: doc wording. X-U17 `sec-mermaid:92-94`: require `img-src` violations.

Guards with no test.

- X-T1 `FLOOD_MAX` (`frame.ts:117`). X-T2 UI-session `noDownloads` (`SECURITY.md:73` overclaims). X-T3 guest link strip. X-T4 capture mode vs guest keys.
- X-T5 beforeunload: one prompt at a time, 3 s no answer, tab close. X-T6 `confirmExternal=false` (new `sec-links-off`). X-T7 user agent without `Electron/`.
- X-T8 UI `will-redirect` unreachable (doc). X-T9 rules "IPC only via `uiIpc`", "`shell.openExternal` only in security.ts": unit test grepping `src/`.
- X-T10 check: every scenario named in the `SECURITY.md` Test column exists. X-T11 log / settings file modes. X-T12 viewer middle click. X-T13 device choosers (leave). X-T14 Save disabled 600 ms.

Stale: `SECURITY.md:40,42` (`html-scripts`), `sec-browser:4-5` header, `security.test:4` (`file://` UI URL; now `tie://app`), `sec-content-escape:102` (repeat), `sec-state:18,22` (dead), `BROWSER.md:65`.

Merge / split: X-M3 split `sec-browser` (250 lines, ~12 guards; an early mic-permission hang hides the rest) → `sec-browser-nav` / `-popups` / `-session`. Optional: `sec-state` → `sec-socket` (or rename `sec-socket-state`).

Flake: X-F1 `sec-socket:12-13` (`sleep 1.5` races `tie focus`). X-F2 `browser-unload:21-27` (fixed 200 ms for the click). X-F3 `browser:197` (4th navigating Enter via CDP). X-F4 `sec-keys-capture:32-34`. X-F6 `sec-disclaim:8` (python3).

Product gaps found (unit + code).

- X-N1 `core/guest.ts:77-87` `downloadName` (and `pageTitle`): bidi / format chars (U+202E…) and C1 controls not stripped: extension spoof in the Save dialog.
- X-N2 `core/log.ts:22` `escapeUntrusted`: bidi controls not escaped.
- X-N3 `sameDocument` untested. X-N4 `externalUrl` cases. X-N5 guest URL cases (`about:blank#x`, userinfo; dialog tail possibly garbled, unconfirmed). X-N6..N8 low.

Verified real (reviewer's reading): `sec-csp`, `sec-html` (CSP, WebRTC listeners, tokens, gesture rule), `sec-socket-external`, `sec-storage`, `sec-walk`, `sec-paste`, `sec-focus`, `sec-log`, `sec-markdown`, `sec-links`, `sec-viewers` caps, `sec-content-nav`, most of `sec-browser`.

## H: CLI, directories, terminals, settings, picker, harness

Cannot fail / loose.

- H-V1 `cli:102-114`: `threeWaySplit(...).catch()` + `if (fb)`: the only `tie focus` (tab switch, expand collapsed) coverage can skip silently.
- H-V2 `terminal:13-17`: "login shell used" only logs. Real check: process argv starts with `<login shell> -l -i -c` (in `settings-boot`, `env SHELL=/bin/sh`).
- H-V3 `cwd-inherit:10-19`: "fresh read" passes ~10-20 % of runs with `cwdNow` broken (2 s poll races). Assert the polled cwd is still old before cmd+D.
- H-V4 `settings-invalid:10`: `rows > 10` display-dependent; `cellWidth`, `theme` seeded, never asserted. Assert CSS vars.
- H-V5 `boot-settings:2`: `lineHeight`, `cellWidth` seeded, never asserted. H-V6 `settings:26`: line height 1.3 never asserted; `53-57` shot only.
- H-V7 `picker:144`, `root-cwd:42`: repeat the preceding wait.

Stale: `terminal:27` (claims a "settings change" size check that never existed: add `assertPtySizes` after the font save in `settings`), `settings:23`, `cli-tabs:71` (no-op press), `cwd-inherit:16`.

Merge.

- H-M1 `boot-settings` + `settings-invalid` → `settings-boot` (sanitize is per field; one seeded file holds valid + invalid). `settings-malformed` stays (raw string seed).
- H-M2 `cwd-inherit` → `cwd-split` (split part) + `cwd-templates` (template part).
- H-M3 `cli-focus` → `cli-tabs`. H-M4 (optional) `terminal-fit` → `terminal`.

Rename: `root-cwd` → `cwd-roots` (refs: `DIRECTORIES.md:66`, `SECURITY.md:55,56`, `sec-markdown:46`, `markdown-links:25,52`), `shell-errors` → `terminal-errors`. Never touch `src/core/picker.test.ts` fixture paths (rank expectations depend on them).

Gaps (by risk).

- H-G1 tiles from nothing (cmd+T, `+`) use `S.cwd`, not the active tile's cwd.
- H-G2 CLI default placement (bare `tie add`: beside active, side by longer axis).
- H-G3 terminal env (`TERM`, `COLORTERM`, `TERM_PROGRAM`, `TIE_TILE`, `bin/` on PATH).
- H-G4 fixing a malformed file unblocks Save.
- H-G5 unit: `sanitize` / `parseCommand` / `validateSettings` → `src/core/settings.ts` + tests (`allowExternalControl: "true"` → false; `num()` accepts `'14'`; `fontSize: 0` → 12 not 8).
- H-G6 unit: `bin/tie` parse errors as a subprocess (no refactor).
- H-G7 `move needs --at`, `not on board`. H-G8 exit marks (`[process exited…]`, `✓` / `✗ N`). H-G9 picker: row click, backdrop cancel, `…` cancel, `~` line. H-G10, H-G11 low.

Flake.

- H-F1 `settings:32,45`: needs `MesloLGS Nerd Font Mono` installed: fails on other machines. Use a bundled macOS font.
- H-F2 `cwd-inherit:13`, `terminal-fit:7`: type before `waitShell`. H-F3 `terminal:2`: `shell: ''` runs all its terminals under the user's login shell (rc output, slow prompts). H-F4 `settings:34-38` (unconfirmed).

Rule check, whole suite: 72 `ctx.sleep`, all commented. No shortcut via `ctx.page.keyboard`.

Harness.

- H-H1 `helpers:335` `waitFor` swallows exceptions and the last value: timeout says only `timed out: <what>`. Keep last error / value in the message.
- H-H2 `tieIn` copied in ~9 files → `ctx.tieAt(dir, …)`. H-H3 "expect tie error" ×10 → `h.tieError`. H-H4 open settings ×10 → `h.openSettings`. H-H5 `shows` ×6 → `h.waitMd`. H-H6 `.xterm-rows` reads → `h.lines` (also step 3 of the block-glyphs record).
- H-H7 pty leaks never fail anything (`ok … (ptys +N)`); add to summary, fail in release.
- H-H8 `probeFrame` duplicates `contentFrame`; frame finders count iterations, not time.
- H-H9 `eventually(assertPtySizes)` ×11: nested retries. H-H10 `waitShell` no fail-fast on tile error.
- H-H11 `settings-bindings` `settle` 300 ms ×8, `sec-keys-capture`: expose main's suspend level on a dev socket method, wait on it.
- H-H12 `HARNESS.md` helper table lacks `waitTermFit`, `selectShelf`, `selected`. H-H13 no wall-clock kill per scenario. H-H14 no guard for a scenario that checks nothing (count checks, fail at 0).

Selection: renames recommended; tags not worth the upkeep; optional `test --e2e --grep <text>` (scenarios whose source contains it) for cross-cutting runs.

# Pending

1. Extractions to core for unit tests (L-U1, L-U3, L-U4, S-U1, C-G6, C-G7): product code moves; which are worth it.

# Settled

- Renames over tags: one glob selects one feature (`test --e2e 'layout-*'`); tags not worth the upkeep.
- Scenarios after wave 3 (87), by glob:
  - `layout-*`: `layout-borders`, `layout-collapse-zoom`, `layout-displace`, `layout-drop`, `layout-float`, `layout-geometry`.
  - `keys*`: `keys`, `keys-bindings`, `keys-swap`.
  - `tabs*`: `tabs`, `tabs-drops`, `tabs-overflow`. `templates`.
  - `shelf*`: `shelf`, `shelf-reveal`, `shelf-select`, `shelf-select-actions`, `shelf-select-close-browser`, `shelf-select-drag`.
  - Board / app: `lifecycle`, `menu`, `ping`, `close-busy`, `quit`.
  - `terminal*`: `terminal`, `terminal-errors`, `terminal-fit`.
  - `cwd-*`: `cwd-links`, `cwd-roots`, `cwd-split`, `cwd-templates`.
  - `viewer-*`: `viewer-hex`, `viewer-image`, `viewer-open`, `viewer-reload`, `viewer-text`.
  - `content-*`: `content-input`, `content-paint`, `content-watchdog`.
  - `markdown*`: `markdown`, `markdown-links`, `markdown-live`, `markdown-mermaid`, `markdown-nav`, `markdown-syntax`.
  - `html*`: `html`, `html-static`. `browser*`: `browser`, `browser-unload`.
  - `cli*`: `cli`, `cli-replace`, `cli-tabs`.
  - `settings*`: `settings`, `settings-bindings`, `settings-boot`, `settings-malformed`.
  - `picker*`: `picker`, `picker-partial`.
  - `sec-*` (29): `sec-browser-nav`, `sec-browser-popups`, `sec-browser-session`, `sec-content-escape`, `sec-content-nav`, `sec-content-protocol`, `sec-csp`, `sec-disclaim`, `sec-drop`, `sec-focus`, `sec-html`, `sec-keys`, `sec-keys-capture`, `sec-links`, `sec-links-off`, `sec-log`, `sec-markdown`, `sec-mermaid`, `sec-navigate`, `sec-paste`, `sec-paste-off`, `sec-permissions`, `sec-protocol`, `sec-socket`, `sec-socket-external`, `sec-state`, `sec-storage`, `sec-viewers`, `sec-walk`.

# Plan

Rule for parallel work: one shared tree and one `out/` build. Wave 1 agents change `dev/scenarios/` and unit tests only (no `src/`, no shared harness files), commit by path.

## Wave 1: make checks real, fix flakes, add scenario-only coverage (5 agents, by area): done

1. Checks that cannot fail → real assertions (all `*-V*`, `X-U*`).
2. Flakes (`*-F*`, `L-R*`), stale comments.
3. `html`: `--cwd dir`.
4. Gaps that need scenario code only, high / medium first.
5. Unit cases for existing pure functions.

## Wave 2: harness (one agent): done

1. `waitFor` keeps last error / value (H-H1): done first, before wave 1.
2. Helpers: `tieAt`, `tieError`, `openSettings`, `waitMd`, `lines`; `pin` → `clickShelf`; `assertPtySizes` direct; `waitShell` fail-fast; `probeFrame` into `contentFrame`.
3. Leaks in the summary, failing in release (H-H7). Check count guard (H-H14).
4. `HARNESS.md` helper table.

## Wave 3: merges, removals, renames (one agent, after the author's look): done

Doc references updated; `SECURITY.md` stale rows; X-T10 check.

Notes.

- Merged: `splits` → `layout-drop` (edge drops first; one own-tile case: `drag.ts` refuses any own-tile zone alike).
- Merged: `quit-empty` → `quit` (no-tiles prelude, Esc; the final Quit by Enter keeps "Enter quits").
- Merged: `toolbar-overflow` + `tab-autoscroll` → `tabs-overflow` (one `openTabs(extra)` loop, called twice; shelved tiles closed before auto-scroll: case b needs the first tab to empty).
- Merged: `markdown-keys` → `markdown-nav` (now `hiddenWindow`).
- Merged: `boot-settings` + `settings-invalid` → `settings-boot`: valid theme / font / cellWidth / borderless; `fontSize` 200 (clamped, 32 px), `lineHeight` `'tall'` (wrong type number → default), `shell` 5 (wrong type string → '' → login shell argv). Lost: a valid non-default line height applied at boot (panel save path: `settings` 1.3), theme wrong type (same `str` branch as shell).
- Split: `cwd-inherit` → `cwd-split` (cmd+D) + `cwd-templates` (template drop); its poll-race proof moved verbatim into `h.openFresh` (helpers).
- Merged: `cli-focus` → `cli-tabs` (prelude). S-M5: the hidden-tab case moved as `add --at` + `move --tile` in a hidden tab (a `move --tile` across tabs is an error by design: the tile's own tab is the target space).
- Removed duplicates: L-M2 (`menu` busy dialog), L-M3 / L-V6 (`settings` borderless; `layout-geometry` kept: pty sizes), S-M3 (`shelf` reveal / typing / outside click; item-click pin kept), S-M4, S-M7 (`tabs`), S-M6 (`shelf-select`), C-M1 (`html` storage; reopen kept for the crash case), C-M2 (`html` web confirm: same `followLink` → `openExternal` path as `sec-html`), C-M3 (`viewer-open` terminal drop; `sec-drop` gained "no tile opened"), C-M4 (`viewer-image`, `viewer-hex` template + picker: main's `doc.viewer` decides as for `tie add`; empty file → text kept), C-M6 (`markdown-links` PageDown), C-M7 (`markdown`: one writer, backup rename).
- Split: `sec-browser` → `sec-browser-nav`, `-popups`, `-session` (each `hiddenWindow`; the mic prompt hang can only stop `-session`).
- Renamed: `borders`, `center-swap`, `center-displace`, `collapse-zoom`, `float`, `window-layout` → `layout-*`; `swap` → `keys-swap`; `tab-drops` → `tabs-drops`; `template` → `templates`; `markdown-open`, `text`, `image`, `hex` → `viewer-*`; `frame-input` → `content-input`; `root-cwd` → `cwd-roots`; `shell-errors` → `terminal-errors`.
- Docs: `SECURITY.md` Test column re-verified row by row; `BROWSER.md`, `VIEWERS.md`, `DIRECTORIES.md`, `HARNESS.md` scenario lists; `TABS.md` title rule 3 (not in `tabTitle`) dropped; `extsOf` / `noViewer` dropped from `AGENTS.md`, `MARKDOWN.md`.
- New unit file `src/core/docs.test.ts`: X-T10 (Test column names existing scenarios; fails on `html-scripts`-style drift), X-T9 (`ipcMain`, Electron `shell` only in `main/security.ts`).
- Skipped (optional): C-M8, H-M4. Not touched: `PENDING.md` (still names `markdown-keys`, `sec-browser`), `picker.test.ts` fixture paths.
- Full e2e after wave 3: 87/87 passed, 87 s, jobs 4, ptys leaked 0 (`out/log/runs/20261118-224558-e2e`). Unit 301 / 21 files, typecheck clean.

## Mutation runs (2026-11-18)

One mutation at a time in `src/`, the one scenario run (`test --e2e <name>`), then `git checkout`. Lines as before the mutation.

- X-U1 | `main/security.ts:70` window open handler `deny` → `allow` | `sec-navigate` | RED (`window.open returned [object Window]`)
- X-U11 | `main/security.ts:58` main frame always allowed | `sec-navigate` | RED (`timed out: log blocked navigation main …/location`)
- X-U11b | `main/security.ts:61` logged, `preventDefault` dropped | `sec-navigate` | RED (`location: shell left tie://app/index.html`)
- X-U12 | `main/index.ts:172` pty kill on `did-start-loading` (not `did-navigate`) | `sec-navigate` | RED (`a blocked navigation killed the ptys`)
- X-U3 | `core/policy.ts:89` viewer CSP + `connect-src *` | `sec-content-escape` | RED (`viewer CSP refused connect-src …/fetch`)
- X-U3 | `core/policy.ts:89` `img-src <token> *` | `sec-content-escape` | RED (`viewer CSP refused img-src …/img`)
- X-U4 | `renderer/frame.ts:222` sandbox + `allow-popups` | `sec-content-escape` | RED (`refused in the frame: main never asked`; `window.open` still null: main's deny)
- X-U4b | `renderer/frame.ts:222` sandbox + `allow-top-navigation` | `sec-content-escape` | RED (`sandbox refuses top navigation / popups: {"top":"no throw"}`)
- X-U5 | `main/guest.ts:143` subframes always allowed | `sec-browser-nav` | RED (`timed out: log blocked guest navigation subframe tie://app`; log only: the browser partition can't load tie: anyway)
- X-U6 | `main/guest.ts:47` `webSecurity: false` | `sec-browser-nav` | RED, first at `navigation to chrome://gpu refused`, then (ad-hoc copy without it) `local reads from the guest` (file:///etc/hosts read), then (without that) `web security on (no cross-origin read)`
- X-U8 | `core/guest.ts:73` `popupUrl` lets about:blank through | `sec-browser-popups` | RED (`timed out: log blocked popup about:blank`)
- X-U13 | `core/content.ts:77` `contentFile` containment dropped | `sec-content-protocol` | RED (`timed out: log refused content route …/..%2foutside.svg`; main's layer refused it as `outside root`)
- X-U13 | `main/content.ts:233` real-path `isInside` dropped | `sec-content-protocol` | RED (`refused: /link.svg`)
- X-U14 | `main/security.ts:141` `root + decodeURIComponent(pathname)` for `resolveInside` | `sec-protocol` | RED (`tie://app/..%2f…etc%2fhosts: READ 214`)
- X-U17 | `core/policy.ts:89` `img-src <token> *` | `sec-mermaid` | RED (`CSP img-src refused /classfill`)
- X-T1 | `renderer/frame.ts:117` flood logged, not dropped | `sec-content-escape` | RED (`flood: most messages dropped unparsed (5000 of 5000 parsed)`)
- X-T2 | `main/index.ts:280` `noDownloads(ses)` skipped | `sec-navigate` | RED (`timed out: log blocked download blob:tie://app/`)
- X-T4 | `main/keys.ts:50` capture for any webContents (`wc === ui` dropped) | `sec-keys-capture` | RED (`guest keys never forwarded: [Cmd+D, Cmd+Q, Cmd+T, X, F8]`)
- X-T6 | `renderer/frame.ts:125` gesture rule off | `sec-links-off` | RED (`timed out: log refused request without focus … openLink`)
- X-T6 | `core/security.ts:27` `externalUrl` any scheme | `sec-links-off` | RED (`frame link out, no dialog: … file:///etc/hosts, x-app://…`)
- X-T12 | `viewers/runtime.ts:168` auxclick guard removed | `sec-markdown` | RED (`middle click prevented by the runtime: 1:false`)
- X-T14 | `renderer/dialog.ts:47` no arming | `sec-browser-popups` | RED (`Save disabled at first, armed after ~600 ms: {"disabled":false}`)
- Link dialog (`externalParts`) | skipped (checked in wave 2)
- S-V3 | `renderer/tabs.ts:90` tab switch keeps the selection | `shelf-select` | RED (`tab left: de-selected (<id>)`)
- S-V1 | `renderer/tabs.ts:31` `tabTitle` ignores the shelf | `tabs` | RED (`shelf-only tab title: empty (want tie)`)
- H-V1 | `renderer/driver.ts:99` `bring` skips the tab switch | `cli` | RED (`focus: switched tab, expanded, active`)
- H-V1 | `renderer/driver.ts:103` `bring` skips the expand | `cli` | RED (same assertion)
- H-V3 | `renderer/kinds/terminal.ts:89` `cwdNow` → undefined (stored cwd) | `cwd-split` | RED (`cmd+D: tile cwd …/fresh0 (want …/fresh1)`)
- L-R1 | `renderer/ops.ts:285` `refocus` never blurs | `layout-collapse-zoom` | RED (`keys go nowhere, not to a (focus: <a>)`)
- L-R1b | `renderer/ops.ts:284` `refocus` focuses a collapsed tile | `layout-collapse-zoom` | RED (same assertion; message says "a", focus is on x)
- L-V1 | `renderer/ops.ts:290` `focusNext` least recent (`findLast`) | `keys-swap` | RED (`focus: most recent board tile, b`)
- L-R3 | `main/keys.ts:61` no suspend in `fields` mode | `keys` | RED (`cmd+D while settings open: not sent, no split (sent 2 …)`)
- L-R3 | `core/keymap.ts:71` an override keeps the default chord | `keys-bindings` | RED (`cmd+T: default dropped (tabs 2 -> 3)`); ad-hoc copy past it: `cmd+D: default dropped (actions sent: 2)`
- C-V2 | `viewers/text.ts:110` viewer keeps its first rev | `viewer-text` | RED (`timed out: live update`)
- C-V1 | `renderer/keys.ts:94` nav-back on a nav-less tile acts on the first tile with nav | `markdown-links` | RED (`cmd+[ on a terminal: no-op`)
- S-G3 | `main/index.ts:320` quit skips `pty.killAll()` | `quit` | GREEN → fixed (c3a087d): the kernel's hangup at exit kills plain shells anyway; added a `trap '' HUP; exec sleep 33` tile, only killAll's SIGKILL ends it; now RED (`quit killed every shell and command (alive: <pid>)`)
- Check-count guard, leak flag | skipped (checked in wave 2)

Notes.

- `noDownloads` (X-T2): the scenario checks the guard's log only. "Logged, not prevented" untried: a UI-session download without it would open a native Save dialog.
- X-U5: the subframe guard can only be seen through its log (Chromium refuses tie: on the browser partition anyway).
- X-U6: `webSecurity: false` also lets a guest page read `file:///etc/hosts` and navigate to `chrome://` (seen as `about:blank#blocked`): three cases catch it.

## Wave 4: product-side (serial)

1. Security fixes X-N1, X-N2 (orchestrator, not delegated).
2. Extractions to core + unit tests (Pending 1).
3. Dev hooks: suspend level on the dev socket (H-H11), cwd poll knob (H-V3).
4. Guard mutation runs for the `X-U*` fixes (remove guard → red → restore): done ("Mutation runs").
5. Full e2e.
