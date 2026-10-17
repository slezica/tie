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

## P3 decisions (after P0/P1 review, 2026-10-17)

- Origin: html frames get `allow-scripts allow-same-origin` on their own `tie-content://<token>` (S1). Still a different origin from the shell, its own process; parent unreachable. Updates the SECURITY rule: same-origin only for document kinds, never same as the shell.
- `supportFetchAPI` on `tie-content`: yes (html fetches sibling files). Tests: other tokens refused; opaque viewer frames still can't fetch.
- html CSP: scripts `'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'` (scripts on, isolated: eval adds nothing); styles/images/fonts/media `'self' data: blob:`; `connect-src 'self'`; `worker-src 'self' blob:`; `frame-src 'none'`; `object-src 'none'`; `form-action 'none'`; `base-uri 'none'`. No remote sources anywhere.
- Bootstrap (injected first in `<head>` by main): handshake, pong, link-click interception, `window.open` / `target=_blank` → request. No `allow-popups`.
- Links: every link click → `followLink` → host routing (same as file view): same folder/kind → in-tile with host history; other kind → new tile; http(s) → confirm dialog → system browser. Script-driven navigation within the folder: allowed by the nav lock; host location follows (main reports frame navigations). Script-driven navigation outside: CSP blocks (no request leaves), frame breaks → host reloads the document.
- Watchdog: a frame navigation (port closes, then the frame loads) is not a crash.
- Live reload: watch the page's folder (non-recursive); any change → reload the page (debounced). Bootstrap keeps scroll across reloads (sessionStorage).
- Storage: ephemeral per open, cleared on close. Persistence per file → PENDING.
- Spike hooks (`src/main/spike.ts`, `TIE_SPIKE`): remove once P3/P4 replace them (end of P4).

## Decisions after P2/P3 review (2026-10-17)

- Content storage: shell window on an in-memory session (option a): nothing content stores reaches disk. Protocols, permission handlers and the no-network guard move to / apply on that session. Replaces "clear on close" (infeasible: Chromium won't clear custom-scheme storage).
- Shelf templates: terminal, file (picker → kind by registry/sniff), browser. Not one per kind.
- Dev server exempt from the no-network proxy, exactly its host:port (`<-loopback>` first, then the exemption; reversed order didn't apply). Fixed in review (`24fc420`).
- Harness: instances remove their Electron profile on stop (2,271 leftover profiles deleted). Fixed in review (`4b775db`).

## Results

### P0 spikes (2026-10-16; Electron 44.7.2)

Setup: dev-only hooks in `src/main/spike.ts`, on only for the spikes `TIE_SPIKE` lists (scenario `export const env`; packaged builds never read it). Raw frames / `<webview>`s created by the harness in the shell. Each spike = a scenario asserting what was observed (`HARNESS.md` "Spikes"): re-run after Electron upgrades.

#### S1: html frame with its own origin (`spike-html-origin`, `spike-html-fetch`)

Page = a root `.html` file on a token, P3-like CSP (`default-src 'self'`, inline scripts, `connect-src 'self'`).

| | own origin (`allow-scripts allow-same-origin`) | opaque (`allow-scripts`) |
|---|---|---|
| process | own (≠ shell, ≠ other frames) | own |
| origin | `tie-content://<token>` | `null` |
| parent / top | SecurityError | SecurityError |
| localStorage, IndexedDB | work | SecurityError |
| cookies | silently empty | SecurityError |
| classic `<script src>` | runs | runs |
| `<script type=module src>`, `import()` | work | fail (CORS mode) |
| inline module script | runs | runs |
| XHR same-origin | works | fails |
| `fetch` same-origin | fails ("Failed to fetch") | fails |
| `fetch` with `supportFetchAPI` on the scheme | works; another token's origin refused | fails |
| in-root navigation (`./sub.html`) | `will-frame-navigate` sees it; origin + storage kept | — |

Means for P3:
- html needs its own origin (modules, storage, XHR). Per-token origin keeps tiles apart and the shell cross-origin. Changes the `SECURITY.md` rule "never `allow-same-origin` on content frames": html only, own token.
- Decision (user): register `supportFetchAPI` (no `corsEnabled`) so local pages can `fetch` siblings? Spike: cross-token reads still refused. Without it: `fetch` breaks, XHR works.
- Storage lives in the default session per token origin, on disk: "storage cleared on close" is needed. A reopened file gets a new token: its storage starts empty (decision: acceptable?).
- An own-origin page can XHR anything its token serves, `/_tie/` included: html tokens must serve only the bootstrap there.

#### S2: popups from a frame with `allow-popups` (`spike-frame-popups`)

- With `allow-popups`: `window.open` and `target=_blank` reach the shell's `setWindowOpenHandler` with the URL, **with or without** user activation (Electron has no popup blocker).
- Handler details: `url`, `frameName`, `features`, `disposition` (`foreground-tab`), `referrer` (empty), `postBody`. No opener frame, no activation flag.
- Without `allow-popups`: blocked inside the frame, never reaches the handler (gesture or not).

Means for P3 (proposed change): main can't tell which tile opened a popup, nor whether the user did. So html frames get **no** `allow-popups`; the bootstrap turns `target=_blank` clicks and `window.open` into a port request (gesture rule + confirm dialog, as planned). Scripts then have no popup path at all.

#### S3: same-tab navigation of a frame to http(s) (`spike-frame-nav`)

- `location.href = http…` and link clicks (with gesture): `will-frame-navigate` **never fires**: the shell CSP `frame-src tie-content:` refuses first.
- Main still sees the URL: `did-start-navigation`, then `did-fail-provisional-load` `-30 ERR_BLOCKED_BY_CSP`. The frame ends on `chrome-error://chromewebdata/` (document gone, its port closes).
- In-root `tie-content:` navigation: `will-frame-navigate` fires (nav lock decides).

Means for P3 (proposed change): no deny-then-redirect in main. External links: the bootstrap intercepts link clicks in the page (request → confirm → `openExternal`). Script-driven navigation away breaks only the frame: the host reloads the current page (or shows an error); main may log the URL from `did-fail-provisional-load`. Also: any html navigation (in-root too) closes the port; today's watchdog reads that as "Viewer crashed". P3 must tell navigation (a `load` follows) from a crash.

#### S4: `<webview>` (`spike-webview`, hidden window)

- Attaches and loads with `webviewTag` + an allowing `will-attach-webview`. The shell CSP `frame-src` does **not** apply to guests: the attach guard is the only gate.
- Prefs rebuilt in the attach handler (no preload, sandbox, isolation, partition): guest has no `window.tie`, no `process`. Guest = own webContents, type `webview`.
- Partition `persist:browser`: `<userData>/Partitions/browser`; localStorage and cookies survive a new `<webview>` on the same partition.
- Harness reach: CDP target type `webview`; Playwright (`connectOverCDP`) lists it as a page (evaluate works). Not in `page.frames()`.
- Keys: `guest.sendInputEvent` → the guest's `before-input-event` (not the shell's); CDP keys on the shell page miss the guest. Real OS keys into a focused guest: not reachable by the harness (same gap as frames); the guest's own `before-input-event` is where they show.
- Mouse: main gets the guest's `input-event` (`mouseDown`/`mouseUp`) for real clicks (hidden window) and `sendInputEvent`.
- Focus: a real click in the guest: shell window `blur`, no shell `pointerdown`, `document.activeElement` = `WEBVIEW`. `initFrames()` (iframe only) does not activate the tile. Guest `focus`/`blur` events didn't fire; `isFocused()` false.
- Layering: the shell's tile menu paints over the guest (pixel check). DOM z-order holds.
- Pointer shield: `pointer-events: none` on the `<webview>` → the shell gets the pointer.
- Crash (`forcefullyCrashRenderer`): `<webview>` DOM event `render-process-gone` + main guest `render-process-gone` (`killed`); shell unaffected.
- Not covered: offscreen (default harness) rendering of guests, `unresponsive`, whether `will-attach-webview` tells which frame asked (P4 "shell main frame only").

Means for P4 (adds to the plan): guest keys via the guest's `before-input-event` (keys.ts per guest); `initFrames` also activates on `WEBVIEW`; shield selectors include `webview`; crash → host error from the DOM event; harness drives guests as Playwright pages.

#### S5: guest popups (`spike-guest-popups`, hidden window)

- The guest's `setWindowOpenHandler` fires for `window.open` without activation (page timer) and for clicks (button `onclick`, `target=_blank`). Same detail keys (no activation flag).
- Main-side timing works: the guest's `input-event` arrives 2–4 ms before a click's popup (`sendInputEvent` and real clicks); none before the timer's.

Means for P4: the planned rule (popup → system browser only within ~1 s of real input in that guest, else blocked + logged) is implementable with `input-event`. Harness clicks count as input (fine).

#### P1 assumptions

- None contradicted: P1 touches neither popups, navigation to http, nor webviews.
- Spike hooks stay dev-only (`spike.ts`, env-gated) for the P3/P4 scenarios to build on; remove or replace them there.

### P1 notes (implementation)

- Policy table (`core/policy.ts`): rows markdown, probe; fields `page`, `sandbox`, `styles`, `nav`, `assets`, `payload`, `maxBytes`, `dev`. Only values in use are typed (`page: 'viewer'`, `nav: 'viewer-exact'`, `payload: 'text' | 'none'`); P2/P3 widen them. CSP strings byte-for-byte as before (pinned in `policy.test.ts`). `CONTENT_SCHEME` moved here (renderer-safe); the vite build takes viewer kinds from the table.
- Nav rule pure (`navAllowed`, `core/content.ts`); `contentFrameAllowed` keeps the parent + token binding.
- `core/kinds.ts`: `fileKind` (extension), `extsOf` (picker filter; the picker now takes the kind), `noViewer`, `sniff(sample, size)` (not routed).
- `core/links.ts`: `classifyLink` → `anchor | web | file {path, hash, kind} | refused` (kind null: no viewer). `core/markdown.ts` removed.
- Viewers: `runtime.ts` / `live.ts` / `highlight.ts`; `marks.ts` kept (generic, owns its CSS). Shared CSS moved out of `markdown.html` into the modules (`style()`: nonce'd `<style>`). Markdown rendering pixel-identical before/after (screenshot diff, page + live update). Harness: `window.viewer` = `window.markdown` (same object); scenarios unchanged. Probe keeps its own handshake (attacker's seat).
- File view: links to files of another kind are ignored for now (logged), not opened beside: cross-kind routing stays P5.
- Keymap: `history-back/forward` renamed `nav-back/forward`; new `nav-reload` (cmd+R), `nav-location` (cmd+L). Reload = re-read + page render, scroll kept, no history entry; error dialog "Can't reload".
- Harness gap found and closed: `sec-content-nav` navigated to `package.json` (served as `application/octet-stream` → a download, frame stayed put): a loosened nav lock still passed. Now targets a `text/plain` file; mutation (lock ignoring the URL) → red.
- Flake seen once: `markdown-links` first click in the frame refused "without focus" (hidden window focus timing); passed on reruns.

### P2 notes (implementation, 2026-10-17)

- Kinds: policy rows text (10 MB, text), image (50 MB, payload `none`: `<img>` from its token), hex (16 MB, `bytes`). Payload widened to `text | bytes | none`; bytes: IPC `Uint8Array` → file view keeps it → a copy posted with its buffer transferred (`FrameSurface.post(msg, transfer)`, boundary change).
- Routing: extension first (markdown, image; html in P3), else sniff (main reads 8 KB) → text / hex. "No viewer" gone; errors left: missing, folder, too large (CLI exit 1, drop modal), "Can't open as <kind>" (template on a file of another kind: `canOpenAs`, own / hex for anything / text if text-like).
- Boundary changes: `tie.doc.open(path, kind)` (main checks the tile's kind may show the file), `doc:viewer(path, kind?)`, doc message gains `src` (file's path on the token), `kinds/markdown.ts` replaced by a one-line `fileKind(kind, icon)` registration per file kind. File view link routing unchanged (other kinds ignored: P5).
- Text: one element per line + one-text-node gutter; highlight only ≤ 512 KB (cost); controls → Control Pictures, bidi → `⟨U+XXXX⟩` (Trojan Source visible). `n` order: newest update first, document order within it (as markdown).
- Hex: row height must be computed, not measured from a probe element (probe and rows rounded differently: 17 vs 18 px, drift); `overflow-anchor: none` needed on `:root` (redrawn rows moved the view). Ligatures off.
- Shelf: templates for every file kind (6 with html): picker filter per kind (text / hex: any file).
- Evidence: `sec-viewers` red with escaping removed, controls raw, cap check removed. SVG inertness: by image context (no single mutation reaches it without replacing `<img>` and the CSP): regression check only.

### P3 notes (implementation, 2026-10-17)

- As decided: own token origin, document CSP, `supportFetchAPI`, bootstrap (inline, first in `<head>`), followLink routing, confirm for the web, nav reports from main, navigation ≠ crash (5 s grace for a `load`), folder live reload, scroll kept (sessionStorage).
- Infeasible: **storage cleared on close**. `session.clearData` (any `originMatchingMode`, with origins, excluded origins, or none at all) and `clearStorageData` leave `tie-content` storage untouched (checked: quota DB rows, IndexedDB files, and in-page reads). Storage key is partitioned: `tie-content://<token>/^0tie://app`. Not implemented; options in `PENDING.md`. Isolation still holds (random tokens, never reused; a reopened file starts empty: tested).
- Found: **WebRTC escapes the document CSP**: STUN (UDP) and TURN (TCP) reached local probes from the page; Chromium ignores CSP `webrtc 'block'`. Fix (new guard): the shell session has no network (proxy to `127.0.0.1:1`, loopback included; WebRTC `disable_non_proxied_udp`). The browser tile (P4) must use its own partition (it does by plan).
- CSP made observable separately: with the kill-switch, a loosened CSP still sent nothing; `sec-html` asserts a `securitypolicyviolation` per vector. Not CSP: forms (sandbox, no `allow-forms`), cross-origin `new Worker(url)` (same-origin rule).
- Preconnect / dns-prefetch: no TCP connection observed (blocked).
- Gesture race: a click into an unfocused frame posts its request before the shell's `activeElement` moves (cross-process): the known `markdown-links` flake, reproducible in `html` after focus moved to a new tile. Fix (boundary change, `frame.ts`): unfocused gesture requests wait 150 ms for focus, then are refused.
- Main reports via `did-frame-navigate` / `did-fail-provisional-load` (`webFrameMain.fromId` → `frameTreeNodeId` = the token's bound frame). Aborted (-3, nav lock) ignored. Meta-refresh-away loops end in "Page keeps navigating away" (> 3 per 10 s).
- Spikes: `fetch` spike removed (always on); `spike-html-origin` now expects fetch to work. html/nav spikes overlap the real kind; remove with the webview spike at the end of P4.
- Evidence (`sec-html`, mutation → red): `connect-src *`; network kill-switch removed (TURN TCP reached); confirm skipped; gesture rule off; `/_tie/` allowed by the nav lock; loop guard removed; bootstrap not stopping the handshake event (page saw the port). Opaque viewer fetch: red only when both the probe's opaque origin and its CSP are loosened (two layers).
