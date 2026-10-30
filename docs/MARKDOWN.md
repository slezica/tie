# Markdown

Live, read-only view of a `.md` / `.markdown` file. A file kind (`TILES.md` "File view"): the shared file view + the markdown viewer pipeline; renders in a sandboxed frame; main owns every read and watch. Nothing writes the file (edit it in an editor: `cmd+D`).

## Parts

| Part | Where | Does |
|---|---|---|
| Kind | `renderer/kinds/index.ts` | `fileKind('markdown', icon)`: file view + viewer name + icon (one line) |
| File view | `renderer/fileview.ts` | doc + frame per tile; links, history, nav, theme (`TILES.md`) |
| Viewer | `src/viewers/markdown.html\|ts`, `mermaid.ts` | pipeline: markdown-it → highlight.js → DOMPurify → Mermaid (on demand); on `runtime.ts`, `live.ts`, `highlight.ts` |
| Docs | `main/docs.ts` | `doc:*` IPC: file check, open + watch, picker (no writes) |
| Watcher | `main/watch.ts` | directory watch, debounce, stable reads, revisions (unit-tested on real files) |
| Pure | `core/kinds.ts`, `core/links.ts`, `core/policy.ts` | extension → kind, `noViewer`; `classifyLink`; policy row (CSP, cap) |
| Opening | `driver.ts` (`tie add`), `files.ts` (drops), `drag.ts` (file template + picker) | |

## Flow

1. Mount: `tie.doc.open(path, 'markdown')` → main checks (absolute, regular file, markdown extension), reads (≤ 8 MB, policy row), watches → `{id, kind, text, rev}`. Error → `showError`.
2. Frame: root = the file's directory (`tie.content.open`). On each handshake (`onReady`): theme, then doc.
3. Host → viewer (port): `{type: 'theme', dark, vars}`, `{type: 'doc', key, text, rev, scroll: keep|top|restore, hash, y?}` (`y`: the host's remembered scroll for `restore` when the viewer's own memory is gone: viewer reloaded), `{type: 'scroll', hash}`.
4. Viewer → host: `followLink {href, newTile}` (gesture verb, `TILES.md`); `pong` (watchdog).
5. Changes: main pushes `doc:changed(id, {text, rev} | {missing: true})` → kind → viewer: live update ("Live updates" below). Shelved tile: activity dot.
6. Close: `tie.doc.close(id)` (watch stops), frame disposed (token forgotten).

- Revision: first 16 hex of the SHA-256 of the file's bytes.

## Rendering (viewer)

- markdown-it `html: false` (raw HTML shown as text), `linkify`. DOMPurify on the final HTML (after every plugin and the highlighter): no `style`, forms, `style` attributes; ids/names prefixed `user-content-` (no DOM clobbering); URLs http(s), `tie-content://`, relative.
- Tasks: list items starting `[ ]` / `[x]` → display-only box (`disabled`, no pointer, flat glyph; checked = accent ✓). Clicking does nothing.
- Headings: GitHub-style slug ids (anchors).
- Footnotes (`markdown-it-footnote`): `[^x]` refs, `[^x]: ...` notes, `^[inline]`. Ids `fn1` / `fnref1` (prefixed like headings): ref and back-ref scroll in-page.
- Definition lists (`markdown-it-deflist`): `Term` then `: definition` → `<dl>`.
- Emoji (`markdown-it-emoji`, full set): `:name:` shortcodes only; emoticons (`:)`, `<3`) and unknown names stay text.
- Front matter: a leading `---` block closed by `---` / `...` → `<pre class="front-matter">` (muted, monospace), text as-is, never parsed. Unclosed or not at line 1: ordinary markdown.
- No typographer: quotes and dashes as typed.
- Plugins: markdown-it org only, exact versions, bundled into the viewer; output still goes through DOMPurify.
- Code: highlight.js core + common languages (bash, c, cpp, css, diff, dockerfile, go, ini, java, javascript, json, makefile, markdown, python, ruby, rust, shell, sql, swift, typescript, xml, yaml; their aliases). Fenced blocks with a known language only; no auto-detect.
- Diagrams: ```` ```mermaid ```` fences → SVG ("Diagrams" below).
- Images: relative paths inside the file's folder → `tie-content://<token>/<path>`. Remote, `data:`, absolute, or leaving the folder (`../`) → placeholder (`🖼 alt`, URL as tooltip); no `<img>`, no request.
- Style: `<style nonce>` in `src/viewers/markdown.html` (markdown typography); shared parts injected by their modules (base colors, selection, focus: `runtime.ts`; marks: `marks.ts`; code tokens: `highlight.ts`). Theme vars set via CSSOM (`--bg`, `--fg`, `--accent`, `--a0..--a15` ANSI, `--font` = UI's `--ui-font`, `--mono` = tile font stack, `--size` = tile font size). Derived colors: `color-mix`. Code tokens → the theme's `code` colors when it has them (`--code-<token>` vars), else the ANSI palette. Typography after Pico CSS v2 (`2026-10-28`, showcase of 15 stylesheets): root font-size = `--size` × `--scale` (1.15), line-height 1.5; type sizes in em (h1 2em … h6 1em, code 0.875em), spacing in rem (`--space` = 1rem: blocks one unit below, headings 1.5–3 units above after a block, list items a quarter), so the root knob scales everything. Definition lists: half a unit between terms, a quarter between definitions. Every size and spacing is a `:root` variable at the top of the sheet (list and meanings: `2026-10-28-markdown-typography.md` "Variables"); tweak there, not in the rules.
- Scroll: live updates never move the view ("Live updates"); top on a new page; on back/forward restored if the frame didn't reload (same directory).
- Harness view: `window.markdown` (`port`, `rev`, `key`, `text`, `renders`, `md`, `sanitize`, `sanitizeSvg`, `diagrams`, `marks()` → `{marked, unseen}`).

## Diagrams (`viewers/mermaid.ts`)

- Fence ```` ```mermaid ```` → `<div class="diagram"><pre class="diagram-src">source</pre></div>` (escaped, sanitized with the page). After the page is in place, each block renders in this frame (no other frame).
- Library: `@mermaid-js/tiny` 12.2.0 (exact pin, devDependency): flowchart, sequence, class, state, ER, gantt, pie, gitGraph and the rest, minus mindmap, architecture, KaTeX. Copied as-is to `out/viewers/markdown-mermaid.js` (2.8 MB, 0.75 MB gzip). Loaded lazily: only when a document has a diagram, as `<script nonce>` (page nonce, read from `document.currentScript`). Served from `/_tie/` to markdown tokens only (`viewerFile`).
- Config: `startOnLoad: false`, `securityLevel: 'strict'`, `htmlLabels: false` (+ `flowchart.htmlLabels`), `suppressErrorRendering`, `deterministicIds`, `theme: 'base'` + `themeVariables` from the tile theme (hex mixed in JS: Mermaid computes shades; ANSI palette for pie / gitGraph / scales).
- `secure` (no `%%{init}%%` override): `securityLevel`, `startOnLoad`, `maxTextSize`, `maxEdges`, `suppressErrorRendering`, `htmlLabels`, `flowchart`, `theme`, `themeVariables`, `themeCSS`, `fontFamily`, `altFontFamily`, `fontSize`, `darkMode`, `deterministicIds(Seed)`, `arrowMarkerAbsolute`.
- Limits: `maxTextSize` 50 000 chars (Mermaid draws a "Maximum text size" notice), `maxEdges` 500 (error). Anything slower: the frame watchdog (`TILES.md`): tile error "Viewer stopped responding".
- Output: DOMPurify again (SVG + filters profile; no HTML, `foreignObject`, `use`, `<image>`; links http(s)/relative). `<style>` kept: the diagram's colors (scoped to its id). Needs inline styles: markdown frame CSP `style-src 'unsafe-inline'` (`SECURITY.md`).
- Error: source stays as code, plus one line `Diagram error: <first line> <last line>` (theme red).
- Theme change: every diagram re-renders. A newer render (doc change, theme) stops older ones.
- Image shapes (`@{ img: ... }`): the CSP blocks the image (never requested) → error line.
- Links in diagrams (`click X href`): through `followLink` like any link (http(s) only).
- Harness: `window.markdown.diagrams` (`loaded`, `renders`, `errors`, `config`), `sanitizeSvg`; app log `[content] viewer markdown-mermaid.js` per load.

## Links (`core/links.ts` `classifyLink`, file view's `follow`)

| href | Plain click | Cmd-click |
|---|---|---|
| `#anchor` | scroll (viewer) | same |
| `http(s)://` | system browser (`openExternal`) | same |
| relative / absolute path to `.md` / `.markdown` | open in this tile (history push) | new tile beside (`besidePlacement`) |
| other local file (another kind, or kind by content) | new tile beside, in its kind (main decides: `doc.viewer`); not openable → dialog | same |
| anything else (`file:`, `javascript:`, custom schemes, `//host`) | refused (`debug security`) | same |

- Paths resolve against the current file, percent-decoded; query ignored, hash kept (scroll after load).
- Missing target: modal "Can't open link".
- Another directory: frame reloads on a new token (`frameSurface.setRoot`).

## Live updates (`viewers/markdown.ts` `show`, `live.ts` `place`, `marks.ts`)

The file changed on disk (same document, `scroll: keep`): the view never moves.

1. Build off-screen: sanitized HTML; each top-level block keyed `data-k` = hash of its HTML (diagram: of its source; `blockHash`) + occurrence. Diagrams from a cache (same source + theme → same SVG); new ones rendered off-screen first, so a block changes once.
2. Diff in (`morphdom` 2.7.8, keyed): same key = same content, block left alone (same node); new keys inserted; gone keys removed.
3. Anchor: the first block on screen that survives keeps its on-screen position (`scrollBy` by its shift). Manual, `overflow-anchor: none`: native scroll anchoring didn't hold (`markdown-live`: content moved ~80 px on insert above, morphdom moves nodes) and never applies at scroll 0. Text inserted inside the view pushes what's below it; the top stays.
4. Marks: blocks with new keys get a bar in the left margin (`--change`, from `--accent`). It fades 3 s after the block was seen (half of it on screen, or a third of the view for tall blocks; page visible), not after the render: off-screen changes stay marked. Deleted blocks: no mark.
5. Edge markers: "▲ changed above" / "▼ changed below" while unseen changes exist that way. Click: jump to the nearest one.
6. `n` (frame focused, no modifiers): newest unseen change to a third from the top (page ends clamp). Each jump marks it seen: repeated `n` walks unseen changes, newest update first, document order within one. None unseen: the newest still-marked one.

- Pages (open, links, back/forward) replace the document and clear marks; diagrams finishing later swap in by the same diff (anchored, unmarked). Theme change: same (diagrams re-render).
- Limits: a shelved (hidden) tile's frame still reports visible: changes seen while shelved may fade unseen (activity dot still marks the tile). Identical blocks match by occurrence: duplicates may shift marks.

## History and nav bar

- Per tile: list + index. Push drops forward entries.
- Nav bar (`TILES.md` "Navigation"): the file's path (not editable), back / forward, reload.
- `cmd+[` / `cmd+]` (`nav-back` / `nav-forward`): history step; no-op at the ends. `cmd+R` (`nav-reload`): read the file again, render it as a page, scroll kept. `cmd+L`: nothing (location not editable).
- Shift+Up / Shift+Down (viewer, frame focused): scroll a third of the tile height. Plain arrows: browser step.

## Read-only

- Decision 2026-10-16: tiles never write the file. Task-box write-back (`toggleTask`) removed: request verb, validator, handler, `doc:toggle` IPC, bridge method, main write path.
- A write-shaped message from the frame is an unknown verb: dropped, logged (`sec-markdown`).

## Watching (`main/watch.ts`)

- Watch the file's directory and the real file's directory (`fs.watch`, FSEvents). Event for its name (or unnamed) → debounce 100 ms, max 500 ms.
- Read: stat-read-stat; changed in between → retry (≤5, then accept).
- Missing: re-check at +100, +300 ms (backup-rename writers), then report missing once; keep watching. Last render stays (frozen). Back → reported even if unchanged.
- Report only on hash change. Backstop poll 2.5 s (stat; full read if moved); re-arms watchers when a directory was replaced or removed.
- FSEvents misses changes in the first moments after a watch starts: the poll catches those.
- Max: the kind's `maxBytes` (policy row; markdown 8 MB). Opening a larger file: error; growing past it: change ignored.

## Opening

| How | Result |
|---|---|
| `tie add <path>` | `CLI.md`: path against the caller's cwd; missing / folder / too large → error, exit 1 |
| Finder drop on board or shelf (not on a terminal) | like a template drop at that point; folder / too large → modal |
| Template `file` (toolbar) | dropped → file picker (main dialog, any file; markdown by extension); cancel → nothing |
| `cmd+D` on a markdown tile | terminal in the file's directory |

- Harness: picker answered by the dev socket method `pick {path|null}` (`h.pickNext`), never a dialog (`TIE_BACKGROUND`).

## Logs

- `docs` (main): open, change, missing, close, picker. `markdown` (renderer): navigation, links opened beside, drops. `security`: dropped requests (unknown verbs, e.g. write-shaped), refused links, requests without focus.

## Limitations

- Images outside the file's folder (`../img.png`) never load (root = the file's directory).
- Diagram SVG ids aren't prefixed (Mermaid's CSS and markers reference them): they could shadow undefined `window` names. The viewer reads no such globals (`window.mermaid` is set before any diagram exists).
- Mermaid's "neo" drop shadows use its own gray, not the theme.
- Missing file: no visual mark yet (frozen render).
- Scroll memory lost when the frame reloads (history across directories → top).
- No search, no outline, no edit, by design (open an editor next to it: `cmd+D`).
- OS drag entering the window straight over a frame: the frame gets it (viewer refuses drops).
