# Viewers

File kinds besides markdown (`MARKDOWN.md`): text, image, hex (Tie viewers: the shared file view, `TILES.md` "File view", + a viewer pipeline in a sandboxed frame, `src/viewers/<kind>.html|ts`) and html (the file is the page). Read-only, live, no network.

## Which kind shows a file (`core/kinds.ts`, main `docs.ts` `fileViewer`)

1. By extension: `.md`, `.markdown` → markdown; `.png .jpg .jpeg .gif .webp .avif .svg .ico .bmp` → image; `.html`, `.htm` → html.
2. Else by content (sniff, first 8 KB): UTF-8 without NUL → text; else → hex.

- Folders, missing files: error (`tie open` exit 1; drops: modal). No "No viewer" for files any more.
- Size caps (policy `maxBytes`): markdown 8 MB, text 10 MB, html 10 MB (the page; its folder's files: none), hex 16 MB, image 50 MB. Over: "File too large: <path> (max N MB)" (CLI, drops, picker); a file growing past it: change ignored.
- Opening as a kind (main `canOpenAs`, checked on every `doc.open`): the file's own kind; hex for any file; text for any file that sniffs as text (e.g. markdown or SVG source). Else "Can't open as <kind>". Every UI path (CLI, drops, the `file` template) uses the file's own kind.
- File template picker: any file.
- Links in documents (`classifyLink`): same kind (by extension) → in the tile; any other file → beside, in the kind main decides (extension, else content). Html ↔ markdown both ways (`markdown-links`).

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
- Empty file: "(empty file)" (note: an empty file sniffs as text, so it opens as text).
- Harness: `window.hex` (`rev`, `size`, `first`, `drawn`, `rowH`, `changed`, `draws`).

## Html (`renderer/kinds/html.ts`, `viewers/html-bootstrap.ts`, `main/content.ts`)

The file is the page, static (decision 2026-10-21): its own scripts never run. The document CSP allows scripts only by the per-response nonce, which only Tie's bootstrap carries: no inline handlers, no `<script>`, no modules, no workers; links, the hover strip, live reload, scroll keep and the watchdog work through the bootstrap. A page that has scripts gets a red, non-interactive "Scripts blocked" tag in its title bar (the bootstrap counts `script-src` CSP violations → `blocked` verb; `tie list` `page.blocked`). Dynamic pages: serve them and open a browser tile.

| Property | How |
|---|---|
| Own origin | frame `sandbox="allow-scripts allow-same-origin"` on `tie-content://<token>/`: modules, storage, fetch work; cross-origin to the UI (`tie://app`) and every other tile: parent/top unreachable, sandbox can't be lifted |
| No network | document CSP (`documentCsp(nonce)`, `core/policy.ts`): only `'self'` (+ `data:`/`blob:` for styles, images, fonts, media); scripts `'nonce-<response>'` (the bootstrap only); no workers, frames, objects, forms, `<base>`. Plus the UI session has no network at all (dead proxy, WebRTC without UDP: `main/security.ts` `noNetwork`): WebRTC escapes every CSP |
| Folder | root = the file's directory (token); files under it (subfolders too) served with the same CSP (`DOC_TYPES`; others `application/octet-stream`); traversal, symlinks out, `/_tie/` refused |
| Navigation | nav lock `within-root`: `.html`/`.htm` of its own root only (`navAllowed`). Away (http(s), `file:`, other schemes): the UI CSP `frame-src` refuses → main reports `did-fail-provisional-load` (with the URL) → the tile fails at once: "Page navigated away: <url>" (no reload; decision 2026-10-21). Other tokens, `/_tie/`: cancelled by the nav lock (frame stays) |
| Requests | bootstrap only: `ready`, `pong`, `followLink` (link clicks, `window.open`, `target=_blank`), `hover` (pointer over a link → the tile's link strip), `blocked` (count of scripts the CSP refused). Page scripts never run; the bootstrap's requests are still treated as hostile |
| Popups | no `allow-popups`; `window.open` replaced by the bootstrap (request, returns `null`) |

- Bootstrap: built ASCII-only (`esbuild charset ascii`), no `</script`/`<!--` (main refuses it otherwise), injected inline first in `<head>` (else after `<html>`, the doctype, a BOM: `bootstrapAt`). Header charset = the document's declared one (`htmlCharset`: the bootstrap can push `<meta charset>` past the 1024-byte prescan). Captures `addEventListener`, `postMessage`, `stopImmediatePropagation`... before page scripts run. Handshake listener: capture phase, first, stops propagation: the page never sees the port (tested).
- Links (bootstrap click listener, bubble phase on `window`): clicks the page didn't `preventDefault`, not `#` or `javascript:` (the page's own). Host routing (`follow`): `/x` = the root's; own-origin URLs → paths; then `classifyLink`:
  - html file, plain click → this tile (history push). Same root (subfolders too): same token, `frame.load`. Other folder: new token (`setRoot`).
  - other files (any kind, main decides), or new-tile requests (cmd-click, `target`, `window.open`) → beside, at most one per second per tile.
  - http(s) → `external.ts` confirm dialog (`TILES.md` "Links out"; the html note names the folder the page can read) → `openExternal`.
  - anything else → refused (`debug security`).
- Gesture rule (`frame.ts`): `followLink` only while the frame is focused (or within 150 ms: a click's focus can lag its request across processes). The confirm and the throttle stay as defense in depth (a renderer bug in the page's process would get the bootstrap's powers).
- History: host list. Host navigations (links, back/forward, reload) set the page first; the page's own navigations (script, links it handled) arrive from main (`did-frame-navigate` → `content:navigated`) → location follows, new entry. `cmd+[` / `cmd+]` / `cmd+R`; location not editable.
- Watchdog: a closed port is a navigation if a `load` follows within 5 s, else "Page crashed". Hung: as viewers.
- Live reload: main watches the root folder (non-recursive `fs.watch`, 150 ms debounce) → `content:changed` → page reloaded (+100 ms), activity mark. Scroll kept across reloads (bootstrap: `sessionStorage`, same path only).
- Storage: per token origin (localStorage, IndexedDB, sessionStorage, Cache Storage work), in the UI's in-memory session: never on disk, gone at quit (`sec-storage`). A reopened file (or another folder) = a new token: empty.
- Title = the file name, never the page's `<title>` (2026-10-20: content can't label its tile); dir / cwd = the root. Harness: `tie list --json` `page {path, url, ready, reloads, scripts, history}`; `h.htmlFrame(ctx, id)` = the page's realm.

## Scenarios

- `text`, `image`, `hex`: functional (kinds by content, highlighting, live, keys, fit/actual, virtualization, file template).
- `sec-viewers`: hostile text literal (HTML, escapes, bidi), SVG with scripts/handlers/external refs inert (no probe hit), caps (CLI errors), main refusing files as other kinds.
- `html`: sibling CSS, in-folder / subfolder / other-folder navigation, back/forward, page navigation (meta refresh) followed, other kinds beside, web confirm (Cancel / Open), anchors, live reload (page, sibling) with scroll kept, cmd+R, fresh storage on reopen.
- `html-static`: no inline / file / module scripts, no handlers; CSS applies; the "Scripts blocked" tag (not a toggle), none on a script-free page; bootstrap links and strip work; title never from `<title>`.
- `sec-html`: exfiltration (CSP violation per vector + probes untouched, WebRTC STUN/TURN), confirm paths, gesture, UI/port/other tokens/traversal/`/_tie/`, navigation away and loops, opaque frames can't fetch.

## Limitations

- Text: no wrapping, no search; 10 MB × one element per line is slow-ish to diff (≈200k lines).
- Hex: no selection across the virtualized edge; no editing, no search, no jump-to-offset.
- Image: no zoom steps beyond fit / 100%; animated formats animate (browser default).
- Html: no per-file persistent storage; no network, no server features (POST, routing); media without range requests (seeking may fail); subfolder changes don't reload.
