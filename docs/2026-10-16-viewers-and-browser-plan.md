# Viewer kinds and browser tile

## Idea

- New kinds: text, image, hex (Tie viewers for local files), html (the local file is the page), browser (remote web).
- One architecture for all: shared host, two container families, per-kind policy in one table.
- Extract what markdown proved generic before adding kinds, so each new kind is small.

## Decisions (user, 2026-10-16)

- Anything that would open a new browser tab/window → system browser. In-page navigation stays in the tile.
- Local HTML: scripts on by default. No network.
- Wanting more than live reload by rewriting files → run a server, use a browser tile.
- Threat model: viewing is safe, running is a choice, content never reaches the shell.

## Decisions (autonomous, to confirm)

- Unknown extensions: UTF-8 without NUL → text; else → hex. Folders still error. "No viewer" disappears for files.
- In-tile navigation only within one kind. A link to another kind opens a new tile beside (like cmd-click).
- HTML: external opens (link to http, `target=_blank`, `window.open`) ask first (shell dialog showing the URL). Scripts can fire them without the user: confirm closes the exfiltration path. Markdown/text keep direct opens (no document scripts).
- Browser: persistent shared partition `persist:browser` (logins survive), per instance. Popups → system browser only within ~1 s of real user input in that guest (main sees guest input); else blocked + logged.
- Browser downloads: saved to ~/Downloads (unique name), never opened.
- Address bar: http(s) only; bare `host[/path]` → `https://`; no search.
- Keys: cmd+R reload, cmd+L focus location (any kind with navigation).
- Size caps: text 10 MB, hex 16 MB, image 50 MB (over cap: error state).

## Architecture

### Layers

| Layer | Shared | Per kind |
|---|---|---|
| Host (`tile.ts`) | element, title bar, placement, focus, errors, nav bar | — |
| Container | content frame (`frame.ts`) / guest page (`guest.ts`) | — |
| Source | file view (`fileview.ts`) / document page / URL | — |
| Renderer | viewer runtime (`src/viewers/runtime.ts`), live diff + marks | markdown, text, image, hex pipelines |
| Policy | `core/policy.ts` (one table) | one row per kind |

### Kinds

| Kind | Container | Source | Code that runs | Network | Navigation | Requests |
|---|---|---|---|---|---|---|
| markdown | frame, opaque | Tie viewer | viewer (nonce) | none | host history | followLink, pong |
| text | frame, opaque | Tie viewer | viewer (nonce) | none | host history | followLink, pong |
| image | frame, opaque | Tie viewer | viewer (nonce) | none | host history | pong |
| hex | frame, opaque | Tie viewer | viewer (nonce) | none | host history | pong |
| html | frame (origin: spike S1) | the file | document + bootstrap | none | within its folder | pong |
| browser | `<webview>`, own partition | URL | the site | full | native, http(s) | none (no channel) |
| terminal | shell realm | pty | — | — | — | — |

### Components

Renderer (shell):
- `kinds/index.ts`: `KindSpec { kind, factory, opens: 'bare' | 'file' | 'url', template? }`. Replaces `NEEDS_FILE` and the shelf's template list.
- `nav.ts`: navigation capability + nav bar UI. `Surface.nav?: { state(), back(), forward(), reload(), go?(input) }`; host draws back / forward / reload + location (editable if `go`) under the title bar. Replaces `Surface.history`. Keys cmd+[ / cmd+] / cmd+R / cmd+L.
- `frame.ts`: content frame (exists). Sandbox flags from the policy table.
- `fileview.ts`: file-backed tiles. Doc open/watch/close, history, folder (token) switching, link routing, missing → frozen, activity, title/dir/cwd, theme message, nav. A file kind = file view + viewer name + payload (text | bytes).
- `guest.ts`: browser container. `<webview>` element (never re-parented), focus, pointer shield, title, nav via webview API, crash/unresponsive → host error.

Pure core (unit-tested):
- `core/kinds.ts`: file kind by extension; sniff rule for the rest (text / hex).
- `core/policy.ts`: per content kind: viewer or document, CSP builder, sandbox flags, same-origin, nav rule (viewer-exact | within-root), assets, payload, size cap.
- `core/links.ts`: link classification for all file kinds (replaces `classifyLink` in `core/markdown.ts`): anchor | web | file(path, kind) | refused.

Main:
- `docs.ts`: open/watch with payload text | bytes, per-kind caps; `fileViewer` uses `core/kinds` + sniff.
- `content.ts`: serving from the policy table; html documents with their CSP, bootstrap injected, navigation within root.
- `guest.ts`: webview attach guard (shell main frame only; prefs rebuilt: no preload, sandbox, isolation, partition), guest guards (http(s) navigation only, popups → system browser with gesture check, downloads), keys via `keys.ts`.

Viewers (frame):
- `runtime.ts`: handshake, pong, theme vars, message dispatch, link clicks → requests, scroll keys, drop/aux-click guards, harness state.
- `live.ts`: keyed block diff, anchoring, change marks (from markdown + `marks.ts`). Used by markdown and text.
- `highlight.ts`: shared highlight.js subset (markdown fences, text files).
- `markdown.ts`, `text.ts`, `image.ts`, `hex.ts`: pipelines only.
- `html-bootstrap.ts`: injected into html documents: handshake + pong only.

## Dependency graph

```
P0 spikes ──────────────┬──────────────► P3 html
                        └──────────────► P4 browser
P1 foundations ─┬► P2 text, image, hex
  (policy, kinds, ├► P3 html
   runtime, live,  └► P4 browser (nav bar)
   fileview, links,
   KindSpec, nav)
P2, P3, P4 ──────────────────────────────► P5 integration
```

Order: P0 → P1 → P2 → P3 → P4 → P5. P0 de-risks P3/P4 designs. P1 before any new kind (no copies of markdown code). P2 validates the framework cheaply. P4 last of the kinds: the most different, needs the nav bar.

## Plan

### P0: runtime spikes (keep each as a scenario or harness check)

1. S1: html frame with its own origin (`allow-scripts allow-same-origin` on `tie-content://<token>`): out of process from the shell? same-origin `fetch`, module scripts, `localStorage` work? parent unreachable? Versus opaque (modules/fetch fail). Decides html's origin.
2. S2: popups from a sandboxed frame with `allow-popups`: does `setWindowOpenHandler` fire with the URL? Are popups without user activation blocked by Electron/Chromium?
3. S3: same-tab navigation of a frame to http(s): `will-frame-navigate` sees it, URL available, deniable.
4. S4: `<webview>`: enable `webviewTag`, attach guard, guest `before-input-event`, layering (menus, floats, shelf reveal over it), focus events, harness reach (CDP target), partition persistence, crash events.
5. S5: guest popups: `setWindowOpenHandler` on guest; user-activation signal or main-side input timing.

### P1: foundations (refactor, no behavior change; all scenarios green)

1. `core/policy.ts` + `core/kinds.ts` (+ sniff); `content.ts`, `frame.ts`, `docs.ts` read from them.
2. Viewer `runtime.ts` + `live.ts` + `highlight.ts` extracted; markdown viewer on top.
3. `fileview.ts` + `core/links.ts` extracted; markdown kind on top.
4. `KindSpec` registry; shelf templates from it.
5. Nav capability + nav bar; markdown uses it (path, back/forward); keys cmd+R / cmd+L.

### P2: text, image, hex

1. text: highlight by extension, line numbers, live diff + marks, links in text not clickable (v1).
2. image: fit / actual size toggle, reload on change, SVG as `<img>` (inert).
3. hex: offset / bytes / ASCII, virtualized rows, bytes over the port.
4. Fallback: unknown files → text or hex by sniff. Help, docs.
5. Scenarios per kind; escape checks (SVG with script inert; hostile text not interpreted).

### P3: html

1. Document serving with html CSP (from S1); bootstrap injected; storage cleared on close.
2. Navigation within its folder; other kinds → new tile; external → confirm → system browser.
3. `sec-html`: exfiltration attempts (fetch / img / beacon / websocket / form / location / window.open), parent access, other tokens, traversal.

### P4: browser

1. Main `guest.ts`; `webviewTag` on; attach guard; guest guards; downloads; keys.
2. `guest.ts` surface; nav bar with address; `tie open <url>` / `tie open browser [url]`; template.
3. `sec-browser`: guest can't reach shell, `tie:`, `tie-content:`, `file:`; popups only with gesture → system browser; permissions denied; partition isolated from default session.

### P5: integration

1. Cross-kind link routing (markdown → html/text/image; html → markdown).
2. Docs: `TILES.md`, `SECURITY.md` rows, new `VIEWERS.md` (or per kind), `CLI.md`, help; `PENDING.md` cleanup.

## Results

(filled during execution)
