# Harness

`bin/tie-dev` (commands: AGENTS.md "Toolkit").

## Rules

- Default instance `dev`. Never target `default` (installed app).
- `--instance NAME` / `--instance=NAME` anywhere in args. Empty name or other `--instance*`: error.
- Prefer `tie-dev drive`: fresh offscreen instance, cleaned up after.
- Never touch `~/.config/tie/settings*.json`.

## Command notes

- Rebuild (`run`, `start`, `drive`, `test --e2e`): when any `src/` file is newer than `out/.build-stamp`. `--hot` (dev server) doesn't write the stamp.
- `run`, `start`: free debug port unless `TIE_DEBUG_PORT` set.
- Electron binary launched directly with `-ApplePersistenceIgnoreState YES` (`2026-10-09-electron-crash-on-quit.md`). `stop`: SIGTERM to info-file pid.
- `logs`: last 100 lines of the instance log.
- `layout [cols]`, `screenshot`, `drive --attach`: target `--instance` / `TIE_INSTANCE`.
- `test --e2e`: each scenario on a fresh instance; trace folder per run (below).
- `scenarios`: name + first-line description of each scenario.

## Fresh instance (`launch()`, `dev/lib.mjs`)

| Env | Value |
|---|---|
| `TIE_INSTANCE` | `drive-<pid>` |
| `TIE_BACKGROUND` | `1`: offscreen, no window/dock icon/focus stealing; real input can't interfere |
| `TIE_SCALE` | `2` (retina-like); `TIE_SCALE=1 tie-dev drive ...` for 1x |
| `TIE_CWD` | repo root |
| `TIE_SETTINGS` | `tmp/<instance>.settings.json`, deleted on stop |
| `TIE_DEBUG_PORT` | free port |
| `TIE_LOG`, `TIE_DEBUG=*` | run folder `app.log` |

- `TIE_SOCKET` / `TIE_TILE` stripped: a run inside Tie never targets it.
- `connectPage` checks `tie.info().instance`: never drives another Tie on a reused port.

## Scenarios

`dev/scenarios/<name>.mjs`, first line `// description`. List: `tie-dev scenarios`.

```js
export const settings = { theme: 'nord' }   // optional pre-seed (object or raw string)
export default async (ctx, h) => { ... }    // h = helpers
```

`ctx`: `page` (Playwright, CDP), `tie(...args)` (`bin/tie ... --json`, parsed), `shot(label)`, `sleep(ms)`, `log(...)`, `instance`, `runDir`, `appLog()` (run's app log text).

- Runs after first `.tile` + 500 ms. Return value printed (JSON if not string). Throw → exit 1 (`h.assert(cond, msg)`).
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
| `clickButton(id, collapse\|zoom\|close)` | title buttons |
| `threeWaySplit` | `a \| b over c`, returns ids |
| `assert`, `assertPtySizes` | checks; pty size == xterm grid |
| `probe`, `shellUrl` | security: local page reporting hits + `window.tie` (`SECURITY.md`); shell URL |

Automation hooks: `tie:settings` DOM event (menu accelerators can't be driven), HTML menus/dialogs, `tie state`, `tie list --json` `term`.

## Traces (`out/log/`)

- `tie-dev.log`: start/end line per invocation (time, instance, command, exit, duration).
- `runs/<time>-<name>/` per `drive` run: `drive.log` (output, shot paths, errors, exit), `app.log` (all tags), `electron.log` (stdout/stderr), `shots/<nn>-<label>.png`.
- `test --e2e`: `runs/<time>-e2e/` with `summary.txt` + one subfolder per scenario.
- Newest 50 run folders kept. Excluded from packages.

## Package check (`dev/package-check.mjs`)

- `tie-dev check-package [app]`; also run by `tie-dev package` (failure removes the package).
- Fuses as expected (`SECURITY.md`), then smoke: launch packaged app in background, bundled `tie list` answers, no `[security]` log lines.
