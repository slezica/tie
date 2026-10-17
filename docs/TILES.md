# Tiles

Every tile kind plugs into one host. The host owns the element, title bar, error state and the security baseline; a kind supplies a `Surface` for the body.

## Host (`renderer/tile.ts`)

- `createTile(kind, opts)`: element (title bar, `.body`, `.rz` handles), `Host`, kind's `Surface` from the registry (`kinds/index.ts`).
- `mountTile()` → `Surface.mount()`; then `ResizeObserver` on `.body` → `Surface.resize()` (not after a failed mount).
- `disposeTile()` → `Surface.dispose()`, element removed, `S.tiles` entry dropped.
- `displayTitle` / `displayIcon`: custom first, else `Surface.title()` / `icon()`.

| `Host` (to the kind) | Does |
|---|---|
| `id`, `body` | tile id; the kind's area |
| `alive()` | tile still open (async work re-checks) |
| `changed()` | automatic title/icon/dir changed → `refreshTitle` → `tile-meta` |
| `activity()` | output while shelved (shelf mark) |
| `exit(code)` | content ended: `✓` / `✗ N` |
| `error(msg)` | `showError`: message replaces the content |
| `close()` | close the tile |

| `Surface` (from the kind) | Used by |
|---|---|
| `mount`, `resize`, `dispose` | host lifecycle |
| `focus()` → bool | `refocus()`, `openTile` |
| `title()`, `icon()` | title bar, shelf, tabs, `tie list` |
| `dir?()`, `cwd?()` | tab titles; new tiles split from it (`cwdOf`) |
| `paste?(text)`, `drop?(dataTransfer)` | `paste.ts` routing |
| `appearance?()` | settings changes (`appearance.ts`) |
| `info?()` | extra `tie list --json` fields (terminal: `term`; markdown: `doc`) |
| `history?(step)` | `cmd+[` / `cmd+]` (markdown) |

## Kinds (`renderer/kinds/`)

| Kind | Realm | Notes |
|---|---|---|
| `terminal` | shell (trusted) | xterm + pty; the one exception to "content never in the shell realm" (`TERMINALS.md`) |
| `markdown` | content frame | live read-only file view, links, history (`MARKDOWN.md`) |
| `probe` | content frame | dev builds only (registered at boot if `info.dev`); harness kind for escape tests |

- Registry: `KINDS` (`kinds/index.ts`), `registerKind()` for dev-only kinds. `tie open <kind>` accepts registered kinds.
- `needsFile(kind)` (markdown): opened only with a path (`tie open <path>`, drops, template + picker); `cmd+D` on it splits a terminal.

## Content kinds: frame host (`renderer/frame.ts`)

`frameSurface(host, {viewer, root, title, icon, handlers, onReady?})` → `FrameSurface` (= `Surface` + `post(msg)`, `setRoot(root)`). A content kind gives only these.

1. `mount`: `tie.content.open(root, viewer)` → main registers `root` under a fresh token → `{token, url}` (or `{error}` → `host.error`).
2. `<iframe class="content" sandbox="allow-scripts" allow="" referrerpolicy="no-referrer" src=url>` in the body (fills it).
3. On each `load`: new `MessageChannel`; `tie:init` + one port posted to that iframe's `contentWindow` (`'*'`: opaque origin). Old port closed.
4. Viewer answers `{verb: 'ready'}` within 5 s, else "Content did not load". Each `ready` → `onReady()` (kind sends content).
5. Requests: port → `parseRequest` (`core/requests.ts`) → gesture rule → `handlers[verb]` → IPC → main (re-validates). Invalid, unhandled or refused: dropped, `debug('security', ...)`.
6. `post(msg)`: host → viewer over the port (dropped before the handshake).
7. `setRoot(root)`: new token for another directory, same iframe (`src` changes; nav lock binds the new token to it), old token closed. Handshake again.
8. `dispose`: port closed, iframe removed, `tie.content.close(token)`.

### Watchdog (`frame.ts`, timing in `core/watchdog.ts`)

| Failure | Detected by | Tile shows |
|---|---|---|
| Hung (busy loop, runaway layout, OOM) | `{type: 'tie:ping', n}` every 1 s (one outstanding); no `pong {n}` within 5 s, and 10 s since the last `post` (render grace) | "Viewer stopped responding" |
| Crashed (renderer process died) | port `close` event (the viewer's end went away) | "Viewer crashed" |
| No handshake | no `ready` within 5 s | "Content did not load" |

- Every viewer answers `tie:ping` with `pong` (same `n`) from its message handler.
- On failure: watchdog stopped, port closed, iframe removed, error shown. Hung: `tie.content.kill(token)` first: main SIGKILLs the frame's process if it holds nothing else (not the shell's, not shared with another frame), then forgets the token. A stuck thread never handles the shutdown a removed frame would get: it would burn a core forever.
- No automatic reload: a document that hung or crashed the viewer would do it again. The user reopens the tile.
- Sleep / throttling: a tick > 3 s late (machine slept, hidden window throttled) restarts the ping, no verdict.
- Own process per frame (`sec-content-escape`): the shell and other tiles keep running while one spins (`content-watchdog`).
- A viewer paused in DevTools (breakpoint) for > 5 s counts as hung.

- No window `message` listener in the shell: requests arrive over the port only.
- Gesture rule: verbs acting for the user (`gesture` in `VERBS`: open a link, write a file) only while the tile's iframe is `document.activeElement` (the user clicked or typed in it; VS Code's rule). Viewers post them from click handlers only.
- Focus: a click in a frame gives the shell no `pointerdown`; `initFrames()` activates the tile on window `blur` when `document.activeElement` is its iframe (same shelf rule as pointerdown).
- Keys: shortcuts are matched in main (`INPUT.md`), so they work while a frame has focus; frames never see them.
- Pointer shield: `track()` sets `body.tracking` from pointerdown; `body.tracking .body iframe` and `body.dragging .body` ignore the pointer. Pointer capture does not hold over out-of-process frames.

## Requests (`core/requests.ts`)

| Verb | Args | Handled by |
|---|---|---|
| `ready` | — | host (clears load timer) |
| `pong` | `n` (int ≥ 0) | host (watchdog) |
| `openLink` | `url` (string, ≤ 4096); gesture | kind; probe → `tie.openExternal` (main: http(s) only) |
| `followLink` | `href` (string, ≤ 4096), `newTile` (bool); gesture | markdown: `classifyLink` → browser / this tile / new tile (`MARKDOWN.md`) |

- Plain objects only (prototype `Object.prototype`), own keys, exact key set per verb. Returns a fresh object.
- New verb: type + validator in `VERBS`, unit test, kind handler, main re-validation if it reaches main.

## Content protocol (`main/content.ts`, `core/content.ts`)

`tie-content://<token>/`: `standard`, `secure`; no `corsEnabled`, `supportFetchAPI`, `bypassCSP`.

| Path | Serves |
|---|---|
| `/_tie/<kind>.html` | viewer page; `%NONCE%` replaced per response; CSP `contentCsp` |
| `/_tie/<kind>.js` | viewer script (IIFE bundle) |
| other | file inside the root (`contentFile`, then real path inside real root) |

- Token: 128-bit random hex, minted so the URL keeps it (all-digit hosts become IPv4). Registry: token → `{root (real path), kind, frame}`.
- Refused (404 + `[security] refused content <why>`): unknown token, non-GET, root itself, `/_tie/` names other than the kind's, traversal/encodings, symlinks out, non-files.
- Headers: `nosniff`, `no-store`; root files `CSP: default-src 'none'; sandbox`.
- Viewer CSP: `default-src 'none'`, scripts/styles by nonce, images from own token only, no frames/objects/forms/`<base>`.
- Frame nav lock (`contentFrameAllowed`, from `will-frame-navigate`): exact viewer URL of a registered token, direct child of the shell, first frame binds the token.
- Closed tile / shell reload: token forgotten.

## Viewers (`src/viewers/`)

- `<kind>.html` (script tag with `nonce="%NONCE%"`) + `<kind>.ts` → `out/viewers/` (vite plugin in `electron.vite.config.ts`, built with main).
- Classic IIFE: opaque-origin frames can't load module scripts or `fetch` from `tie-content:` (no CORS). Content text goes over the port.
- `probe`: `window.probe = {port, received, inits}`; replies `ready` to `tie:init` from `parent`. Scenarios run code in it (`h.probeFrame`).
- `markdown`: markdown-it + highlight.js + DOMPurify; `window.markdown` for the harness (`MARKDOWN.md`).
- Styles: `<style nonce="%NONCE%">` in the page; values from the host via CSSOM (style attributes are blocked by the CSP).

## Limitations

- OS drags entering straight over a frame go to the frame (a drop there can only try to navigate it: nav lock).
- Gesture rule checks focus, not a fresh click: script in a focused frame could post at any time. Today only our viewers run script in frames.
