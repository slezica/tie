# Browser

Browser tiles show the remote web: a `<webview>` guest in the tile's body. A regular browser (network, logins), isolated from Tie: no bridge, no Tie protocols, no local files, no other tile.

## Pieces

| Piece | Does |
|---|---|
| `core/guest.ts` | pure rules: `BROWSER_PARTITION`, `guestNavAllowed`, `guestSrc`, `locationUrl`, `popupVerdict` (+ `POPUP_INPUT_MS`, `GESTURE_INPUTS`), `downloadVerdict` (+ `DOWNLOAD_INPUT_MS`), `downloadName`, `uniqueName`, `pageTitle`. Unit: `guest.test.ts` |
| `main/guest.ts` | `attachGuest` (attach guard), `guardGuest` (per guest: navigation, redirects, shell loads, popups, keys, crash / hang), `initBrowserSession` (downloads, user agent), `noDownloads` (shell session), `noDeviceChoosers` (Bluetooth chooser cancelled), dev socket `guest` |
| `renderer/guest.ts` | `browserKind`: the surface (element, events, title, nav bar, focus, error state); `initGuests` (hang reports) |
| `main/security.ts` | `guard()`: webview contents → `guardGuest`; `will-attach-webview` → `attachGuest` (shell page only) |
| `main/keys.ts` | `watchKeys(wc)`: the shortcut matcher on each guest's own `before-input-event` |

## Guest (`main/guest.ts`)

- Attach (`will-attach-webview` on the embedder): only the shell window's page (`isShellContents`: window/offscreen contents showing the shell URL). Electron sets up `<webview>` in main frames only: content frames (sandboxed, preload-less, out of process) can't create one (`sec-browser`).
- Prefs rebuilt from nothing: `sandbox`, `contextIsolation`, no Node (`nodeIntegration*` off), `webviewTag` off, `webSecurity` on, no insecure content, no experimental features, no navigate-on-drop, safe dialogs, partition `persist:browser`. Every attribute but `src` dropped (`preload`, `nodeintegration`, `webpreferences`, `partition`, `allowpopups`, `disablewebsecurity`, `useragent`, `httpreferrer`, blink features; Electron's internal `instanceId` kept). `src`: http(s) or `about:blank` (`guestSrc`), else refused.
- Navigation (`will-frame-navigate`): main frame http(s) (+ `about:blank`); subframes also `about:`, `data:`, `blob:`. Refused: `file:`, `tie:`, `tie-content:`, `chrome:`, `devtools:`, OS handlers (`mailto:`...: refused v1). Redirects: same rule (`will-redirect`; Chromium itself refuses http → `file:`).
- Shell-started loads (`src`, `loadURL`, back/forward: no `will-frame-navigate`): `did-start-navigation` → refused URL → `stop()` (deferred: stopping inside the event crashes Electron; skipped when `will-frame-navigate` already refused it).
- Popups (`setWindowOpenHandler`): always denied in Tie. http(s) + real input (mouse button, key: `input-event`, `GESTURE_INPUTS`) in that guest within 1 s (`POPUP_INPUT_MS`) → system browser (`openExternal`); else blocked + logged. Main sees input 2–4 ms before a click's popup (S5).
- Keys: `watchKeys(guest)`: same keymap and blocking as the window (`INPUT.md`).
- Crash (`render-process-gone`): logged; the tile shows "Page crashed" (DOM event). Hang (`unresponsive`): shell told (`guest:unresponsive`, by guest id) → "Page stopped responding"; renderer killed (`forcefullyCrashRenderer`; same-site guests sharing the process crash too).

## Partition (`persist:browser`)

- One for all browser tiles, per instance (`<userData>/Partitions/browser`): cookies, storage, logins survive restarts. Never the shell's session (in memory, no network).
- Network: direct. The shell session's dead proxy (`noNetwork`) is not applied here (`sec-browser`: `resolveProxy` shell `PROXY 127.0.0.1:1`, browser `DIRECT`).
- Protocols: none of Tie's (`tie:`, `tie-content:` have no handler on this session: requests fail).
- Permissions: denied (`harden`, every session, this one included: `sec-browser`).
- User agent: Electron's own token removed (sites refuse or degrade "Electron").
- Hovered links (`update-target-url`): shown in the tile's link strip (`Host.hint`, text only).
- Downloads (`will-download`): only within 10 s of real input in that guest (`downloadVerdict`; a script alone plants nothing, logged `blocked download`); saved to `~/Downloads` (dev builds: `TIE_DOWNLOADS`; harness instances set it) under a sanitized (`downloadName`: base name, no controls, no leading dots) unique (`uniqueName`: `a (1).txt`) name; no dialog; never opened. The shell session refuses downloads (`noDownloads`).

## Surface (`renderer/guest.ts`)

- `<webview class="guest">` appended once to the body (never re-parented, like every tile body). Background `--web-canvas` (the web's default white: pages without a background expect it). `setBackgroundColor` on the guest hangs the attach in a real window: not used.
- Title: page title (`page-title-updated`, `pageTitle`: control characters out, 200 chars), else the host, else `browser`. Icon 🧭 (no favicon: v1).
- Nav bar: location = committed URL (`did-navigate`, `did-navigate-in-page`), editable. Enter → `locationUrl`: http(s) as typed, bare `host[:port][/path]` → `https://`, `about:blank`; else dialog "Not a web address" (no search). Back / forward / reload: webview API (no-ops before `dom-ready`).
- Focus: `focus()` → the page; an empty tile (`about:blank`) → its location field (templates, `--focus`). A click in the guest activates the tile (`initFrames` blur handler: `activeElement` = `WEBVIEW`).
- Pointer shield: `body.tracking` / `body.os-drag` / `body.dragging` → `webview` ignores the pointer (`style.css`).
- Split (`cmd+D`): a terminal (kinds that aren't `'bare'` split into terminals).
- Hidden tiles: other tabs (`display: none`) and shelved (`visibility: hidden`) keep the page (no reload: `browser` scenario).
- `tie list --json`: `web {url, title, loading, ready, guest (webContents id), back, forward}`.

## Opening

- `tie open <http(s) URL>`, `tie open browser [url]` (bare host → `https://`; refused: `Not a web address: <url> (http(s) only)`, exit 1). Driver: `resolveOpen` (`locationUrl`), kind `opens: 'url'`.
- Shelf template `browser`: empty tile, location focused.
- Links elsewhere (decision 2026-10-16, unchanged): markdown/text http(s) links → system browser; html → confirm → system browser. Nothing opens a browser tile by itself.

## Scenarios

- `browser`: open, title, real-click link + activation, back/forward (shell keys, guest keys), reload, plain keys / Esc reach the page, cmd+D from the guest, location bar (cmd+L, typed URL, refused input), pointer shield, tab switch / shelve keep the page, template, `tie open browser [url]`, CLI errors.
- `sec-browser`: below (`SECURITY.md` rows).

## Limitations

- No favicon, no search, no find-in-page, no zoom, no devtools for guests, no `mailto:` (refused).
- Popups that need a window (OAuth flows) go to the system browser (`PENDING.md`).
- One shared partition: no per-tile profiles, no private mode.
