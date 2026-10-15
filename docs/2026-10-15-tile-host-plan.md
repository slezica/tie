# Tile host: baseline barriers for every tile kind

## Idea

- Every tile kind plugs into one host. The host applies the security baseline; a kind can't opt out.
- Content kinds (markdown, html, agent pages) run in a sandboxed frame the host creates. They supply only a viewer and request handlers.
- Terminals stay a trusted renderer in the shell: the one documented exception.
- Infrastructure first, markdown second. Report: `Tie Content Isolation` artifact. Research: `2026-10-14-security-research.md`.

## Rationale

- Main-side barriers are already central and kind-agnostic (`SECURITY.md`).
- Renderer side assumes terminals everywhere: `Kind = 'terminal'`, `t.term` reach-ins, keys as shell `keydown`, focus via shell `pointerdown`, no pointer shield.
- Without a host, each kind re-implements isolation, input and exits. Each copy is a chance to get one wrong.

## Components

| Component | Where | Does |
|---|---|---|
| Kind registry + `Surface` interface | `src/renderer/kinds/` | `mount`, `resize`, `dispose`, `focus`, `title`/`icon`, optional `paste`/`drop`/`appearance`/`info` |
| Terminal kind | `kinds/terminal.ts` | today's `tile.ts` xterm code behind `Surface` |
| `tie-content://` | `src/main/content.ts` | token → root registry; viewer files under `/_tie/`; root files via `resolveInside` + realpath; CSP header with per-response nonce; `nosniff`; no redirects |
| Frame host | `src/renderer/frame.ts` | sandboxed iframe (`allow-scripts` only), port handshake, request routing, focus, pointer shield |
| Request registry | `src/core/requests.ts` | typed verbs + pure validators (unit-tested); main re-validates meaning |
| Keys in main | `src/main/keys.ts`, `src/core/keymap.ts` | `before-input-event` matches shared keymap, blocks key, sends action to shell |
| Probe kind (dev only) | `kinds/probe.ts` + viewer | harness kind that attempts escapes from inside a frame |

## Data flow

- Open: shell asks main `content:open(root)` → token. Frame loads `tie-content://<token>/_tie/<kind>.html`.
- Handshake: on frame `load`, shell posts `tie:init` + one `MessagePort` to that iframe's `contentWindow`. Afterwards the port only; no global `message` listener.
  - Opaque origin can't be targeted by name: target is the exact `contentWindow` (frames can't navigate: nav lock).
- Requests: frame → port → host (shape check, drop unknown) → kind handler → IPC (sender-checked) → main (meaning check) → act.
- Content text: over the port (fetch from an opaque origin to `tie-content:` may hit CORS; decided by runtime check 2.1).
- Close: shell `content:close(token)`; main forgets the root; later requests 404.

## Error handling

- Malformed or unknown request: dropped, `debug('security', ...)`, never thrown into the frame.
- Unknown token, traversal, root itself, symlink out of root: 404 + `[security]` log.
- Frame navigation attempt: blocked in main (`will-frame-navigate`), logged.
- Frame crash or load failure: tile shows `showError` (failures stay visible).

## Testing

- Red → green for every barrier. Scenarios named `sec-*`.
- `sec-content-escape` (probe kind): `parent.tie`, `top.location`, `window.open`, remote fetch/img, traversal, another tile's token, `openLink` with odd schemes, forged/unknown requests, `meta refresh`.
- Runtime checks become scenarios: frame out-of-process, keys while frame focused, drag across frame.
- Toolkit: `tie-dev frames`: frame tree (url, origin, out-of-process yes/no).
- Every existing scenario stays green after each phase.

## Plan

### Phase 1: kind interface (refactor, no behavior change)

1. `Surface` interface + kind registry. `Tile` keeps common fields; kind state behind `surface`.
2. Move xterm code to `kinds/terminal.ts`. `tile.ts` keeps element, title bar, error state.
3. Remove `t.term` reach-ins (`ops.ts`, `appearance.ts`, `driver.ts`, `paste.ts`): go through `Surface`.
4. Paste/drop routing through `Surface.paste` / `Surface.drop`; terminal implements via `pasteInto`.
5. Full suite green. Docs: `TERMINALS.md`, `AGENTS.md` (files, model).

### Phase 2: frame host + content protocol

1. Runtime checks first (dev-only probe page, ad-hoc scenarios): out-of-process frame, opaque-origin loads of own `tie-content:` script/images, `before-input-event` with frame focus, drag across frame. Record results in this file (`## Results`).
2. `tie-content` scheme: privileged (`standard`, `secure`; no `corsEnabled`, no `bypassCSP`), token registry, handler, headers. Unit tests for path + token logic.
3. `will-frame-navigate`: subframes only to registered `tie-content://<token>/`. Shell CSP `frame-src tie-content:`.
4. Frame host: iframe, handshake, request registry (`core/requests.ts`), focus → activate, pointer shield during `track()` drags/resizes.
5. Probe kind (dev only) + `sec-content-escape`. `tie-dev frames`.
6. Docs: `SECURITY.md` (guards + tests), `ARCHITECTURE.md`, new `docs/TILES.md` (host, kinds, surface, requests).

### Phase 3: shortcuts in main

1. Check first: does CDP input (harness `page.keyboard`) reach `before-input-event`? If not, harness needs another input path before moving keys. Stop and report if unresolved.
2. Keymap table to `core/keymap.ts`, shared by main and renderer.
3. Main `before-input-event` (shell webContents; later guests): match, block, send `keys:action`. Keyup for hold keys (hold-⌘Q). Never swallow Esc or editing combos.
4. Renderer dispatches actions; its own `keydown` path removed for those keys.
5. Scenarios: existing `keys`/`quit-hold` green; shortcuts work with probe frame focused; synthetic `KeyboardEvent` in frame triggers nothing.
6. Docs: `INPUT.md`, `SECURITY.md`.

### Phase 4: markdown kind

Decisions (2026-10-15):
- Raw HTML: escaped (markdown-it `html: false`). Revisit if too restrictive. DOMPurify still on the final HTML.
- Links: relative `.md` plain click = same tile, cmd-click = new tile. External http(s) = system browser.
- History: back/forward in v1 (cmd+[ / cmd+]).
- Opening: `tie open <path>`, Finder drop on the board, template + picker. No kind for the file: `tie open` errors (exit 1); board drop = modal "No viewer for .xyz". Terminal drops still paste paths.
- Style: proportional, small size range (tiles are small).
- Code highlighting: highlight.js (no wasm, CSP stays strict), token colors from the theme's ANSI palette.
- File missing (deleted, renamed away): last render stays frozen; watching continues.

Requirements from review (2026-10-15):
- `openLink` only on a real click: the viewer posts it from its click handler only, and the host accepts it only while the frame is `document.activeElement` (VS Code's rule). Required before any kind whose content can run script.

Watcher (research 2026-10-15, editors and agent tools, source-pinned):
- Writers: in place (VS Code, Zed, nano, JetBrains, Codex, Aider, Cline, opencode); temp + rename (Claude Code, Gemini CLI, atomic-write libs); backup rename + new file, file missing ~5-6 ms (Vim, Neovim default, Helix, Emacs first save).
- macOS: `fs.watch(file)` dies after a rename (kqueue on inode). `fs.watch(dir)` = FSEvents: 50 ms latency, eventType unreliable, overflows dropped silently.
- Algorithm: watch the directory (plus the realpath's directory for symlinks); debounce 100 ms, max 500 ms; ENOENT: retry +100, +300 ms, then freeze; stat-read-stat (partial in-place writes); render on content hash change; backstop poll 2-3 s; re-arm if the directory vanishes.

Steps:
1. Kind + viewer: markdown-it (`html: false`) + DOMPurify + highlight.js in the frame; text over the port; theme tokens passed in.
2. File watch in main (algorithm above), text + revision pushed to the tile.
3. `toggleTask(line, expected, rev)`: request verb, main checks revision + line text, writes.
4. Links + history: `openLink` (gesture rule), in-tile navigation with back/forward, cmd-click new tile.
5. Opening paths: `tie open <path>`, board drop, template + picker; unsupported files fail visibly.
6. Remote images placeholder, scroll kept on reload, shelf activity on change.
7. Scenarios per step; `sec-*` for 3 and 4 (stale write refused, gesture-less openLink refused).

## Results`).
2. `tie-content` scheme: privileged (`standard`, `secure`; no `corsEnabled`, no `bypassCSP`), token registry, handler, headers. Unit tests for path + token logic.
3. `will-frame-navigate`: subframes only to registered `tie-content://<token>/`. Shell CSP `frame-src tie-content:`.
4. Frame host: iframe, handshake, request registry (`core/requests.ts`), focus → activate, pointer shield during `track()` drags/resizes.
5. Probe kind (dev only) + `sec-content-escape`. `tie-dev frames`.
6. Docs: `SECURITY.md` (guards + tests), `ARCHITECTURE.md`, new `docs/TILES.md` (host, kinds, surface, requests).

### Phase 3: shortcuts in main

1. Check first: does CDP input (harness `page.keyboard`) reach `before-input-event`? If not, harness needs another input path before moving keys. Stop and report if unresolved.
2. Keymap table to `core/keymap.ts`, shared by main and renderer.
3. Main `before-input-event` (shell webContents; later guests): match, block, send `keys:action`. Keyup for hold keys (hold-⌘Q). Never swallow Esc or editing combos.
4. Renderer dispatches actions; its own `keydown` path removed for those keys.
5. Scenarios: existing `keys`/`quit-hold` green; shortcuts work with probe frame focused; synthetic `KeyboardEvent` in frame triggers nothing.
6. Docs: `INPUT.md`, `SECURITY.md`.

### Phase 4: markdown kind (blocked on decisions)

Decisions first:
- Raw HTML in markdown: sanitized or escaped.
- Link clicks: plain or ⌘; relative `.md` in place or new tile.
- Opening: `tie open <path>`, Finder drop on board, template + picker.
- Style: monospace + dimmed markup, or proportional.
- Code highlighting in v1.

Then: viewer (markdown-it + DOMPurify in frame), file watch in main, `toggleTask(line, expected, rev)`, remote images blocked, scroll kept on reload, shelf activity on change.

## Results

### 2.1 Runtime checks (spike, 2026-10-15; Electron 44.7.2)

Setup: throwaway `tie-content://` handler, `frame-src tie-content:`, subframe nav allowed; `<iframe sandbox="allow-scripts">` in a tile body; ad-hoc scenarios.

- Out-of-process: **yes**. Frame `osProcessId` ≠ shell's; CDP lists it as an `iframe` target. Origin `null` (opaque).
- Loads from own `tie-content:` (opaque origin):
  - classic `<script src>`: loads. `<img>`: loads.
  - `<script type="module">`: never requested (CORS mode, scheme has no CORS).
  - `fetch()`: `Failed to fetch`, never reaches the handler.
  - → Viewers are classic (IIFE) bundles. Content text over the port (as planned). No `supportFetchAPI` needed.
- `will-frame-navigate` fires for the iframe's initial `src` load (subframe): usable as the frame nav lock.
- Input, harness default (offscreen, OSR): frames get **no** input at all. CDP clicks/keys land on the shell's main widget (shell sees `pointerdown` on the `<iframe>` element). OSR can't test frame input.
- Input, hidden non-OSR window (never shown; spike flag): realistic routing.
  - CDP click in frame: frame focused; shell gets **no** `pointerdown` (active tile unchanged), shell `window` gets `blur`, `document.activeElement` = `IFRAME`. → focus→activate needs `blur` + `activeElement`.
  - CDP keys with frame focused: go to the frame; shell `keydown` never fires; ⌘D does nothing. → confirms Phase 3.
  - Drag a title across the frame, no shield: frame swallowed the moves (pointer capture does **not** hold over an OOPIF), drop lost. With `body.dragging .body { pointer-events: none }`: drop correct, frame got 0 moves.
  - Screenshots work.
- `before-input-event` (main):
  - CDP keys (`page.keyboard`): **never** fire it (OSR or hidden window).
  - `webContents.sendInputEvent` keys: fire it (both modes), but always go to the main frame widget (not routed to a focused frame).
  - Not runtime-verifiable here: OS keys routed to a focused OOPIF firing it. Source says yes (per-WebContents `PreHandleKeyboardEvent`, research "Keys and mouse").

Design consequences:
- Harness gets a hidden-window mode (`TIE_BACKGROUND=hidden`, scenario `export const hiddenWindow = true`) for frame input scenarios.
- Shield in `track()` (all pointer drags, from pointerdown), not only after the drag threshold.
- Phase 3 harness keys go through main (`sendInputEvent`, dev socket), not CDP.

### Phase 2 notes (implementation)

- Frame self-navigation to another origin: refused by the shell's CSP `frame-src` before `will-frame-navigate`; the frame ends on `chrome-error://` (content only breaks itself). Nav lock covers `tie-content:` targets.
- Tokens: all-digit hex would canonicalize as an IPv4 host; minted until the URL keeps the token.
- Nav lock tightened beyond "registered token": exact viewer URL, direct child of the shell, token bound to its first frame (`frameTreeNodeId`).
- Requests: `ready` (host) and `openLink` only. `openLink` has no gesture requirement yet (markdown decides).
- Not built: frame crash detection (no per-frame crash event); ready timeout (5 s) covers load failures.
- Without `sandbox`, the per-token origin alone still blocks `parent.tie` (mutation run): defence in depth.

### 3.1 Harness input vs `before-input-event` (from the 2.1 spike)

- CDP keys (`page.keyboard`): never reach `before-input-event`. Moving shortcuts to main breaks every scenario that presses them via CDP.
- `webContents.sendInputEvent` keys: reach `before-input-event` (offscreen and hidden window), then the shell's main widget if not blocked.
- → Harness chords go through main: dev socket method `input` (main, dev builds) → `sendInputEvent`; helpers `press`, `keyDown`, `keyUp`. Text typing stays CDP.
- Gap (needs a manual check on real hardware): a key typed while a content frame has OS focus. Chromium routes it to the frame's widget; `PreHandleKeyboardEvent` is per WebContents, so `before-input-event` should fire (source, not runtime-verified). No harness path delivers a key that is both routed to a frame and seen by `before-input-event`.

### Phase 3 notes (implementation)

- ⌘Q keydown is **not** blocked in main: a keydown blocked in `before-input-event` loses its keyup (Chromium suppresses it), and hold-to-quit quits on release. Main reports press/release/blur; the renderer keeps the keydown from xterm. Content frames may see ⌘Q's keydown (harmless; they can't stop main's handling).
- Suspend: main skips the keymap while the renderer reports a focused text field or open modal (`keys:suspend`); the renderer also drops actions while a modal is open.
- Main window `blur` cancels a hold (the shell page sees no blur while a frame has focus).
- Scenarios pressing shortcuts now use `h.press` / `keyDown` / `keyUp` (through main); intent unchanged.
