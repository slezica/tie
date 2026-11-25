# Harness

`bin/tie-dev` (commands: AGENTS.md "Toolkit").

## Rules

- Default instance `dev`. Never target `default` (installed app): `run` / `start` refuse it unless `--instance default` is explicit. Inside a Tie terminal `TIE_INSTANCE` (exported by the hosting Tie, `TIE_TILE` set) is ignored, so `tie-dev run --hot` from the installed app's shell starts `dev` beside it.
- `--instance NAME` / `--instance=NAME` anywhere in args. Empty name or other `--instance*`: error.
- Prefer `tie-dev drive`: fresh offscreen instance, cleaned up after.
- After a change: only the scenarios of the feature worked on (`test --e2e <names|globs>`), plus `test --unit` and `typecheck`.
- Full `test --e2e` only when specifically needed (shared harness / `lib.mjs` code, layout core, handing back a large refactor), and for release prep (`tie-dev release` runs it itself).
- Waits, not sleeps: `h.eventually` / `h.wait*` (helpers below). A fixed `ctx.sleep` only for "nothing happens meanwhile" or a debounce, with a comment saying which.
- Never touch `~/.config/tie/settings*.json`.

## Command notes

- Rebuild (`run`, `start`, `drive` without `--attach`, `test --e2e`, `mdpage`): when a file under `src/`, `electron.vite.config.ts`, `package.json` or `package-lock.json` is newer than `out/.build-stamp`. `--hot` (dev server) doesn't write the stamp.
- Hot (`run --hot`): `electron-vite dev` (UI hot-reloads; main built once, not watched: a restart would kill terminals) plus `dev/viewers.mjs --watch`: a change under `src/viewers/` rebuilds that kind (shared modules: every kind) into `out/viewers/`; main (dev builds) watches that folder and pushes `content:viewer <kind>`; the renderer reloads every file view of that kind (`fileview.ts` `reloadViewers`: new token, same root, scroll restored from the viewer's last `scrolled` report). Style iteration: `tie-dev run --hot`, `tie-dev sample`, edit `src/viewers/markdown.html` (or in a browser: `mdpage`, "Markdown style iteration"). Every instance serves the same `out/viewers/`: a save during `test --e2e` reloads the scenarios' frames too (and their style assertions see the edit), so don't run e2e while iterating.
- `run`, `start`: free debug port unless `TIE_DEBUG_PORT` set.
- Electron binary launched directly; `start` and fresh instances add `-ApplePersistenceIgnoreState YES` (`2026-10-09-electron-crash-on-quit.md`), `run` doesn't. `stop`: the UI's `tie.quit()` over the debugging port (`quitInstance`: a visible instance asks on SIGTERM), else SIGTERM to the info-file pid. Fresh instances (background: no question): SIGTERM, then wait for the process to exit before removing its userData.
- `logs`: last 100 lines of the instance log.
- `layout [cols]`, `screenshot`, `drive --attach`: target `--instance` / `TIE_INSTANCE`.
- `test --e2e [--jobs N] [names|globs...]` (`dev/e2e.mjs`): each scenario on a fresh instance, N at a time (`--jobs N` / `-j N`, else `TIE_JOBS`, else 4); `release` gets the default. Names or shell globs select scenarios (`test --e2e 'sec-*' shelf* cli-replace`; quote globs that could match files in the cwd); none = all; a pattern matching nothing is an error. A line per scenario as it finishes (`ok   name (12.3s)` / `FAIL name (12.3s) (<trace>/)`), then `N/M passed, Ts, jobs J, ptys leaked K` and `trace:`. `summary.txt` in scenario order, the total last. Exit 1 on any failure; with `--strict-leaks` (passed by `release`) also on any leaked pty (default runs: reported only). `drive` stays one scenario (its `--attach` / `--keep` don't generalize): several = `test --e2e a b c`.
- Scenarios exporting `exclusive = true` run alone, after the others: they change what every instance shares (`viewer-reload` rewrites `out/viewers/markdown.html`, which reloads every instance's markdown frames).
- pty leak check (per instance, `lib.mjs` `leftovers`): after stop, `drive` lists the instance's processes still alive (`ps eww`: environment `TIE_INSTANCE=<instance>`, which every terminal process inherits) that hold a tty, or are spawn-helpers; their distinct ttys = leaked ptys: `ptys=N` in `drive.log` (plus each process), `ptys leaked: +N` on stderr, `(ptys +N)` on the `test --e2e` line, summed in its total line (`--strict-leaks`: fails). Waits up to 2 s for them to exit first. Other instances (parallel jobs) and other programs don't count. `tie-dev ptys`: live count and spawn-helpers stuck in the kernel (the pty wedge, `docs/2026-10-21-pty-wedge.md`).
- `tie-dev ptydump [dir]` (`dev/ptydump.sh`): run the moment terminals stop starting, before rebooting. One folder (`out/log/ptydump/<time>/`, `summary.txt` first): stuck processes with `sample` stacks, probes (`stat` of a tty, `openpty`, `script`, `lsof`), sleep/wake log, kernel log (2h, tty-filtered copy), Tie instance files, logs, `tie list`, samples. Every step time-boxed: a probe that hangs is reported as `HUNG` and left behind (unkillable). Then `sudo spindump -notarget 3 -file <dir>/spindump-full.txt` for kernel stacks (printed by the command).
- `scenarios`: name + first-line description of each scenario.
- `sample [name]`: opens `dev/samples/<name>.md` (default `markdown`: every syntax the viewer renders) in the instance, for iterating viewer styles (`tie-dev run --hot` beside it: viewer edits rebuild and the tile reloads, "Hot" above). Fixtures for other kinds go beside it.
- `css-changes`: devtools CSS edits of `--instance` as a diff against `src/renderer/style.css` ("CSS changes").
- `frames`: frame tree of `--instance` (dev builds; socket method `frames`, answered by main).
- Dev socket methods answered by main (dev builds only): `frames`, `input` (`sendInputEvent`), `window-close` (the window's close, as its red button: `lib.mjs` `rpc`), `window-size {w, h}` (resize the window: layout scenarios, `h.resizeWindow`), `pick {path|null}` (next answer of the native file dialog, the picker's `…`; harness instances never show it), `guest {action}` (browser guests: `list`, `crash {id}`, `key {id, keyCode, modifiers}`, `click {id, x, y}` (guest `sendInputEvent`), `proxy {url}` (UI vs browser session `resolveProxy`)), `window-hide` (the window hidden as a hidden or covered real one: shown once transparent and inactive, then hidden; `h.hideWindow`), `window-state` (the UI page over 1 s, asked from main: `{visibility, frames}`), `key-mode` (main's key suspend level `off | fields | capture`, `keys.ts`; read-only: `h.waitKeyMode`). Gate: main's `devMethods` answer only when `!app.isPackaged`; a packaged app passes every method to the renderer, which has none of these. `lib.mjs` `rpc()` calls them.
- Dev socket methods answered by the renderer (`driver.ts` `DEV_ONLY`, refused unless a dev build): `state` (`tie state`: internal dump, with `barSizes`), `bar-size {bar, px}` (a bar's size as a resize's end: `h.setBarSize`).

## Fresh instance (`launch()`, `dev/lib.mjs`)

| Env | Value |
|---|---|
| `TIE_INSTANCE` | `drive-<pid>` |
| `TIE_BACKGROUND` | `1`: offscreen, no window/dock icon/focus stealing; real input can't interfere. `hidden` (scenario `hiddenWindow`): real window, never shown |
| `TIE_THROTTLE` | unset: harness instances never throttle. `1` (scenario `env`, with `hiddenWindow`): `backgroundThrottling` on as in the real app: a hidden window gets no rAF, slow timers (`content-hidden-window`) |
| `TIE_SCALE` | `2` (retina-like); `TIE_SCALE=1 tie-dev drive ...` for 1x |
| `TIE_CWD` | repo root |
| `TIE_SETTINGS` | `tmp/<instance>.settings.json` (and its `.bak`), deleted on stop. Seeded `{allowExternalControl: true, shell: '/bin/bash --noprofile --norc'}` (the harness is an external socket caller; terminals never run the user's profile: speed, and rc output can't break scenarios; prompt `bash-3.2$ `); scenario `settings` merge over it (`{shell: ''}`: the login shell); a raw string is written as-is |
| `TIE_DOWNLOADS` | `tmp/<instance>.downloads` (browser downloads; dev builds only), deleted on stop. Never the user's `~/Downloads` |
| (UI state) | not an env: `<state>/<instance>.ui.json` (bar sizes, `lib.mjs` `uiStatePath`) removed at launch and on stop (a directory too); scenario `uiState` seeds it. Never `dev.ui.json` / `default.ui.json`: `launch()` refuses the instances `dev` and `default` |
| `TIE_DEBUG_PORT` | free port |
| `TIE_LOG`, `TIE_DEBUG` | run folder `app.log`; `TIE_DEBUG` = scenario `env`, else the caller's, else `*` |
| `TIE_WALK_CAP`, `TIE_WALK_DELAY` | not set by default; scenario `env` (dev builds only, read by main `docs.ts` `startWalk`): picker walk entry cap (partial marker, `picker-partial`; default 50k), ms before each directory read (`sec-walk`: stop / a newer walk land mid-walk) |
| `BASH_SILENCE_DEPRECATION_WARNING` | `1`: macOS bash's zsh notice off (terminal screens start with the prompt) |

- `TIE_SOCKET` / `TIE_TILE` / `ELECTRON_RUN_AS_NODE` stripped: a run inside Tie never targets it.
- No Electron binary (`node_modules/electron/dist`): error naming `npm install` (postinstall downloads it).
- `connectPage` checks `tie.info().instance`: never drives another Tie on a reused port.

## Scenarios

`dev/scenarios/<name>.mjs`, first line `// description`. List: `tie-dev scenarios`.

```js
export const settings = { theme: 'nord' }   // optional pre-seed (object over the seed, or raw string)
export const hiddenWindow = true            // optional: real never-shown window, not offscreen
export const env = { TIE_DEBUG: 'guest' }   // optional: extra environment for the instance
export const exclusive = true              // optional: test --e2e runs it alone (changes shared files)
export const uiState = { bars: { top: 50 } } // optional: UI state file seed (object as JSON, or a raw string)
export default async (ctx, h) => { ... }    // h = helpers
```

`ctx`: `page` (Playwright, CDP; a new one after `restart`: re-read `ctx.page`, never keep the old), `detach()` / `attach()` (Playwright off the instance and on again, `ctx.page` new after: hidden-window scenarios, `h.hideWindow`), `restart()` (the same instance quit and launched again, its settings and UI state files kept: what a user's restart reads; fresh instances only; the app log continues), `tie(...args)` (`bin/tie ... --json`, parsed), `tieAt(dir, ...args)` (same, run from `dir`: relative paths, a caller's cwd), `tieRaw(args, {cwd})` (`bin/tie` as a user runs it, no `--json` added: `{code, out, err}`, never rejects), `shot(label)`, `sleep(ms)`, `log(...)`, `instance`, `runDir`, `appLog()` (run's app log text, `<untrusted>` markers stripped and escapes undone), `rawLog()` (the file as written).

- `hiddenWindow`: offscreen rendering never routes input into content frames (CDP clicks/keys land on the shell). Harness assumptions on Playwright / CDP: `ENGINE.md` "Harness". A hidden real window routes like a visible one. Use it for frame and guest input (`content-input`, `browser`, `sec-browser-*`).
- Timeout: a scenario still running after `TIE_SCENARIO_TIMEOUT` s (default 180) fails; SIGINT / SIGTERM stop the fresh instance first. `waitFor` / `eventually` race each try against the time left (a promise that never settles can't hang them).
- Runs once booted: first `.tab`, and every terminal showing its prompt (or an error; at most 3 s). Return value printed (JSON if not string). Throw → exit 1 (`h.assert(cond, msg)`).
- Check count (`h.checkCount()`): passed `h.assert`s, `h.waitFor`s and `h.eventually`s (helpers built on them included) are counted; `checks=N` in `drive.log`. A scenario file with 0 fails (`scenario ran no checks`); stdin runs only report it.
- Uncaught errors in main: main logs every uncaught exception / unhandled rejection as `[error]` with its stack (always on; no dialog in background instances). A run whose `app.log` has an `[error]` line fails (`uncaught in main`), whatever its checks said.
- Ad hoc from stdin: helpers in scope; body in an inner block, so it may redeclare their names.
- Points: "away" / "outside" points from `list.board` (a side bar may sit where a fixed point was). Playwright's `mouse.move(x, y, options)` reads `x`, `y` from `options` too: never pass a box (`h.boxOf` result) as options.

```sh
bin/tie-dev drive - <<'EOF'
const [a] = (await list(ctx)).tiles.map(t => t.id)
await clickButton(ctx, a, 'zoom')
await ctx.shot('zoomed')
return (await list(ctx)).tiles[0].zoomed
EOF
```

## Helpers (`dev/helpers.mjs`)

All take `ctx` first except `assert`, `alive`, `leafIds`, `tilde`, `pixels`, `fraction` (none) and `recordViolations`, `violations` (a frame).

| Helper | Does |
|---|---|
| `list`, `state`, `rectOf(id)` | `tie list` / `tie state` (socket, no `bin/tie` process: cheap to poll), tile rect |
| `titlePoint(id)`, `sidePoint(id, l\|r\|t\|b\|c)`, `boardCenter` | target points |
| `drag(from, to, {shift, steps, during})` | low-level drag, `during` hook mid-drag |
| `dragTitle(id, target, side, opts)` | move tile by title |
| `shelve`, `unshelve`, `spawnFromTemplate` | shelf / template drags (`shelve`: the strip's end along its bar) |
| `hoverShelf`, `clickShelf`, `shelfItem`, `template`, `boxOf(selector)` | shelf: hover reveal, plain item click (pins; unpins a pinned one) + DOM points |
| `selectShelf(...ids)`, `selected()` | cmd+click items (selection toggle, each confirmed in `tie state`); selected ids |
| `hideWindow()` | window hidden as the real app's when hidden or covered, Playwright detached (attached, it keeps the page painting); returns once the page is `hidden` with no animation frames. Needs `hiddenWindow` + `env = { TIE_THROTTLE: '1' }`. After: socket only (`ctx.tie`), then `ctx.attach()` to look |
| `resizeWindow(w, h)` | window size (dev socket `window-size`), waits for the re-layout |
| `clickButton(id, collapse\|zoom\|close, modifiers)` | title buttons |
| `threeWaySplit` | `a \| b over c`, returns ids |
| `assert`, `assertPtySizes(ms)` | checks; pty size == xterm grid (terminal tiles; retries itself: call it directly, not in `eventually`) |
| `termFit(id)`, `assertTermFit(id, label)`, `waitTermFit(id, label, ms)` | terminal grid vs visible area: screen/body slack, text overrun past rows, full-width rows (`TERMINALS.md` "Size"); `waitTermFit`: waits for the fit after a size change, then asserts |
| `probe`, `uiUrl` | security: local page reporting hits + `window.tie` (`SECURITY.md`); UI URL |
| `frames` | window frame tree (`tie frames`: url, origin, pid, out-of-process) |
| `pressLocation()` | cmd+L, then waits for the location field's focus (type after it) |
| `press(chord)`, `keyDown(key)`, `keyUp(key)` | keys through main (dev socket `input` → `sendInputEvent`): pass `before-input-event` like real keys. Use for shortcuts; CDP `ctx.page.keyboard` skips it (fine for typing) |
| `paste(id, text)`, `screen(id)`, `lines(id)`, `pasteWarning()` | OS-like paste into a terminal; its visible text (rows joined, no newlines); as lines (blank space around trimmed); open paste dialog (`warnings`, `preview`) or null |
| `contentFrame(id, ms)`, `mdState(id)`, `waitMd(id, text, what, ms)`, `clickIn(frame, selector, {meta})` | any content tile's Playwright frame (viewers, and the probe: the attacker's seat), once its handshake is done (`window.viewer.port` / `window.probe.inits`; re-found after reloads; 8 s); markdown viewer state (`text`, `html`, `rev`, `key`, `renders`, `scrollY`); markdown tile once its text starts with `text`; real click inside a frame (`hiddenWindow`). Note: `frame.evaluate` runs with a user gesture (transient activation): what a page's script can do *without* one (focus itself, open popups) must be tested from the page's own timers |
| `htmlFrame(id)` | html tile's page frame (the page's realm), once ready; re-found after navigations (`tie list` `page.url`) |
| `recordViolations(frame)`, `violations(frame)` | CSP violations in a frame: start recording (`securitypolicyviolation`, `<directive> <blocked URI>`); read them |
| `site(route)`, `guestPage(id)`, `guestKey(id, chord)`, `guestClick(id, x, y)` | local web site (`route(path) → html \| {status, headers, body} \| null`, `hits`, `close`); browser tile's guest as a Playwright page (CDP target type `webview`, by `web.url`); keys / clicks into the guest through main (`sendInputEvent`: pass its `before-input-event` and `input-event`, like real input) |
| `tileOf(id)`, `waitFor(fn, what)`, `osDrop(at, data)` | `tie list` entry; poll until truthy; OS drag-and-drop at a point (`{files}` or `{items}`, CDP) |
| `tieError(...args)`, `leafIds(tree)` | `tie <args>` expected to fail: its message, or null if it succeeded; leaf ids of a slot tree (`tie state` tree), in order |
| `setBars(bars, extra?)`, `barOf(component)`, `mountedBars()` | bars layout by hand edit: settings file edited (`bars`, plus `extra` keys), panel Reload, panel closed; waits until mounted (may be invalid on purpose: the default then); which bar and gravity group a component is in, `vertical` (left / right: its axis is y); the layout as mounted (DOM order of each group) |
| `editLayout()`, `layoutPoint(component, bar, gravity, index?)`, `dragComponent(component, bar, gravity, {index, during, steps})` | edit layout mode: panel opened on Appearance if closed, Modify, waits for `#layout-edit`; a pointer point targeting that bar / gravity / index (default: start → first, end → last; in the zone, the right half, between the other components' midpoints); a component dragged there (`bar` null: released on the board, no change), `during` before the release |
| `checkLabels(what, {crowded})` | edit mode labels checked (in the mode): each inside the window, its bar and its component (4 px clear every side), centred on the component, never rotated in a horizontal bar, whole (`--ls` 1, scroll size within its box), its component at least the label + `LABEL_PAD` (6) each side along the bar; labels and components apart. `crowded`: a bar too full to grow (shrunk / cut allowed). Returns `{c, text, bar, rotated, ls, cut, r, comp}` |
| `dragBox()`, `checkDragBox(label, what)` | edit mode drag box as drawn: `{shown, box, chip, text, rotated, cut}`; checked: shown with that label, whole, inside the box, centred |
| `setBarSize(bar, px\|null)`, `barSizes()` | a bar's size set as a resize's end would (dev socket `bar-size`, renderer `driver.ts`: clamped to today's limits, applied, written to the UI state file; null: the default, as a double-click), any bar, shown or not; returns `{stored, shown}`. `barSizes`: `{stored, shown}` of the four bars (`tie state` `barSizes`) |
| `barEdge(bar)`, `resizeBar(bar, px, {steps, during})` | a shown bar's edge strip (`.bar-edge`: point + box); its edge dragged so the bar would be `px` thick (clamped by Tie), `during` before the release (live checks: the file isn't written yet); returns `barSizes()` |
| `openSettings(page?)`, `cssVar(name)` | settings panel open (`tie:settings`), optionally on a page (`appearance`, `bindings`, `terminal`, `files`, `security`); CSS custom property of the UI root |
| `focused()`, `linkStrip(id)`, `alive(pid)` | where keys go in the UI (focused element's tile id, else its tag); a tile's link strip text, null while hidden; process alive (signal 0) |
| `keyMode()`, `waitKeyMode(mode)` | main's key suspend level (dev socket `key-mode`: `off`, `fields`, `capture`); wait for it before keys that depend on it (focus reaches main asynchronously) |
| `pixels(png)`, `fraction(pix, test)` | decode a Playwright PNG (8-bit RGB/RGBA) → `{w, h, bpp, px, at(x, y) → [r, g, b]}`; share of pixels passing `test([r, g, b])` (paint checks: a guest's red page, no white flash) |
| `tilde(path)` | a path as Tie titles it (`~` for home): file / html tile titles |
| `pick(text)`, `pickCancel()`, `nativePickNext(path)` | file picker (`#picker`, after the drop / cmd+O): line replaced by `text` (absolute path: that file opens; or prefix + query), Enter, waits closed; Esc; next answer of the native dialog (`…`; null = cancel) |
| `eventually(fn, ms)`, `settle()` | retry a block of assertions until it passes (last failure thrown, message intact); two animation frames in the shell page (input handled → rendered), then its running finite animations finished (≤ 2 s) |
| `waitTile(id, pred, what, ms)`, `waitGone(id)`, `waitActive(id)`, `waitRevealed(id\|null)` | `tie list` entry once `pred` holds; tile closed; active tile; shelf hover reveal (`tie state`) |
| `waitShell(id)` (fails at once on a tile error; timeout names pid + last lines), `waitText(id, re)`, `children(id)`, `waitChild(id, re)`, `waitNoChild(id)`, `waitRunning(id, re)` | terminal: shell started, prompt drawn; screen matches (`screen` joins rows without newlines: no `^`/`$` per line); shell's child processes (`ps`): a typed command started / ended; a program running in the tile (its own process, as a `--cmd` bash execs a single command, or a child) |
| `openFresh(root, from, open, what)` | terminal `from` (active) `cd`s between two cwd polls, then `open()`: proves the new tile took the shell's cwd fresh, not main's 2 s poll (retries when too slow); `{t, dir}` |
| `waitLog(re, n)` | run's app log has n matches |
| `waitDialog(sel)`, `waitNoDialog()`, `waitArmed()` | dialog open; closed; its confirm enabled (dialogs that arm after a delay) |

Automation hooks: `tie:settings` DOM event (menu accelerators can't be driven), HTML menus/dialogs, `tie state`, `tie frames`, `tie add probe` (dev), `tie list --json` `term` / `doc` / `page` / `web`, dev socket `guest`, viewer globals `window.viewer` (= `window.markdown|text|image|hex`), picker DOM (`#picker`, `#picker-input`, `.picker-row[.selected]`, `#picker-status`, `#picker-native`), dev socket `pick` (native dialog).

## Markdown style iteration (`tie-dev mdpage`, `dev/mdpage.mjs`)

Viewer CSS tinkered in a normal browser's devtools, brought back as a diff.

1. Produce: `tie-dev mdpage [--theme NAME] [--sample NAME] [--out FILE] [--open]`. Fresh offscreen instance (theme seeded in its settings; default: the settings default), one markdown tile 720 px wide (window sized to it), sample opened from a temp copy. Writes `tmp/mdpage/<sample>-<theme>.html` + `.png` beside it.
2. Open (`--open`), tinker in devtools (Sources / Elements), copy the Changes diff.
3. Apply to the source named by the HTML comment before each `<style>`: `src/viewers/markdown.html` (typography), `runtime.ts` (base), `marks.ts`, `highlight.ts`, `live.ts`. Undo the rewrite: `.viewer-root` = `:root` / `html`, `.viewer-body` = `body`.
4. Check in Tie: `tie-dev run --hot` + `tie-dev sample` (viewers rebuild, tile reloads), or rerun `mdpage`.

- Page: board background, a 720 px tile, title bar + nav bar cloned from the renderer with computed styles frozen inline; the viewer's DOM (scripts removed) in `.viewer-frame > .viewer-root > .viewer-body`. Theme vars inline on `.viewer-root` (as the viewer sets them on its `:root`). `.viewer-frame` contains the fixed edge markers (transform), `.viewer-root` scrolls. No scripts, no network.
- Viewer `<style>`s verbatim except selectors (`:root` / `html` / `body`; comments and declarations untouched), labelled by content.
- Marks: the temp copy is edited after the first render (first heading, first paragraph, a paragraph appended), snapshot as soon as the 3 blocks are `.changed`; `fading` stripped. Appended block is off screen: "changed below" marker on.
- Diagrams: waited up to 10 s; any still pending: a note above the tile. Images (`tie-content://`): `src` removed (alt only), noted.
- Verified on each run (headless system Chrome, else Playwright's Chromium): no console errors or requests, vars on `.viewer-root`, ≥ 2 marked blocks, tile 720 px, code token colors, h1 size = the live frame's.
- Not faithful: `rem` resolves against the page's `html`, pinned to the viewer's root size at snapshot: a `--size` / `--scale` tweak moves em sizes, not rem spacing (set `html { font-size }` to match). Fonts: the browser's (same names; system fonts on macOS). No CSP, no live behaviour (marks never fade, links inert).

## CSS changes (`tie-dev css-changes`, `dev/css-changes.mjs`)

UI CSS tinkered in the running instance's devtools, brought back as a diff (devtools' Changes panel copies whole files).

- Read-only: CDP session on the instance's page (`connectPage`), `DOM.enable` + `CSS.enable`, `CSS.getStyleSheetText`; never a write. `--instance NAME` as other commands.
- Sheet: found by content (the sheet holding most of `style.css`'s lines). Built: `tie://app/assets/index-*.css` = `style.css` unminified, then xterm's CSS (cut off by anchors: the file's first / last 3 lines; an edited end: the cut with the smallest diff). Hot mode (`run --hot`): the dev server's `style.css` link (`index.html`), verified by hand.
- Base: the build may predate HEAD. Candidates: the working tree, the last 15 commits touching `style.css`; the one with the smallest diff wins, named on stderr.
- Encoding: `style.css` starts with `@charset "UTF-8"` (kept first by the build): Chromium reads the sheet as UTF-8 (`tie://` serves `text/css` without a charset). Builds from before it read as windows-1252: runs of non-ASCII text that re-encode to valid UTF-8 are repaired (noted on stderr); a char typed in devtools stays as typed.
- Output: unified diff on stdout (3 lines of context, the rule's selector in each hunk header as git's, paths `a/src/renderer/style.css` / `b/...`: `git apply`-able), else `no changes`. Stderr: instance, sheet, base, notes. Rules added with devtools' "New Style Rule" (inspector sheet, in no file): listed after, on stderr.
- Not included: `element.style` (inline style attribute) edits; viewer CSS (frames: `mdpage`).
- Scenario `css-changes`: the sheet decoded as UTF-8 (`@charset` first, nothing repaired); edits through a second CDP session (a declaration with a typed "×" on a line with its own "×", the file's last rule, an inspector rule, an older build's sheet → its commit as the base); the command's output checked exactly, the sheet unchanged by it.

## macOS permission prompts (TCC)

- Shells in Tie terminals spawn disclaimed (`TERMINALS.md` "Spawn"): an instance launched from one has the shell as responsible process, not the installed app (`sec-disclaim`). Which app a real prompt then names: unverified (`PENDING.md` 37). From a plain terminal: the dev `Electron.app`.
- `tie-dev install` re-signs ad hoc: a new cdhash. TCC records for the old one stop matching ("Failed to match existing code requirement" in `log show --predicate 'subsystem == "com.apple.TCC"'`) and macOS prompts again. The prompt may sit behind other windows.
- `sec-browser-session`: the guest's `getUserMedia` reaches the system mic check before Tie's permission handler; an unanswered prompt blocks it. The scenario bounds it (5 s) and names the cause. Fix: deny the prompt once (or `tccutil reset Microphone com.salezica.tie`, then deny on the next run).
- Locked screen: `h.hideWindow` can't hide the window (the page stays `visible`, frames run), so `content-hidden-window` fails every run (seen 2026-11-25: 5/5 red locked, green once unlocked). Run it unlocked.
- Walks (`doc:walk`) into Documents, Desktop, Downloads, Pictures, Music, Library ask too; a blocked read holds a libuv thread (`2026-10-30-file-picker.md` "Research"). The picker skips those at home's top level unless typed into.

## Traces (`out/log/`)

- `tie-dev.log`: start/end line per invocation (time, instance, command, exit, duration).
- `runs/<time>-<name>/` per `drive` run: `drive.log` (output, shot paths, errors, exit), `app.log` (all tags), `electron.log` (stdout/stderr), `shots/<nn>-<label>.png`.
- `test --e2e`: `runs/<time>-e2e/` with `summary.txt` + one subfolder per scenario (as above, plus `output.log`: the runner's output).
- Newest 50 run folders kept. Excluded from packages.

## Package check (`dev/package-check.mjs`)

- `tie-dev check-package [app]`; also run by `tie-dev package` (failure removes the package).
- Fuses as expected (`SECURITY.md`), then smoke: launch packaged app in background, bundled `tie list` answers, `tie state` refused (dev only), `tie add <file.md>` (with a diagram) opens without error, diagram library served, an html page loads (bootstrap answers), a text file opens, a browser tile loads a local http page (`web.title`), no `[security]` log lines.

## Install check (`dev/install-check.sh`)

- `tie-dev check-install`: install while running, end to end, in `/tmp/tie-ic.*` (`TIE_INSTALL_DIR`, `XDG_CONFIG_HOME`; never `/Applications`, `~/.config/tie`). Cases: `PACKAGING.md` "Install while running". Run by `release` (packages, launches several copies: ~1 min).
