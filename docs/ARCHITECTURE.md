# Architecture

## Processes

| Process | Code | Owns |
|---|---|---|
| Main | `src/main/` | Window, menu, ptys, socket, settings file, instance files, viewer files (`docs.ts`: check, open, watch, picker walks; read-only) |
| Preload | `src/preload/index.ts` | `window.tie` bridge (sandboxed, CJS build) |
| Renderer | `src/renderer/` | All UI state, DOM, xterm. Source of truth; main holds no layout state |
| Content frames | `src/viewers/` (served by `main/content.ts`) | Content tiles: sandboxed iframes on `tie-content://<token>/`, own process, opaque origin (html: own token origin), no bridge (`TILES.md`) |
| Browser guests | `src/renderer/guest.ts`, `src/main/guest.ts` | Browser tiles: `<webview>` webContents on `persist:browser`, no bridge, no Tie protocols (`BROWSER.md`) |
| Core | `src/core/` | Pure logic, no DOM/Electron, unit-tested (`*.test.ts`), alias `@core`; used by main, renderer or both (file list: `AGENTS.md` "Files") |

- Window: `sandbox`, `contextIsolation`, `webviewTag` (guests only via `attachGuest`), CSP `script-src 'self'`, served from `tie://app/`, session `tie-ui` (in memory, no network). One per instance. Guards: `SECURITY.md`.
- Sessions: `tie-ui` (UI + content frames: in memory, dead proxy, Tie's protocols); `persist:browser` (guests: on disk, network, no Tie protocols). Permissions denied on both.
- Menu: no `windowMenu` (its cmd+W would close the window). Quit's chord (the `quit` binding, default cmd+Q) shown but not registered (main's `keys.ts` matches it, guests included). Shortcuts: `before-input-event` in main (`INPUT.md`). Reload/DevTools in dev only.
- Data flow: input (mouse/keys/socket) → `ops.ts` → `S` → `render()` → DOM.

## IPC (`window.tie`, `src/preload/index.ts`)

- Invoke (returns): `app:info` → `{instance, socket, home, cwd, debugTags, dev}`, `content:open(root, kind, page?)` → `{token, url}` or `{error}`, `doc:viewer(path, kind?)` → `{kind, path}` or `{error}`, `doc:open(path, kind)` → `{id, kind, rev, text? | bytes?}` (payload per policy) or `{error}`, `doc:pick(defaultPath)` → path or null (`doc:*` read-only: no writes), `doc:walk(dir, {gen, gitignore})` → `{ok: true}` or `{error}` (picker walk: absolute normalized existing dir; one per window, a new one stops the previous; `main/walk.ts`), `settings:get|set|ignore|reload|recreate` (`SETTINGS.md` "File"), `ui:get` → `{bars}` (bar sizes from the UI state file, at boot), `ui:bar-sizes(patch)` → the sizes in force (a resize ended; main cleans the payload and writes the file: `LAYOUT.md` "Bar sizes"), `pty:spawn` → pid or `{error}`, `pty:cwd` → fresh `lsof` cwd, `pty:busy(pids)` → `{[pid]: {busy, proc}}` (≤ 256 pids; `TERMINALS.md` "Busy"), `guest:unload(id)` → `'closed'|'blocked'|'gone'` (`BROWSER.md` "Leaving a page").
- Main → renderer: `app:ask-quit` (quit requested: ask), `pty:data|exit|process|cwd`, `doc:changed(id, {rev, text? | bytes?} | {missing})`, `doc:walk-chunk(gen, {paths, done, partial?, waiting?, errors?})` (≤ 1024 paths or every 16 ms; last `done`), `content:navigated|navfailed|changed|viewer` (`viewer`: dev rebuild), `guest:unresponsive|download|popup|prevent-unload`, `settings:open`, `settings:file {changed, path}`, `keys:action` (shortcuts, `INPUT.md`), `keys:capture {chord, complete}` (capture fields), `rpc:request` (socket calls, `CLI.md`).
- Renderer → main (send): `pty:write|resize|kill`, `content:close|kill`, `doc:close`, `doc:walk-stop(gen)` (that gen's walk only; window close and UI reload stop all), `guest:download-ok|leave`, `keys:suspend`, `window:borderless-preview`, `external:open`, `renderer:ready`, `app:quit`, `rpc:reply`, `log`.
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
| UI state | `<state>/<instance>.ui.json`: `{bars: {top, bottom, left, right}}` (bar sizes). Main only (`main/uistate.ts`): read at start, written at a resize's end; not settings (no panel, banner, Save); a bad file → defaults, no dialog. Harness instances remove theirs at launch and stop |
| Debug port | dev builds only: `TIE_DEBUG_PORT`, else `9300 + hash(instance) % 600` (can collide; `tie-dev` passes a free one) |
| userData | `<appData>/tie-<instance>` (own single-instance lock; `Partitions/browser`: browser tiles) |

Other env (main):

- `TIE_CWD`: app cwd `S.cwd`, for tiles from nothing: boot, new tab (default: home; `DIRECTORIES.md`).
- `TIE_DOWNLOADS` (dev builds only): browser downloads folder (harness instances; default `~/Downloads`).
- `TIE_BACKGROUND=1`: offscreen, no dock icon, never focused (`HARNESS.md`). `TIE_BACKGROUND=hidden`: same, but a real never-shown window (input routes into content frames). `TIE_SCALE`: offscreen device scale (default 1).
- `TIE_DEBUG=tag,...|*`: tagged logs. Main: `app`, `content`, `docs`, `guest`, `keys`, `pty`, `rpc`, `walk`. Renderer (via `log` IPC): `app`, `content`, `external`, `files`, `guest`, `html`, `layout`, `nav`, `picker`, `pty`, `rpc`, `shelf`, file kinds (`markdown`, `text`, `image`, `hex`). Always on: `security`, `update` (staged update swap).

## Startup

1. Main (packaged): staged update (`tie-dev install` while Tie ran) swaps in, then relaunches (`main/update.ts`, `PACKAGING.md` "Install while running").
2. Main: name, userData, debug port; single-instance lock (held → exit 1).
3. `whenReady`: menu (+ keymap from settings `bindings`), `tie://` and `tie-content://` protocols, window (shown on `ready-to-show` unless background), settings file watch, socket.
4. Renderer `boot()`: info + settings, UI state (bar sizes), appearance, init modules, open one terminal, `ready()`; then the settings load dialog if the file didn't load (`SETTINGS.md` "File").
5. Main writes the info file only after `ready()`. Socket calls wait for it. So harness/CLI never race startup.

## Quit

- Asks first, always: cmd+Q (`quit` action → `askQuit`), menu Quit and window close (red button: `close` prevented) send `app:ask-quit` directly. Anything else reaching `before-quit` unconfirmed (Dock, logout, signals: Electron turns SIGTERM / SIGINT into `app.quit()`, Node never sees them) is prevented and asks too, except in background (harness) instances: there signals stop Tie.
- `askQuit` (`renderer/quit.ts`): `.dialog.quit` "Quit Tie?", Quit / Cancel (Enter / Esc). Busy terminals (`TERMINALS.md` "Busy"), any tab, shelf included: "Currently running:" + `title — command`, grouped by tab when there are several tabs. No tiles: still asks. Then each browser page's beforeunload (`BROWSER.md`; Stay aborts). Confirmed → `app:quit`. While any dialog is open: nothing (no second dialog).
- Confirmed (`app:quit` → `quitNow`) or unasked (background, UI not up: booting, reloading, crashed; no window): `before-quit` proceeds: remove socket + info file, `pty.killAll()` (SIGKILL after 1.5 s), `app.exit(0)`.
- A visible instance under SIGTERM shows the question (a second signal: Electron exits). `tie-dev stop`: the UI's own `tie.quit()` over the debugging port (`lib.mjs` `quitInstance`), else SIGTERM.
- Page (re)load (e.g. HMR) kills all ptys, forgets content tokens, closes docs (watchers) and stops picker walks: fresh UI has no tiles. On `did-navigate` (committed), so blocked navigations don't.
- Why: node-pty callbacks into a torn-down JS env abort the process (`2026-10-09-electron-crash-on-quit.md`).

## Build

- electron-vite: `main`, `preload` (CJS `index.cjs`), `renderer`. Alias `@core` → `src/core`. Main's build also bundles viewers (`src/viewers/` → `out/viewers/`, IIFE; `dev/viewers.mjs`, also the hot-mode watcher).
- `postinstall`: `patch-package` (node-pty patch), `install-electron`, rebuild node-pty and `tie-peer` (`native/peer`) for Electron; `dev/brand-electron.sh` renames dev bundle to "Tie" (menu name).
