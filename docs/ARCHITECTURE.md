# Architecture

## Processes

| Process | Code | Owns |
|---|---|---|
| Main | `src/main/` | Window, menu, ptys, socket, settings file, instance files, viewer files (`docs.ts`: open, watch, write) |
| Preload | `src/preload/index.ts` | `window.tie` bridge (sandboxed, CJS build) |
| Renderer | `src/renderer/` | All UI state, DOM, xterm. Source of truth; main holds no layout state |
| Content frames | `src/viewers/` (served by `main/content.ts`) | Content tiles: sandboxed iframes on `tie-content://<token>/`, own process, opaque origin (html: own token origin), no bridge (`TILES.md`) |
| Browser guests | `src/renderer/guest.ts`, `src/main/guest.ts` | Browser tiles: `<webview>` webContents on `persist:browser`, no bridge, no Tie protocols (`BROWSER.md`) |
| Core | `src/core/` | Pure logic, no DOM/Electron: `layout.ts` (slot tree), `security.ts`, `content.ts` (checks, main), `paste.ts`, `requests.ts` (checks, renderer), `keymap.ts`, `markdown.ts` (files, links), `watchdog.ts` (content frames) |

- Window: `sandbox`, `contextIsolation`, `webviewTag` (guests only via `attachGuest`), CSP `script-src 'self'`, served from `tie://app/`, session `tie-ui` (in memory, no network). One per instance. Guards: `SECURITY.md`.
- Sessions: `tie-ui` (UI + content frames: in memory, dead proxy, Tie's protocols); `persist:browser` (guests: on disk, network, no Tie protocols). Permissions denied on both.
- Menu: no `windowMenu` (its cmd+W would close the window). Quit's cmd+Q shown but not registered (main's `keys.ts` matches it, guests included). Shortcuts: `before-input-event` in main (`INPUT.md`). Reload/DevTools in dev only.
- Data flow: input (mouse/keys/socket) → `ops.ts` → `S` → `render()` → DOM.

## IPC (`window.tie`, `src/preload/index.ts`)

- Channels: `app:info|quit|ask-quit`, `external:open`, `renderer:ready`, `settings:get|set|open`, `window:borderless-preview`, `pty:*`, `content:open|close|kill|navigated|navfailed|changed`, `guest:unresponsive|popup|download|download-ok|unload|leave|prevent-unload`, `doc:viewer|open|close|pick|changed` (read-only: no doc writes), `keys:action|suspend`, `rpc:request|reply`, `log`.
- Invoke (returns): `app:info` → `{instance, socket, home, cwd, debugTags, dev}`, `content:open(root, kind)` → `{token, url}` or `{error}`, `doc:viewer(path)` → `{kind, path}` or `{error}`, `doc:open(path)` → `{id, text, rev}` or `{error}`, `doc:pick(dir)` → path or null, `settings:get|set` (`SETTINGS.md`), `pty:spawn` → pid or `{error}`, `pty:cwd` → fresh `lsof` cwd, `pty:busy(pids)` → `{[pid]: {busy, proc}}` (`TERMINALS.md` "Busy"), `guest:unload(id)` → `'closed'|'blocked'|'gone'` (`BROWSER.md` "Leaving a page").
- Main → renderer: `app:ask-quit` (quit requested: ask), `pty:data|exit|process|cwd`, `doc:changed(id, {text, rev} | {missing})`, `settings:open`, `keys:action` (shortcuts, `INPUT.md`), `rpc:request` (socket calls, `CLI.md`).
- Adding one: handler in `main/index.ts` via `ipc.on|handle` (sender-checked, `SECURITY.md`) + method in preload (type flows to renderer via `TieApi`).

## Instances (`src/main/env.ts`)

- Instance: `TIE_INSTANCE`, else `default` (packaged) or `dev` (repo). Both run side by side.
- State dir: `$XDG_CONFIG_HOME/tie`, else `~/.config/tie`. Private: 0700, every file in it 0600 (`env.ts` `PRIVATE`; sockets chmod'ed after listen): other local accounts can't reach the socket (= run commands as the user), logs or settings.

| Per instance | Path / value |
|---|---|
| Socket | `<state>/<instance>.sock`. Callers: Tie terminals by lineage, others gated by a setting (`CLI.md` "Callers") |
| Info file | `<state>/<instance>.json`: `{pid, instance, socket, debugPort, log}` |
| Log | `<state>/log/<instance>.log` (`TIE_LOG` overrides) |
| Settings | `<state>/settings.json` (`default`), `<state>/settings.<instance>.json` (others); `TIE_SETTINGS` overrides |
| Debug port | dev builds only: `TIE_DEBUG_PORT`, else `9300 + hash(instance) % 600` (can collide; `tie-dev` passes a free one) |
| userData | `<appData>/tie-<instance>` (own single-instance lock; `Partitions/browser`: browser tiles) |

Other env (main):

- `TIE_CWD`: default start dir for terminals (default: home).
- `TIE_DOWNLOADS` (dev builds only): browser downloads folder (harness instances; default `~/Downloads`).
- `TIE_BACKGROUND=1`: offscreen, no dock icon, never focused (`HARNESS.md`). `TIE_BACKGROUND=hidden`: same, but a real never-shown window (input routes into content frames). `TIE_SCALE`: offscreen device scale (default 1).
- `TIE_DEBUG=tag,...|*`: tagged logs. Tags: `app`, `layout`, `shelf`, `pty`, `rpc`, `security`, `content`, `keys`, `docs` (main), `markdown`.

## Startup

1. Main: name, userData, debug port; single-instance lock (held → exit 1).
2. `whenReady`: menu, `tie://` and `tie-content://` protocols, window (shown on `ready-to-show` unless background), socket.
3. Renderer `boot()`: info + settings, appearance, init modules, open one terminal, `ready()`.
4. Main writes the info file only after `ready()`. Socket calls wait for it. So harness/CLI never race startup.

## Quit

- Asks first, always: cmd+Q (`quit` action → `askQuit`), menu Quit, window close (red button: `close` prevented → `app.quit()`), Dock / logout all reach `before-quit`, which (unconfirmed, UI up) prevents and sends `app:ask-quit` → `askQuit`.
- `askQuit` (`renderer/quit.ts`): `.dialog.quit` "Quit Tie?", Quit / Cancel (Enter / Esc). Busy terminals (`TERMINALS.md` "Busy"), any tab, shelf included: "Currently running:" + `title — command`, grouped by tab when there are several tabs. No tiles: still asks. Then each browser page's beforeunload (`BROWSER.md`; Stay aborts). Confirmed → `app:quit`. While any dialog is open: nothing (no second dialog).
- Confirmed (`app:quit`) or SIGTERM / SIGINT (harness `stop`): `before-quit` proceeds: remove socket + info file, `pty.killAll()` (SIGKILL after 1.5 s), `app.exit(0)`.
- No question when the UI isn't up (booting, reloading, crashed: `uiUp`) or there is no window.
- Page (re)load (e.g. HMR) kills all ptys, forgets content tokens and closes docs (watchers): fresh UI has no tiles. On `did-navigate` (committed), so blocked navigations don't.
- Why: node-pty callbacks into a torn-down JS env abort the process (`2026-10-09-electron-crash-on-quit.md`).

## Build

- electron-vite: `main`, `preload` (CJS `index.cjs`), `renderer`. Alias `@core` → `src/core`. Main's build also bundles viewers (`src/viewers/` → `out/viewers/`, IIFE).
- `postinstall`: rebuild node-pty and `tie-peer` (`native/peer`) for Electron; `dev/brand-electron.sh` renames dev bundle to "Tie" (menu name).
