# Markdown

Live, read-only view of a `.md` / `.markdown` file, with clickable task boxes. A content kind (`TILES.md`): renders in a sandboxed frame; main owns every read, watch and write.

## Parts

| Part | Where | Does |
|---|---|---|
| Kind | `renderer/kinds/markdown.ts` | doc + frame per tile; links, toggles, history; theme to the viewer |
| Viewer | `src/viewers/markdown.html\|ts` | markdown-it → highlight.js → DOMPurify; clicks → requests |
| Docs | `main/docs.ts` | `doc:*` IPC: file check, open + watch, toggle write, picker |
| Watcher | `main/watch.ts` | directory watch, debounce, stable reads, revisions (unit-tested on real files) |
| Pure | `core/markdown.ts` | `viewerFor`, `noViewer`, `classifyLink`, `toggleTaskLine`, `applyToggle` (unit-tested) |
| Opening | `driver.ts` (`tie open`), `files.ts` (drops), `drag.ts` (template + picker) | |

## Flow

1. Mount: `tie.doc.open(path)` → main checks (absolute, regular file, markdown extension), reads, watches → `{id, text, rev}`. Error → `showError`.
2. Frame: root = the file's directory (`tie.content.open`). On each handshake (`onReady`): theme, then doc.
3. Host → viewer (port): `{type: 'theme', dark, vars}`, `{type: 'doc', key, text, rev, scroll: keep|top|restore, hash}`, `{type: 'scroll', hash}`.
4. Viewer → host: `followLink {href, newTile}`, `toggleTask {line, expected, rev}` (gesture verbs, `TILES.md`).
5. Changes: main pushes `doc:changed(id, {text, rev} | {missing: true})` → kind → viewer (scroll kept). Shelved tile: activity dot.
6. Close: `tie.doc.close(id)` (watch stops), frame disposed (token forgotten).

- Revision: first 16 hex of the SHA-256 of the file's bytes.

## Rendering (viewer)

- markdown-it `html: false` (raw HTML shown as text), `linkify`. DOMPurify on the final HTML (after every plugin and the highlighter): no `style`, forms, `style` attributes; ids/names prefixed `user-content-` (no DOM clobbering); URLs http(s), `tie-content://`, relative.
- Tasks: list items starting `[ ]` / `[x]` → checkbox with `data-line` (source line, from markdown-it's map).
- Headings: GitHub-style slug ids (anchors).
- Code: highlight.js core + common languages (bash, c, cpp, css, diff, dockerfile, go, ini, java, javascript, json, makefile, markdown, python, ruby, rust, shell, sql, swift, typescript, xml, yaml; their aliases). Fenced blocks with a known language only; no auto-detect.
- Images: relative paths inside the file's folder → `tie-content://<token>/<path>`. Remote, `data:`, absolute, or leaving the folder (`../`) → placeholder (`🖼 alt`, URL as tooltip); no `<img>`, no request.
- Style: `<style nonce>` in `src/viewers/markdown.html` (the only place markdown styles live). Theme vars set via CSSOM (`--bg`, `--fg`, `--accent`, `--a0..--a15` ANSI, `--font` = shell's `--ui-font`, `--mono` = tile font stack, `--size` = tile font size). Derived colors: `color-mix`. Code tokens → ANSI palette. Headings 1–1.35em.
- Scroll: kept on reload; top on a new page; on back/forward restored if the frame didn't reload (same directory).
- Harness view: `window.markdown` (`port`, `rev`, `key`, `text`, `renders`, `md`, `sanitize`).

## Links (`classifyLink`, kind's `follow`)

| href | Plain click | Cmd-click |
|---|---|---|
| `#anchor` | scroll (viewer) | same |
| `http(s)://` | system browser (`openExternal`) | same |
| relative / absolute path to `.md` / `.markdown` | open in this tile (history push) | new tile beside (`besidePlacement`) |
| other local file | ignored (`debug markdown`) | same |
| anything else (`file:`, `javascript:`, custom schemes, `//host`) | refused (`debug security`) | same |

- Paths resolve against the current file, percent-decoded; query ignored, hash kept (scroll after load).
- Missing target: modal "Can't open link".
- Another directory: frame reloads on a new token (`frameSurface.setRoot`).

## History

- Per tile: list + index. Push drops forward entries.
- Shift+Up / Shift+Down (viewer, frame focused): scroll a third of the tile height. Plain arrows: browser step.
- `cmd+[` / `cmd+]` (`history-back` / `history-forward`, keymap in main): active tile's `Surface.history(step)`. No-op on other kinds and at the ends.

## Task toggles

1. Click on a box → viewer prevents the toggle, posts `toggleTask {line, expected: that source line, rev}`.
2. Host: gesture rule (frame focused).
3. Main (`toggleTask`): re-reads the file; refuses unless revision = `rev`, line `line` = `expected`, line is a task item (`applyToggle`), and the text round-trips as UTF-8. Writes in place through the real path (symlinks kept). Pushes the new text right away.
4. Refused: `[security] refused toggleTask <why>`; viewer gets the file as it is now.
- The box flips when the file says so.

## Watching (`main/watch.ts`)

- Watch the file's directory and the real file's directory (`fs.watch`, FSEvents). Event for its name (or unnamed) → debounce 100 ms, max 500 ms.
- Read: stat-read-stat; changed in between → retry (≤5, then accept).
- Missing: re-check at +100, +300 ms (backup-rename writers), then report missing once; keep watching. Last render stays (frozen). Back → reported even if unchanged.
- Report only on hash change. Backstop poll 2.5 s (stat; full read if moved); re-arms watchers when a directory was replaced or removed.
- FSEvents misses changes in the first moments after a watch starts: the poll catches those.
- Max 8 MB.

## Opening

| How | Result |
|---|---|
| `tie open <path>` | `CLI.md`: path against the caller's cwd; no viewer / missing / folder → error, exit 1 |
| Finder drop on board or shelf (not on a terminal) | like a template drop at that point; no viewer → modal "No viewer for .xyz" |
| Shelf template `markdown` | dropped → file picker (main dialog, `.md`/`.markdown`); cancel → nothing |
| `cmd+D` on a markdown tile | terminal in the file's directory |

- Harness: picker answered by the dev socket method `pick {path|null}` (`h.pickNext`), never a dialog (`TIE_BACKGROUND`).

## Logs

- `docs` (main): open, change, missing, close, toggled, picker. `markdown` (renderer): navigation, ignored links, drops, toggle refusals. `security`: refused toggles, links, requests without focus.

## Limitations

- Images outside the file's folder (`../img.png`) never load (root = the file's directory).
- Missing file: no visual mark yet (frozen render).
- Scroll memory lost when the frame reloads (history across directories → top).
- No search, no outline, no edit (open an editor next to it: `cmd+D`).
- OS drag entering the window straight over a frame: the frame gets it (viewer refuses drops).
