# Architecture

## Processes

| Process | Code | Owns |
|---|---|---|
| Main | `src/main/` | Window, menu, ptys, socket, settings file, instance files |
| Preload | `src/preload/index.ts` | `window.tie` bridge (sandboxed, CJS build) |
| Renderer | `src/renderer/` | All UI state, DOM, xterm. Source of truth; main holds no layout state |
| Content frames | `src/viewers/` (served by `main/content.ts`) | Content tiles: sandboxed iframes on `tie-content://<token>/`, own process, opaque origin, no bridge (`TILES.md`) |
| Core | `src/core/` | Pure logic, no DOM/Electron: `layout.ts` (slot tree), `security.ts`, `content.ts` (checks, main), `paste.ts`, `requests.ts` (checks, renderer) |

- Window: `sandbox`, `contextIsolation`, CSP `script-src 'self'`, served from `tie://app/`. One per instance. Guards: `SECURITY.md`.
- Menu: no `windowMenu` (its cmd+W would close the window). Quit's cmd+Q shown but not registered (main's `keys.ts` + renderer hold-to-quit). Shortcuts: `before-input-event` in main (`INPUT.md`). Reload/DevTools in dev only.
- Data flow: input (mouse/keys/socket) → `ops.ts` → `S` → `render()` → DOM.

## IPC (`window.tie`, `src/preload/index.ts`)

- Channels: `app:info|quit`, `external:open`, `renderer:ready`, `settings:get|set|open`, `window:borderless-preview`, `pty:*`, `content:open|close`, `keys:action|suspend`, `rpc:request|reply`, `log`.
- Invoke (returns): `app:info` → `{instance, socket, home, cwd, debugTags, dev}`, `content:open(root, kind)` → `{token, url}` or `{error}`, `settings:get|set` (`SETTINGS.md`), `pty:spawn` → pid or `{error}`, `pty:cwd` → fresh `lsof` cwd.
- Main → renderer: `pty:data|exit|process|cwd`, `settings:open`, `keys:action` (shortcuts, `INPUT.md`), `rpc:request` (socket calls, `CLI.md`).
- Adding one: handler in `main/index.ts` via `ipc.on|handle` (sender-checked, `SECURITY.md`) + method in preload (type flows to renderer via `TieApi`).

## Instances (`src/main/env.ts`)

- Instance: `TIE_INSTANCE`, else `default` (packaged) or `dev` (repo). Both run side by side.
- State dir: `$XDG_CONFIG_HOME/tie`, else `~/.config/tie`.

| Per instance | Path / value |
|---|---|
| Socket | `<state>/<instance>.sock` |
| Info file | `<state>/<instance>.json`: `{pid, instance, socket, debugPort, log}` |
| Log | `<state>/log/<instance>.log` (`TIE_LOG` overrides) |
| Settings | `<state>/settings.json` (`default`), `<state>/settings.<instance>.json` (others); `TIE_SETTINGS` overrides |
| Debug port | dev builds only: `TIE_DEBUG_PORT`, else `9300 + hash(instance) % 600` (can collide; `tie-dev` passes a free one) |
| userData | `<appData>/tie-<instance>` (own single-instance lock) |

Other env (main):

- `TIE_CWD`: default start dir for terminals (default: home).
- `TIE_BACKGROUND=1`: offscreen, no dock icon, never focused (`HARNESS.md`). `TIE_BACKGROUND=hidden`: same, but a real never-shown window (input routes into content frames). `TIE_SCALE`: offscreen device scale (default 1).
- `TIE_DEBUG=tag,...|*`: tagged logs. Tags: `app`, `layout`, `shelf`, `pty`, `rpc`, `security`, `content`, `keys`.

## Startup

1. Main: name, userData, debug port; single-instance lock (held → exit 1).
2. `whenReady`: menu, `tie://` and `tie-content://` protocols, window (shown on `ready-to-show` unless background), socket.
3. Renderer `boot()`: info + settings, appearance, init modules, open one terminal, `ready()`.
4. Main writes the info file only after `ready()`. Socket calls wait for it. So harness/CLI never race startup.

## Quit

- `before-quit`: prevent once, remove socket + info file, `pty.killAll()` (SIGKILL after 1.5 s), `app.exit(0)`.
- SIGTERM / SIGINT / window close → `app.quit()`.
- Page (re)load (e.g. HMR) kills all ptys and forgets content tokens: fresh UI has no tiles. On `did-navigate` (committed), so blocked navigations don't.
- Why: node-pty callbacks into a torn-down JS env abort the process (`2026-10-09-electron-crash-on-quit.md`).

## Build

- electron-vite: `main`, `preload` (CJS `index.cjs`), `renderer`. Alias `@core` → `src/core`. Main's build also bundles viewers (`src/viewers/` → `out/viewers/`, IIFE).
- `postinstall`: rebuild node-pty for Electron; `dev/brand-electron.sh` renames dev bundle to "Tie" (menu name).
