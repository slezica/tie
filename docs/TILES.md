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
| `info?()` | extra `tie list --json` fields (terminal: `term`) |

## Kinds (`renderer/kinds/`)

| Kind | Realm | Notes |
|---|---|---|
| `terminal` | shell (trusted) | xterm + pty; the one exception to "content never in the shell realm" (`TERMINALS.md`) |
| `probe` | content frame | dev builds only (registered at boot if `info.dev`); harness kind for escape tests |

- Registry: `KINDS` (`kinds/index.ts`), `registerKind()` for dev-only kinds. `tie open <kind>` accepts registered kinds.

## Content kinds: frame host (`renderer/frame.ts`)

`frameSurface(host, {viewer, root, title, icon, handlers})`. A content kind gives only these.

1. `mount`: `tie.content.open(root, viewer)` → main registers `root` under a fresh token → `{token, url}` (or `{error}` → `host.error`).
2. `<iframe class="content" sandbox="allow-scripts" allow="" referrerpolicy="no-referrer" src=url>` in the body (fills it).
3. On each `load`: new `MessageChannel`; `tie:init` + one port posted to that iframe's `contentWindow` (`'*'`: opaque origin). Old port closed.
4. Viewer answers `{verb: 'ready'}` within 5 s, else `host.error('Content did not load')`.
5. Requests: port → `parseRequest` (`core/requests.ts`) → `handlers[verb]` → IPC → main (re-validates). Invalid or unhandled: dropped, `debug('security', ...)`.
6. `dispose`: port closed, iframe removed, `tie.content.close(token)`.

- No window `message` listener in the shell: requests arrive over the port only.
- Focus: a click in a frame gives the shell no `pointerdown`; `initFrames()` activates the tile on window `blur` when `document.activeElement` is its iframe (same shelf rule as pointerdown).
- Keys: shortcuts are matched in main (`INPUT.md`), so they work while a frame has focus; frames never see them.
- Pointer shield: `track()` sets `body.tracking` from pointerdown; `body.tracking .body iframe` and `body.dragging .body` ignore the pointer. Pointer capture does not hold over out-of-process frames.

## Requests (`core/requests.ts`)

| Verb | Args | Handled by |
|---|---|---|
| `ready` | — | host (clears load timer) |
| `openLink` | `url` (string, ≤ 4096) | kind; probe → `tie.openExternal` (main: http(s) only) |

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

## Limitations

- Frame renderer crash: not detected (no per-frame crash event); tile stays blank.
- OS drags entering straight over a frame go to the frame (a drop there can only try to navigate it: nav lock).
- `openLink` has no user-gesture requirement yet (markdown phase decides link policy).
