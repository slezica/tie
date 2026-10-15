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

### Phase 4: markdown kind (blocked on decisions)

Decisions first:
- Raw HTML in markdown: sanitized or escaped.
- Link clicks: plain or ⌘; relative `.md` in place or new tile.
- Opening: `tie open <path>`, Finder drop on board, template + picker.
- Style: monospace + dimmed markup, or proportional.
- Code highlighting in v1.

Then: viewer (markdown-it + DOMPurify in frame), file watch in main, `toggleTask(line, expected, rev)`, remote images blocked, scroll kept on reload, shelf activity on change.

## Results

(filled during Phase 2.1 and 3.1)
