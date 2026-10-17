# Viewers

File kinds besides markdown (`MARKDOWN.md`): text, image, hex (Tie viewers: the shared file view, `TILES.md` "File view", + a viewer pipeline in a sandboxed frame, `src/viewers/<kind>.html|ts`) and html (the file is the page). Read-only, live, no network.

## Which kind shows a file (`core/kinds.ts`, main `docs.ts` `fileViewer`)

1. By extension: `.md`, `.markdown` → markdown; `.png .jpg .jpeg .gif .webp .avif .svg .ico .bmp` → image; `.html`, `.htm` → html.
2. Else by content (sniff, first 8 KB): UTF-8 without NUL → text; else → hex.

- Folders, missing files: error (`tie open` exit 1; drops: modal). No "No viewer" for files any more.
- Size caps (policy `maxBytes`): markdown 8 MB, text 10 MB, html 10 MB (the page; its folder's files: none), hex 16 MB, image 50 MB. Over: "File too large: <path> (max N MB)" (CLI, drops, picker); a file growing past it: change ignored.
- Opening as a kind (shelf template + picker; main `canOpenAs`): the file's own kind; hex for any file; text for any file that sniffs as text (e.g. markdown or SVG source). Else tile error "Can't open as <kind>".
- Picker filters: the kind's extensions (markdown, image); text and hex: any file.
- Links in documents (`classifyLink`): kind by extension only; files whose kind is decided by content stay ignored by markdown links until cross-kind routing (P5).

## Text (`viewers/text.ts`)

- Payload: UTF-8 text over the port.
- Lines: one element per line (live diff blocks) beside a gutter of line numbers (one text node, sticky on horizontal scroll). No wrapping. Monospace tile font (`--mono`, `--size`).
- Highlighting: highlight.js (shared `highlight.ts` subset) by file name: extension as language/alias (`ts`, `py`, `rs`, `json`, `yaml`, `sh`...), a few mapped (`mjs`/`jsx` → javascript, `tsx` → typescript, `h` → c, `toml` → ini, `svg`/`htm` → xml, `Makefile`, `Dockerfile`, `.bashrc`...). Files over 512 KB: plain (cost). Multi-line tokens split per line (spans closed and reopened).
- Literal: escaped (or highlight.js-escaped) text only. Control characters → Control Pictures (`␛`, `␇`, `␀`...); bidi overrides/isolates (U+202A–202E, U+2066–2069) → `⟨U+202E⟩`; both in red (`.ctl`). CRLF = line end.
- Live (`live.ts`): changed lines marked, view never moves, edge markers, `n` (as markdown, `MARKDOWN.md` "Live updates").
- Keys: Shift+↑/↓ third-page scroll, `n`, `cmd+R` reload (page render, scroll kept). Links: not clickable (v1).
- Empty file: "(empty file)".
- Harness: `window.text` (`rev`, `key`, `text`, `lang`, `highlighted`, `lines`, `renders`, `marks()`).

## Image (`viewers/image.ts`)

- Payload: none. The doc message carries `src` (the file's path on the frame's token: root = its directory); the viewer loads `<img src=tie-content://<token>/<name>?v=<rev>>` (CSP `img-src` own token).
- SVG: as `<img>` only: no scripts, no event handlers, no external loads (image context). Never inlined.
- Fit (default): shrink to the tile, never enlarge; centered on a checkerboard (theme colors). Click or `z`: actual size (scrolls; the clicked point stays under the pointer). Info corner: `W × H` (+ `· N%` when shrunk).
- Change on disk: new revision → loaded off-screen, swapped in when decoded (no flash), mode kept.
- Not decodable: "Can't show this image" (tile stays).
- Harness: `window.image` (`rev`, `src`, `mode`, `natural {w, h}`, `loads`, `errors`).

## Hex (`viewers/hex.ts`)

- Payload: bytes. Main reads a `Buffer` → IPC (`Uint8Array`) → file view keeps it; each send posts a copy with its buffer transferred (no string conversion, no second copy on the port).
- Rows: `offset  16 bytes (8 + 8)  ASCII`. Zero bytes dim; non-printables `.` (dim); printable ASCII escaped. No ligatures.
- Virtualized: a full-height spacer, only rows in view ±10 in the DOM, redrawn on scroll/resize/theme. Row height = root line height rounded to px (`--rh`), so computed positions match layout. Above 16 M px: scroll position maps proportionally. `overflow-anchor: none`.
- Live: redrawn in place (scroll kept); rows whose bytes changed highlighted for 4 s.
- Empty file: "(empty file)" (note: an empty file sniffs as text, so it opens as text unless picked with the hex template).
- Harness: `window.hex` (`rev`, `size`, `first`, `drawn`, `rowH`, `changed`, `draws`).

## Html (`renderer/kinds/html.ts`, `viewers/html-bootstrap.ts`, `main/content.ts`)

The file is the page; its scripts run (decision 2026-10-16). Isolated, local only.

| Property | How |
|---|---|
| Own origin | frame `sandbox="allow-scripts allow-same-origin"` on `tie-content://<token>/`: modules, storage, fetch work; cross-origin to the shell (`tie://app`) and every other tile: parent/top unreachable, sandbox can't be lifted |
| No network | document CSP (`documentCsp`, `core/policy.ts`): only `'self'` (+ `data:`/`blob:` for styles, images, fonts, media; `blob:` workers); scripts `'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'`; no frames, objects, forms, `<base>`. Plus the shell session has no network at all (dead proxy, WebRTC without UDP: `main/security.ts` `noNetwork`): WebRTC escapes every CSP |
| Folder | root = the file's directory (token); files under it (subfolders too) served with the same CSP (`DOC_TYPES`; others `application/octet-stream`); traversal, symlinks out, `/_tie/` refused |
| Navigation | nav lock `within-root`: `.html`/`.htm` of its own root only (`navAllowed`). Away (http(s), `file:`, other schemes): the shell CSP `frame-src` refuses → main reports `did-fail-provisional-load` → the tile reloads its page; > 3 in 10 s → error "Page keeps navigating away". Other tokens, `/_tie/`: cancelled by the nav lock (frame stays) |
| Requests | bootstrap only: `ready`, `pong`, `followLink` (link clicks, `window.open`, `target=_blank`). Page scripts share its realm: hostile by assumption |
| Popups | no `allow-popups`; `window.open` replaced by the bootstrap (request, returns `null`) |

- Bootstrap: built ASCII-only (`esbuild charset ascii`), no `</script`/`<!--` (main refuses it otherwise), injected inline first in `<head>` (else after `<html>`, the doctype, a BOM: `bootstrapAt`). Header charset = the document's declared one (`htmlCharset`: the bootstrap can push `<meta charset>` past the 1024-byte prescan). Captures `addEventListener`, `postMessage`, `stopImmediatePropagation`... before page scripts run. Handshake listener: capture phase, first, stops propagation: the page never sees the port (tested).
- Links (bootstrap click listener, bubble phase on `window`): clicks the page didn't `preventDefault`, not `#` or `javascript:` (the page's own). Host routing (`follow`): `/x` = the root's; own-origin URLs → paths; then `classifyLink`:
  - html file, plain click → this tile (history push). Same root (subfolders too): same token, `frame.load`. Other folder: new token (`setRoot`).
  - other files (any kind, main decides), or new-tile requests (cmd-click, `target`, `window.open`) → beside, at most one per second per tile.
  - http(s) → confirm dialog "Open in browser?" with the full URL (`.dialog.external-open`), Cancel focused (Enter cancels); one at a time (others dropped while open) → `openExternal`.
  - anything else → refused (`debug security`).
- Gesture rule (`frame.ts`): `followLink` only while the frame is focused (or within 150 ms: a click's focus can lag its request across processes). Scripts in a focused page can still post: hence the confirm and the throttle.
- History: host list. Host navigations (links, back/forward, reload) set the page first; the page's own navigations (script, links it handled) arrive from main (`did-frame-navigate` → `content:navigated`) → location follows, new entry. `cmd+[` / `cmd+]` / `cmd+R`; location not editable.
- Watchdog: a closed port is a navigation if a `load` follows within 5 s, else "Page crashed". Hung: as viewers.
- Live reload: main watches the root folder (non-recursive `fs.watch`, 150 ms debounce) → `content:changed` → page reloaded (+100 ms), activity mark. Scroll kept across reloads (bootstrap: `sessionStorage`, same path only).
- Storage: per token origin (localStorage, IndexedDB, sessionStorage work). A reopened file (or another folder) = a new token: empty. Not removed from disk on close (see Limitations).
- Title = file name; dir / cwd = the root. Harness: `tie list --json` `page {path, url, ready, reloads, history}`; `h.htmlFrame(ctx, id)` = the page's realm.

## Scenarios

- `text`, `image`, `hex`: functional (kinds by content, highlighting, live, keys, fit/actual, virtualization, templates).
- `sec-viewers`: hostile text literal (HTML, escapes, bidi), SVG with scripts/handlers/external refs inert (no probe hit), caps (CLI errors), templates refusing other kinds.
- `html`: siblings (scripts, modules, CSS, fetch, XHR), in-folder / subfolder / other-folder navigation, back/forward, script navigation followed, other kinds beside, web confirm (Cancel / Open), anchors, live reload (page, sibling) with scroll kept, cmd+R, fresh storage on reopen.
- `sec-html`: exfiltration (CSP violation per vector + probes untouched, WebRTC STUN/TURN), confirm paths, gesture, shell/port/other tokens/traversal/`/_tie/`, navigation away and loops, opaque frames can't fetch.

## Limitations

- Text: no wrapping, no search; 10 MB × one element per line is slow-ish to diff (≈200k lines).
- Hex: no selection across the virtualized edge; no editing, no search, no jump-to-offset.
- Image: no zoom steps beyond fit / 100%; animated formats animate (browser default).
- Html storage stays on disk after close: Chromium's data removal (`session.clearData` / `clearStorageData`, with or without origin filters) skips the custom scheme (verified 2026-10-17); keyed `tie-content://<token>/^0tie://app` in the profile's `WebStorage`. Unreachable (tokens are never reused), but not deleted (`PENDING.md`).
- Html: no per-file persistent storage; no network, no server features (POST, routing); media without range requests (seeking may fail); subfolder changes don't reload; no title from `<title>`.
