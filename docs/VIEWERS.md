# Viewers

File kinds besides markdown (`MARKDOWN.md`): text, image, hex. Each = the shared file view (`TILES.md` "File view") + a viewer pipeline in a sandboxed frame (`src/viewers/<kind>.html|ts`). Read-only, live, no network.

## Which kind shows a file (`core/kinds.ts`, main `docs.ts` `fileViewer`)

1. By extension: `.md`, `.markdown` → markdown; `.png .jpg .jpeg .gif .webp .avif .svg .ico .bmp` → image.
2. Else by content (sniff, first 8 KB): UTF-8 without NUL → text; else → hex.

- Folders, missing files: error (`tie open` exit 1; drops: modal). No "No viewer" for files any more.
- Size caps (policy `maxBytes`): markdown 8 MB, text 10 MB, hex 16 MB, image 50 MB. Over: "File too large: <path> (max N MB)" (CLI, drops, picker); a file growing past it: change ignored.
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

## Scenarios

- `text`, `image`, `hex`: functional (kinds by content, highlighting, live, keys, fit/actual, virtualization, templates).
- `sec-viewers`: hostile text literal (HTML, escapes, bidi), SVG with scripts/handlers/external refs inert (no probe hit), caps (CLI errors), templates refusing other kinds.

## Limitations

- Text: no wrapping, no search; 10 MB × one element per line is slow-ish to diff (≈200k lines).
- Hex: no selection across the virtualized edge; no editing, no search, no jump-to-offset.
- Image: no zoom steps beyond fit / 100%; animated formats animate (browser default).
