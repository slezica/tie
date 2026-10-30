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

- Rebuild (`run`, `start`, `drive`, `test --e2e`): when any `src/` file is newer than `out/.build-stamp`. `--hot` (dev server) doesn't write the stamp.
- Hot (`run --hot`): `electron-vite dev` (UI hot-reloads; main built once, not watched: a restart would kill terminals) plus `dev/viewers.mjs --watch`: a change under `src/viewers/` rebuilds that kind (shared modules: every kind) into `out/viewers/`; main (dev builds) watches that folder and pushes `content:viewer <kind>`; the renderer reloads every file view of that kind (`fileview.ts` `reloadViewers`: new token, same root, scroll restored from the viewer's last `scrolled` report). Style iteration: `tie-dev run --hot`, `tie-dev sample`, edit `src/viewers/markdown.html`. Every instance serves the same `out/viewers/`: a save during `test --e2e` reloads the scenarios' frames too (and their style assertions see the edit), so don't run e2e while iterating.
- `run`, `start`: free debug port unless `TIE_DEBUG_PORT` set.
- Electron binary launched directly with `-ApplePersistenceIgnoreState YES` (`2026-10-09-electron-crash-on-quit.md`). `stop`: the UI's `tie.quit()` over the debugging port (`quitInstance`: a visible instance asks on SIGTERM), else SIGTERM to the info-file pid. Fresh instances (background: no question): SIGTERM, then wait for the process to exit before removing its userData.
- `logs`: last 100 lines of the instance log.
- `layout [cols]`, `screenshot`, `drive --attach`: target `--instance` / `TIE_INSTANCE`.
- `test --e2e [--jobs N] [names|globs...]` (`dev/e2e.mjs`): each scenario on a fresh instance, N at a time (`--jobs N` / `-j N`, else `TIE_JOBS`, else 4); `release` and `install` get the default. Names or shell globs select scenarios (`test --e2e 'sec-*' shelf* cli-replace`; quote globs that could match files in the cwd); none = all; a pattern matching nothing is an error. A line per scenario as it finishes (`ok   name (12.3s)` / `FAIL name (...) (<trace>/)`), then `N/M passed, Ts, jobs J` and `trace:`. `summary.txt` in scenario order. Exit 1 on any failure. `drive` stays one scenario (its `--attach` / `--keep` don't generalize): several = `test --e2e a b c`.
- Scenarios exporting `exclusive = true` run alone, after the others: they change what every instance shares (`viewer-reload` rewrites `out/viewers/markdown.html`, which reloads every instance's markdown frames).
- pty leak check (per instance, `lib.mjs` `leftovers`): after stop, `drive` lists the instance's processes still alive (`ps eww`: environment `TIE_INSTANCE=<instance>`, which every terminal process inherits) that hold a tty, or are spawn-helpers; their distinct ttys = leaked ptys: `ptys=N` in `drive.log` (plus each process), `ptys leaked: +N` on stderr, `(ptys +N)` on the `test --e2e` line. Waits up to 2 s for them to exit first. Other instances (parallel jobs) and other programs don't count. `tie-dev ptys`: live count and spawn-helpers stuck in the kernel (the pty wedge, `docs/2026-10-21-pty-wedge.md`).
- `tie-dev ptydump [dir]` (`dev/ptydump.sh`): run the moment terminals stop starting, before rebooting. One folder (`out/log/ptydump/<time>/`, `summary.txt` first): stuck processes with `sample` stacks, probes (`stat` of a tty, `openpty`, `script`, `lsof`), sleep/wake log, kernel log (2h, tty-filtered copy), Tie instance files, logs, `tie list`, samples. Every step time-boxed: a probe that hangs is reported as `HUNG` and left behind (unkillable). Then `sudo spindump -notarget 3 -file <dir>/spindump-full.txt` for kernel stacks (printed by the command).
- `scenarios`: name + first-line description of each scenario.
- `sample [name]`: opens `dev/samples/<name>.md` (default `markdown`: every syntax the viewer renders) in the instance, for iterating viewer styles (`tie-dev run --hot` beside it: viewer edits rebuild and the tile reloads, "Hot" above). Fixtures for other kinds go beside it.
- `frames`: frame tree of `--instance` (dev builds; socket method `frames`, answered by main).
- Dev socket methods answered by main (dev builds only): `frames`, `input` (`sendInputEvent`), `window-close` (the window's close, as its red button: `lib.mjs` `rpc`), `window-size {w, h}` (resize the window: layout scenarios, `h.resizeWindow`), `pick {path|null}` (next file picker answer; harness instances never show the dialog), `guest {action}` (browser guests: `list`, `crash {id}`, `key {id, keyCode, modifiers}`, `click {id, x, y}` (guest `sendInputEvent`), `proxy {url}` (UI vs browser session `resolveProxy`)). `lib.mjs` `rpc()` calls them.

## Fresh instance (`launch()`, `dev/lib.mjs`)

| Env | Value |
|---|---|
| `TIE_INSTANCE` | `drive-<pid>` |
| `TIE_BACKGROUND` | `1`: offscreen, no window/dock icon/focus stealing; real input can't interfere. `hidden` (scenario `hiddenWindow`): real window, never shown |
| `TIE_SCALE` | `2` (retina-like); `TIE_SCALE=1 tie-dev drive ...` for 1x |
| `TIE_CWD` | repo root |
| `TIE_SETTINGS` | `tmp/<instance>.settings.json`, deleted on stop. Seeded `{allowExternalControl: true, shell: '/bin/bash --noprofile --norc'}` (the harness is an external socket caller; terminals never run the user's profile: speed, and rc output can't break scenarios; prompt `bash-3.2$ `); scenario `settings` merge over it (`{shell: ''}`: the login shell, e.g. `terminal`); a raw string is written as-is |
| `TIE_DOWNLOADS` | `tmp/<instance>.downloads` (browser downloads; dev builds only), deleted on stop. Never the user's `~/Downloads` |
| `TIE_DEBUG_PORT` | free port |
| `TIE_LOG`, `TIE_DEBUG=*` | run folder `app.log` |
| `BASH_SILENCE_DEPRECATION_WARNING` | `1`: macOS bash's zsh notice off (terminal screens start with the prompt) |

- `TIE_SOCKET` / `TIE_TILE` stripped: a run inside Tie never targets it.
- `connectPage` checks `tie.info().instance`: never drives another Tie on a reused port.

## Scenarios

`dev/scenarios/<name>.mjs`, first line `// description`. List: `tie-dev scenarios`.

```js
export const settings = { theme: 'nord' }   // optional pre-seed (object over the seed, or raw string)
export const hiddenWindow = true            // optional: real never-shown window, not offscreen
export const env = { TIE_DEBUG: 'guest' }   // optional: extra environment for the instance
export const exclusive = true              // optional: test --e2e runs it alone (changes shared files)
export default async (ctx, h) => { ... }    // h = helpers
```

`ctx`: `page` (Playwright, CDP), `tie(...args)` (`bin/tie ... --json`, parsed), `shot(label)`, `sleep(ms)`, `log(...)`, `instance`, `runDir`, `appLog()` (run's app log text, `<untrusted>` markers stripped and escapes undone), `rawLog()` (the file as written).

- `hiddenWindow`: offscreen rendering never routes input into content frames (CDP clicks/keys land on the shell). A hidden real window routes like a visible one. Use it for frame and guest input (`frame-input`, `browser`, `sec-browser`).
- Runs once booted: first `.tab`, and every terminal showing its prompt (or an error; at most 3 s). Return value printed (JSON if not string). Throw → exit 1 (`h.assert(cond, msg)`).
- Ad hoc from stdin: helpers in scope; body in an inner block, so it may redeclare their names.

```sh
bin/tie-dev drive - <<'EOF'
const [a] = (await list(ctx)).tiles.map(t => t.id)
await clickButton(ctx, a, 'zoom')
await ctx.shot('zoomed')
return (await list(ctx)).tiles[0].zoomed
EOF
```

## Helpers (`dev/helpers.mjs`, all take `ctx` first)

| Helper | Does |
|---|---|
| `list`, `rectOf(id)` | `tie list`, tile rect |
| `titlePoint(id)`, `sidePoint(id, l\|r\|t\|b\|c)`, `boardCenter` | target points |
| `drag(from, to, {shift, steps, during})` | low-level drag, `during` hook mid-drag |
| `dragTitle(id, target, side)` | move tile by title |
| `shelve`, `unshelve`, `spawnFromTemplate` | shelf / template drags |
| `hoverShelf`, `pin`, `shelfItem`, `template`, `boxOf(selector)` | shelf + DOM points |
| `resizeWindow(w, h)` | window size (dev socket `window-size`), waits for the re-layout |
| `clickButton(id, collapse\|zoom\|close)` | title buttons |
| `threeWaySplit` | `a \| b over c`, returns ids |
| `assert`, `assertPtySizes` | checks; pty size == xterm grid (terminal tiles) |
| `termFit(id)`, `assertTermFit(id, label)` | terminal grid vs visible area: screen/body slack, text overrun past rows, full-width rows (`TERMINALS.md` "Size") |
| `probe`, `uiUrl` | security: local page reporting hits + `window.tie` (`SECURITY.md`); UI URL |
| `frames`, `probeFrame(id)` | window frame tree (`tie frames`: url, origin, pid, out-of-process); Playwright frame inside a probe tile, once its handshake is done |
| `press(chord)`, `keyDown(key)`, `keyUp(key)` | keys through main (dev socket `input` → `sendInputEvent`): pass `before-input-event` like real keys. Use for shortcuts; CDP `ctx.page.keyboard` skips it (fine for typing) |
| `paste(id, text)`, `screen(id)`, `pasteWarning()` | OS-like paste into a terminal; its visible text; open paste dialog (`warnings`, `preview`) or null |
| `contentFrame(id)`, `mdState(id)`, `clickIn(frame, selector, {meta})` | any content tile's Playwright frame, once its viewer has a port (`window.viewer`; re-found after reloads); markdown viewer state (`text`, `html`, `rev`, `key`, `renders`, `scrollY`); real click inside a frame (`hiddenWindow`). Note: `frame.evaluate` runs with a user gesture (transient activation): what a page's script can do *without* one (focus itself, open popups) must be tested from the page's own timers |
| `htmlFrame(id)` | html tile's page frame (the page's realm), once ready; re-found after navigations (`tie list` `page.url`) |
| `site(route)`, `guestPage(id)`, `guestKey(id, chord)`, `guestClick(id, x, y)` | local web site (`route(path) → html \| {status, headers, body} \| null`, `hits`, `close`); browser tile's guest as a Playwright page (CDP target type `webview`, by `web.url`); keys / clicks into the guest through main (`sendInputEvent`: pass its `before-input-event` and `input-event`, like real input) |
| `tileOf(id)`, `waitFor(fn, what)`, `pickNext(path)`, `osDrop(at, data)` | `tie list` entry; poll until truthy; next file picker answer (null = cancel); OS drag-and-drop at a point (`{files}` or `{items}`, CDP) |
| `eventually(fn, ms)`, `settle()` | retry a block of assertions until it passes (last failure thrown, message intact); two animation frames in the shell page (input handled → rendered) |
| `waitTile(id, pred)`, `waitGone(id)`, `waitActive(id)`, `waitRevealed(id\|null)` | `tie list` entry once `pred` holds; tile closed; active tile; shelf hover reveal (`tie state`) |
| `waitShell(id)`, `waitText(id, re)`, `children(id)`, `waitChild(id, re)`, `waitNoChild(id)` | terminal: shell started, prompt drawn; screen matches; shell's child processes (`ps`): a typed command started / ended |
| `waitDialog(sel)`, `waitNoDialog()`, `waitArmed()` | dialog open; closed; its confirm enabled (dialogs that arm after a delay) |

Automation hooks: `tie:settings` DOM event (menu accelerators can't be driven), HTML menus/dialogs, `tie state`, `tie frames`, `tie add probe` (dev), `tie list --json` `term` / `doc` / `page` / `web`, dev socket `guest`, viewer globals `window.viewer` (= `window.markdown|text|image|hex`), dev socket `pick`.

## Traces (`out/log/`)

- `tie-dev.log`: start/end line per invocation (time, instance, command, exit, duration).
- `runs/<time>-<name>/` per `drive` run: `drive.log` (output, shot paths, errors, exit), `app.log` (all tags), `electron.log` (stdout/stderr), `shots/<nn>-<label>.png`.
- `test --e2e`: `runs/<time>-e2e/` with `summary.txt` + one subfolder per scenario.
- Newest 50 run folders kept. Excluded from packages.

## Package check (`dev/package-check.mjs`)

- `tie-dev check-package [app]`; also run by `tie-dev package` (failure removes the package).
- Fuses as expected (`SECURITY.md`), then smoke: launch packaged app in background, bundled `tie list` answers, `tie add <file.md>` (with a diagram) opens without error, diagram library served, an html page loads (bootstrap answers), a text file opens, a browser tile loads a local http page (title), no `[security]` log lines.
