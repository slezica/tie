# Tiles

Every tile kind plugs into one host. The host owns the element, title bar, nav bar, error state and the security baseline; a kind supplies a `Surface` for the body.

A new content kind needs: a policy row (`core/policy.ts`), a `KindSpec` (`kinds/index.ts`), and (Tie viewers) a viewer pipeline (`src/viewers/<kind>.html|ts`). File kinds also map extensions (`core/kinds.ts`) and build on the file view.

## Host (`renderer/tile.ts`)

- `createTile(kind, opts)`: element (title bar, `.body`, `.rz` handles), `Host`, kind's `Surface` from the registry (`kinds/index.ts`), nav bar if the surface has `nav`.
- `mountTile()` → `Surface.mount()`; then `ResizeObserver` on `.body` → `Surface.resize()` (not after a failed mount).
- `disposeTile()` → `Surface.dispose()`, element removed, `S.tiles` entry dropped.
- `displayTitle` / `displayIcon`: custom first, else `Surface.title()` / `icon()`.

| `Host` (to the kind) | Does |
|---|---|
| `id`, `body` | tile id; the kind's area |
| `alive()` | tile still open (async work re-checks) |
| `changed()` | automatic title/icon/dir/navigation changed → `refreshTitle` (+ nav bar) → `tile-meta` |
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
| `info?()` | extra `tie list --json` fields (terminal: `term`; file views: `doc`) |
| `nav?` | navigation (`Nav`, below): nav bar, `cmd+[` / `cmd+]` / `cmd+R` / `cmd+L` |

## Navigation (`renderer/nav.ts`)

`Surface.nav?: Nav` = `{state(), back(), forward(), reload(), go?(input)}`; `state()` → `{location, back, forward, editable}`.

- Nav bar: compact row (`--nav-h`) under the title bar: back / forward / reload buttons + location field. Only for surfaces with `nav` (terminals: none). Hidden when collapsed. Refreshed on `host.changed()`.
- Buttons never take focus (keys stay with the content). Disabled at the ends.
- Location: read-only unless `editable` (then Enter → `go(input)`, Escape restores). Read-only paths scroll to their end (file name).
- Keys (`INPUT.md`): `nav-back` / `nav-forward` / `nav-reload` / `nav-location` act on the active tile; no-op without `nav`; `cmd+L` no-op unless editable.

## Kind registry (`renderer/kinds/index.ts`)

`KindSpec {kind, factory, opens: 'bare' | 'file', template?: {label, icon}}`. `registerKind(spec)`; `kindSpec(kind)`, `needsFile(kind)`, `templates()`.

| Reader | Uses |
|---|---|
| `tile.ts` | `factory` |
| `shelf.ts` | `template` (shelf templates, registry order) |
| `driver.ts` `resolveOpen` | known kind; `opens: 'file'` → "shows a file: tie open <path>" |
| `drag.ts` | template drop: `'file'` → picker (main, filtered by the kind's extensions) |
| `keys.ts` | `cmd+D` on a `'file'` kind splits a terminal |

## Kinds (`renderer/kinds/`)

| Kind | Realm | Notes |
|---|---|---|
| `terminal` | shell (trusted) | xterm + pty; the one exception to "content never in the shell realm" (`TERMINALS.md`) |
| `markdown` | content frame | file view + markdown viewer (`MARKDOWN.md`) |
| `probe` | content frame | dev builds only (registered at boot if `info.dev`); harness kind for escape tests |

- `tie open <kind>` accepts registered kinds; `'file'` kinds only with a path (`tie open <path>`, drops, template + picker).
- Files → kinds (`core/kinds.ts`): by extension (`fileKind`; `.md`, `.markdown` → markdown); `extsOf(kind)` (picker filters). Sniff rule (`sniff`: first 8 KB UTF-8 without NUL → text, else binary) implemented and tested; not routed yet (P2): unknown files still error "No viewer for .x".

## Policy table (`core/policy.ts`)

The one reviewable security table for content kinds. Every frame-hosted kind has a row; nothing else decides these.

| Field | markdown | probe (dev) | Read by |
|---|---|---|---|
| `page` | `viewer` | `viewer` | `viewerFile`, build (`viewerKinds`) |
| `sandbox` | `allow-scripts` | `allow-scripts` | `frame.ts` |
| `styles` (CSP `style-src`) | `inline` | `nonce` | `contentCsp` |
| `nav` (nav lock) | `viewer-exact` | `viewer-exact` | `navAllowed` (`core/content.ts`) |
| `assets` (`/_tie/`) | `markdown-mermaid.js` | — | `viewerFile` |
| `payload` | `text` | `none` | `main/docs.ts` |
| `maxBytes` | 8 MB | 0 | `main/docs.ts`, `watch.ts` |
| `dev` | no | yes | `viewerKinds` (main serves dev rows in dev builds only) |

- `contentCsp(policy, nonce, token)`: `default-src 'none'`; scripts by nonce; styles by nonce or `'unsafe-inline'` (no nonce beside it); `img-src` own token; no frames, objects, `<base>`, forms.
- Unit tests pin every row and each CSP string exactly (`policy.test.ts`).
- Later rows (plan): text, image, hex (viewers), html (`page: 'document'`, `within-root`).

## File view (`renderer/fileview.ts`)

`fileView(host, opts, {kind, icon})` → `Surface`. A file kind is this plus its viewer (`kinds/markdown.ts` is one line).

- Doc: `tie.doc.open(path)` (main checks, reads, watches; payload + cap from the policy row) → `{id, text, rev}`; changes pushed (`doc:changed`) → viewer `{type: 'doc', key, text, rev, scroll, hash}` + shelf activity; missing → last render frozen; close on dispose.
- Frame: root = the file's directory; another directory → `setRoot` (new token). Each handshake: theme message, then the doc.
- History: list + index; push drops forward entries. `nav`: location = path (not editable), back / forward, reload (re-read the file, render as a page, scroll kept; no history entry).
- Links (`core/links.ts` `classifyLink`): anchor → viewer scrolls; web (http(s)) → `openExternal`; file of this kind → this tile (cmd: new tile beside); file without a viewer or of another kind → ignored (`debug <kind>`; cross-kind: P5); refused → `debug security`.
- Title = file name; `dir` / `cwd` = its directory; `info` → `doc {path, rev, missing, history}`.
- Theme message (`themeMessage`): `--bg`, `--fg`, `--accent`, `--a0..15`, `--font`, `--mono`, `--size`, `dark`.

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
| `followLink` | `href` (string, ≤ 4096), `newTile` (bool); gesture | file views: `classifyLink` → browser / this tile / new tile ("File view") |

- Plain objects only (prototype `Object.prototype`), own keys, exact key set per verb. Returns a fresh object.
- New verb: type + validator in `VERBS`, unit test, kind handler, main re-validation if it reaches main.

## Content protocol (`main/content.ts`, `core/content.ts`)

`tie-content://<token>/`: `standard`, `secure`; no `corsEnabled`, `supportFetchAPI`, `bypassCSP`.

| Path | Serves |
|---|---|
| `/_tie/<kind>.html` | viewer page; `%NONCE%` replaced per response; CSP `contentCsp` (policy row) |
| `/_tie/<kind>.js` | viewer script (IIFE bundle) |
| `/_tie/<asset>` | the kind's listed assets only (policy `assets`: markdown → `markdown-mermaid.js`) |
| other | file inside the root (`contentFile`, then real path inside real root) |

- Token: 128-bit random hex, minted so the URL keeps it (all-digit hosts become IPv4). Registry: token → `{root (real path), kind, frame}`.
- Refused (404 + `[security] refused content <why>`): unknown token, non-GET, root itself, `/_tie/` names other than the kind's (page, script, listed assets), traversal/encodings, symlinks out, non-files.
- Headers: `nosniff`, `no-store`; root files `CSP: default-src 'none'; sandbox`.
- Viewer CSP: from the policy row (above). Markdown: `style-src 'unsafe-inline'` instead of the style nonce (Mermaid's SVG; `MARKDOWN.md` "Diagrams").
- Frame nav lock (`contentFrameAllowed`, from `will-frame-navigate`): the kind's nav rule (`navAllowed`; `viewer-exact`: exact viewer URL) of a registered token, direct child of the shell, first frame binds the token.
- Served viewer kinds: `viewerKinds(dev)` (dev-only rows in dev builds only).
- Closed tile / shell reload: token forgotten.

## Viewers (`src/viewers/`)

- `<kind>.html` (script tag with `nonce="%NONCE%"`) + `<kind>.ts` → `out/viewers/` (vite plugin in `electron.vite.config.ts`, built with main; kinds = the policy table's viewer rows).
- Classic IIFE: opaque-origin frames can't load module scripts or `fetch` from `tie-content:` (no CORS). Content text goes over the port.
- Shared modules (a viewer = its pipeline on top):

| Module | Does |
|---|---|
| `runtime.ts` | `startViewer(spec, extra)`: handshake (`tie:init` from `parent`, one port), `pong`, theme vars (CSSOM) → `onTheme`, `scroll` → anchor, other messages → `onMessage`; link clicks: always `preventDefault`, with `links` → anchors scroll, rest `followLink` (click handler only); `Shift+↑/↓` third-page scroll; plain `keys`; auxclick / drop guards; `style(css)` (nonce'd `<style>`); base CSS (colors, selection, focus). Harness: `window.viewer` = `window[name]` |
| `live.ts` | `createLive(root, {blockHash, volatile})`: `key(next)` (data-k = hash + occurrence), `place(next, page\|live\|quiet)` (morphdom keyed diff, manual anchoring, marks), `renders`, `next` (`n`), `hash` |
| `marks.ts` | change marks, edge markers, `n` walk (own CSS) |
| `highlight.ts` | highlight.js core + common languages; `highlight(code, lang)`; token colors (own CSS) |

- `probe`: own minimal handshake (no runtime: the attacker's seat). `window.probe = {port, received, inits}`. Scenarios run code in it (`h.probeFrame`).
- `markdown`: pipeline only: markdown-it + DOMPurify; Mermaid on demand (`mermaid.ts` + asset `markdown-mermaid.js`, copied from `@mermaid-js/tiny`); `window.markdown` for the harness (`MARKDOWN.md`).
- Styles: `<style nonce="%NONCE%">` in the page (kind typography) + shared modules' `style()`; values from the host via CSSOM (style attributes are blocked by the CSP).

## Limitations

- OS drags entering straight over a frame go to the frame (a drop there can only try to navigate it: nav lock).
- Gesture rule checks focus, not a fresh click: script in a focused frame could post at any time. Today only our viewers run script in frames.
