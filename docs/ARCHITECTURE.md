# Architecture

Processes, IPC, renderer modules, startup and quit.

## Processes

| Process | Code | Owns |
|---|---|---|
| Main | `src/main/` | Window, menu, ptys, unix socket, settings file, instance files |
| Preload | `src/preload/index.ts` | `window.tie` bridge (sandboxed, CommonJS build) |
| Renderer | `src/renderer/` | All UI state (spaces, tiles, layout), DOM, xterm |
| Core | `src/core/layout.ts` | Pure slot-tree logic. No DOM, no Electron |

- Renderer is the source of truth. Main holds no layout state.
- Window: `sandbox: true`, `contextIsolation: true`. CSP: `'self'` scripts only.
- One window per instance. No `windowMenu` (its cmd+W would close the window).
- Daemon/client split was considered and shelved: `2026-10-09-daemon-client-architecture.md`.

## IPC (preload `window.tie`)

| API | Channel | Direction |
|---|---|---|
| `info()` | `app:info` (invoke) | → `{instance, socket, home, cwd, debugTags}` |
| `ready()` | `renderer:ready` | renderer → main, after boot |
| `settings.get/set` | `settings:get/set` (invoke) | see `SETTINGS.md` |
| `settings.onOpen` | `settings:open` | main → renderer (menu, cmd+,) |
| `pty.spawn` | `pty:spawn` (invoke) | → pty id, or `{error}` |
| `pty.write/resize/kill` | `pty:write/resize/kill` | renderer → main |
| `pty.onData/onExit/onProcess/onCwd` | `pty:data/exit/process/cwd` | main → renderer |
| `rpc.onRequest` / `rpc.reply` | `rpc:request` / `rpc:reply` | socket calls, see `CLI.md` |
| `log(tag, ...)` | `log` | renderer → tagged log file |

## Renderer modules

- `state.ts`: `S`, `Space`, `Tile`, geometry, `withSpace`, `location`, board/shelf rects.
- `ops.ts`: every state mutation. Ends in `render()`.
- `render.ts`: state → DOM. Absolute positions in window coords.
- `tile.ts`: tile element + terminal wiring.
- `drag.ts`: pointer tracking, drag/drop, border + float resize.
- `shelf.ts`, `tabs.ts`, `menu.ts`, `dialog.ts`, `settings.ts`: UI parts.
- `keys.ts`: keymap. `driver.ts`: socket methods → ops.
- `themes.ts`, `appearance.ts`: colors, fonts.
- `main.ts`: boot + delegated tile events (pointerdown, click, contextmenu).

Data flow:

```
input (mouse/keys/socket) → ops.ts → S mutated → render() → DOM
```

- No framework. Plain objects + full `render()` each time.
- Tile elements never re-parent; xterm stays mounted.
- Keyed reconcile where an element may hold pointer capture: borders, shelf items, tabs.

## Instance identity

`TIE_INSTANCE` (default `default`) selects everything per instance (`src/main/env.ts`):

| Thing | Value |
|---|---|
| Socket | `~/.tie/<instance>.sock` |
| Info file | `~/.tie/<instance>.json`: `{pid, instance, socket, debugPort, log}` |
| Log | `~/.tie/log/<instance>.log` |
| Settings | `~/.tie/settings.json` (`default`), `~/.tie/settings.<instance>.json` (others) |
| Instance | `TIE_INSTANCE`, else `default` when packaged, `dev` from the repo |
| Debug port | `TIE_DEBUG_PORT` (`tie-dev`, harness: a free port), else `9300 + hash(instance) % 600`. Dev builds only |
| userData | `<appData>/tie-<instance>` (separate single-instance lock) |

Other env (main):

- `TIE_CWD`: start dir of the first terminal (default: home).
- `TIE_SETTINGS`: settings file path override.
- `TIE_BACKGROUND=1`: offscreen window, no dock icon, never focused. See `HARNESS.md`.
- `TIE_DEBUG=tag,tag|*`: tagged logs. Tags in use: `app`, `layout`, `shelf`, `pty`, `rpc`.

## Startup

1. Main: set name, userData, debug port; take single-instance lock (exit 1 if held).
2. `whenReady`: menu, window (shown on `ready-to-show` unless background), socket server.
3. Renderer `boot()`: load info + settings, apply appearance, init modules, open one terminal.
4. Renderer calls `ready()`. Main writes the info file only then.
   - Harness and CLI never race startup.
   - Socket calls before ready wait for it.

## Quit

- `before-quit`: prevent once, remove socket + info file, `pty.killAll()` (SIGKILL after 1.5 s), then `app.exit(0)`.
- SIGTERM / SIGINT → `app.quit()`.
- Page (re)load kills all ptys: a fresh UI has no tiles.
- Why: node-pty callbacks into a torn-down JS env abort the process. See `2026-10-09-electron-crash-on-quit.md`.

## Build

- electron-vite: `main`, `preload` (CJS `index.cjs`), `renderer`. Alias `@core` → `src/core`.
- `postinstall`: rebuild node-pty for Electron; `dev/brand-electron.sh` renames the dev bundle to "Tie" (macOS menu name).
