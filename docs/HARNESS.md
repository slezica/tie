# Harness

Dev toolkit `bin/tie-dev`, instances, scenarios, inspection.

## Rules

- `tie-dev` defaults to instance `dev` (the repo build). `default` is the installed app: never target it.
  - Anywhere in the args: `--instance NAME` or `--instance=NAME`.
  - Empty name or other `--instance*` spelling: error, never a silent fallback.
- Prefer `tie-dev drive` (fresh offscreen instance, cleaned up after).
- Harness instances use their own settings file. Never touch `~/.config/tie/settings*.json`.

## Commands

| Command | Does |
|---|---|
| `run [--hot]` | Foreground. Builds if `src/` changed. `--hot`: electron-vite dev server, UI hot reload |
| `build` | Build to `out/`, touch `out/.build-stamp` |
| `start` / `stop` / `status` | Background instance via info file pid |
| `logs [-f]` | Tail `~/.config/tie/log/<instance>.log` |
| `test --unit` | Vitest (`src/core/layout.test.ts`) |
| `test --e2e` | Every scenario, each on a fresh instance. Errors → `tmp/e2e-<name>.err` |
| `typecheck` | `tsc --noEmit` |
| `layout [cols]` | ASCII board from `tie list --json` |
| `screenshot [file]` | PNG over CDP (default `tmp/shots/current.png`) |
| `drive <scenario\|-> [--attach] [--keep]` | Run a Playwright scenario |
| `scenarios` | List scenarios with their first-line description |

- Rebuild trigger: any file in `src/` newer than the build stamp.
- `layout`, `screenshot`, `--attach` use `TIE_INSTANCE` / `--instance`.
- `run`, `start`: free debug port (`TIE_DEBUG_PORT` unless set). Hashed ports can collide.

## Instances

- Per instance: socket, info file, log, debug port, userData (`ARCHITECTURE.md`).
- Electron binary launched directly (not the npm wrapper), with `-ApplePersistenceIgnoreState YES`.
  - Why: `2026-10-09-electron-crash-on-quit.md`.
- Stopped by SIGTERM to the pid in the info file.

Fresh instance from `drive` (`launch()` in `dev/lib.mjs`):

| Setting | Value |
|---|---|
| name | `drive-<pid>` |
| `TIE_BACKGROUND` | `1`: offscreen, no window, no dock icon, no focus stealing |
| `TIE_CWD` | repo root |
| `TIE_SETTINGS` | `tmp/<instance>.settings.json` (deleted on stop) |
| `TIE_DEBUG_PORT` | free port |
| stderr | `tmp/<instance>.stderr` |

- Offscreen: real user input can't interfere; runs in parallel with your own use.
- `TIE_SOCKET` / `TIE_TILE` stripped from env, so a harness run inside Tie doesn't target it.
- CDP attach (`connectPage`) checks the page's `tie.info().instance`: never drives another Tie on a reused port.

## Scenarios

File in `dev/scenarios/<name>.mjs`. First line: `// description`.

```js
export const settings = { theme: 'nord' }   // optional: pre-seed settings file (object or raw string)
export default async (ctx, h) => { ... }    // h = helpers
```

`ctx`:

| Field | Use |
|---|---|
| `page` | Playwright page (CDP) |
| `tie(...args)` | `bin/tie ... --json`, parsed |
| `shot(label)` | `out/log/runs/<time>-<scenario>/shots/<nn>-<label>.png` |
| `sleep(ms)`, `log(...)` | utilities |
| `instance` | instance name |

- Return value is printed (JSON if not a string).
- Thrown error → exit 1. Use `h.assert(cond, msg)`.
- Driver waits for the first `.tile` + 500 ms before running.

Ad hoc, from stdin (helpers destructured into scope; code in an inner block, may redeclare their names):

```sh
bin/tie-dev drive - <<'EOF'
const [a] = (await list(ctx)).tiles.map(t => t.id)
await clickButton(ctx, a, 'zoom')
await ctx.shot('zoomed')
return (await list(ctx)).tiles[0].zoomed
EOF
```

## Helpers (`dev/helpers.mjs`)

| Helper | Does |
|---|---|
| `list`, `rectOf` | `tie list`, tile rect |
| `titlePoint`, `sidePoint(id, l\|r\|t\|b\|c)`, `boardCenter` | target points |
| `drag(from, to, {shift, steps, during})` | low-level drag, hook mid-drag |
| `dragTitle(id, target, side)` | move tile by title |
| `shelve`, `unshelve`, `spawnFromTemplate` | shelf / template drags |
| `hoverShelf`, `pin`, `shelfItem`, `template`, `boxOf` | shelf + DOM points |
| `clickButton(id, collapse\|zoom\|close)` | title buttons |
| `threeWaySplit` | `a \| b over c`, returns ids |
| `assert`, `assertPtySizes` | checks; pty size == xterm grid |

All take `ctx` first.

## Hooks for automation

- `tie:settings` DOM event opens/closes the settings panel (menu accelerators can't be driven).
- Menus and dialogs are HTML, so Playwright can click them.
- `tie state`: internal space state.
- `tie list --json` `term` field: catches pty/xterm size mismatches.

## Logs

- `TIE_DEBUG=layout,shelf,pty,rpc,app` or `*` → `~/.config/tie/log/<instance>.log`.
- Renderer logs via `debug(tag, ...)` (`state.ts`) → main `log()`.

## Scenario list

| Scenario | Covers |
|---|---|
| `boot-settings` | saved settings applied at startup |
| `cli` | relative `--cwd`, multi-word titles, flag aliases, float rect, escaping, `focus` |
| `borders` | border resize; tree change mid-drag not overwritten |
| `collapse-zoom` | collapse bar/strip, zoom, dblclick, keys to visible active tile |
| `float` | shift-drop float, corner resize (activates, raises), dock back |
| `keys` | split + focus shortcuts, shortcuts blocked by panel |
| `lifecycle` | tiles closed mid-spawn, mid-drag, mid-menu leave nothing behind |
| `menu` | rename + icon from board and shelf, focus returns to terminal |
| `settings` | panel pages, preview/cancel, fonts, save, shell, double open |
| `settings-invalid` | out-of-range / mistyped file values sanitized at load |
| `settings-malformed` | unparseable file: panel shows error, Save never overwrites |
| `shelf` | shelve, reveal, pin, activity, reorder, unshelve |
| `shell-errors` | missing shell / cwd error state, save validation |
| `splits` | drop zones, preview, self-drop |
| `tabs` | tabs, per-tab state, cwd titles, shelf-only title, reveal cleared on switch, close rules, reorder |
| `template` | template spawn, empty board, lost pointer capture |
| `terminal` | shell exit, `--cmd` exit, focus stability, pty sizes |

## Device scale

- Harness instances render offscreen at 2x by default (`TIE_SCALE`, like a retina Mac).
- `TIE_SCALE=1 bin/tie-dev drive ...` for 1x.

## Traces (`out/log/`)

Run something, leave it, let an agent examine it later.

- `out/log/tie-dev.log`: one start/end line per `tie-dev` invocation (time, instance, command, exit, duration).
- `out/log/runs/<time>-<name>/`: one folder per scenario run (`drive`, `test --e2e`, `release`):
  - `drive.log`: runner output (results, shot paths, errors, exit).
  - `app.log`: the instance's own log, all debug tags on (`TIE_DEBUG=*`, `TIE_LOG`).
  - `electron.log`: Electron stdout/stderr.
  - `shots/`: screenshots (`ctx.shot`).
- `test --e2e`: one `<time>-e2e/` folder with a subfolder per scenario and `summary.txt`.
- Newest 50 run folders kept. Excluded from packages.
