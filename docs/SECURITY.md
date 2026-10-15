# Security

## Threat model

- Shell renderer holds `window.tie` (spawns ptys): any script there = RCE as the user.
- Untrusted input: terminal output (OSC 8 links, titles), pasted and dropped data (incl. file names), content tiles (markdown, html, web): any script inside their frame.
- Not a boundary: the `tie` socket. Reachable only by the user's own processes, which can already run code.

## Rules

- Only our code runs in the shell. Content never shares its JS realm.
- Every guard has an e2e scenario `sec-*` (red first). Guards get lost in refactors otherwise.
- Security-relevant code carries a `// SECURITY:` comment saying what matters about it.
- New IPC: `ipc.on` / `ipc.handle` (`shellIpc`), never `ipcMain` directly.
- Opening URLs: only `openExternal` in `src/main/security.ts`.
- Pure checks in `src/core/security.ts`, `src/core/content.ts` (main), `src/core/paste.ts`, `src/core/requests.ts`, `src/core/markdown.ts` (renderer + main), unit-tested.
- Content kinds only through the frame host (`TILES.md`): the baseline is not per kind.
- Never add `tie-content:` to shell `script-src`; never `allow-same-origin` on content frames; never post to frames by name or `'*'` except the handshake to the exact `contentWindow`.

## Guards

| Guard | Where | Test |
|---|---|---|
| Navigation (all frames), redirects: only shell reloads pass; subframes only via the content nav lock | `security.ts` `guard()` | `sec-navigate`, `sec-content-nav` |
| Content frame nav lock: exact viewer URL of a registered token, child of the shell, one frame per token | `content.ts` `contentFrameAllowed` | `sec-content-nav` |
| Content frames: `sandbox="allow-scripts"` only (opaque origin), own process, no `window.tie`, no top nav/popups/storage | `frame.ts` | `sec-content-escape` |
| `tie-content://`: privileges `standard`+`secure` only; token → root; root files inside the real root; root itself, other viewer files, unknown tokens refused | `content.ts`, `@core/content` | `sec-content-protocol`, unit |
| Content CSP: nothing by default, viewer scripts by per-response nonce, images from own token only; `nosniff` | `contentCsp`, `serveContent` | `sec-content-escape`, unit |
| Content requests: port only, typed verbs, strict shape; main re-validates (openLink: http(s)) | `frame.ts`, `@core/requests` | `sec-content-escape`, unit |
| Gesture rule: link opens and file writes (`openLink`, `followLink`, `toggleTask`) only while the frame is focused | `frame.ts`, `needsGesture` | `sec-content-escape`, `sec-markdown` |
| Markdown render: raw HTML escaped (`html: false`; also in footnotes, front matter), DOMPurify on the final HTML (after every plugin), remote / out-of-folder images never requested (placeholder) | `viewers/markdown.ts` | `sec-markdown` |
| Markdown links: anchors, http(s) (→ `openExternal`), markdown paths (main re-checks the file); other schemes refused | `@core/markdown` `classifyLink`, `kinds/markdown.ts` | `sec-markdown`, `markdown-links`, unit |
| Task toggles: write only at the revision the viewer rendered, only the line it showed, only task items, UTF-8 round-trip; through the real path | `main/docs.ts`, `@core/markdown` `applyToggle` | `sec-markdown`, unit |
| Opening files: main checks absolute, existing regular file, known viewer | `main/docs.ts` `fileViewer` | `markdown-open` |
| OS drags: content frames ignore the pointer while one is over the window (drops land in the shell) | `renderer/main.ts`, `style.css` | — (offscreen harness: drags never reach frames) |
| Shortcuts in main: real keys only, blocked before any page (content can't swallow, fake or see them); Esc and editing combos pass | `main/keys.ts`, `@core/keymap` | `sec-keys`, unit |
| `window.open`: always denied (child windows inherit preload) | `guard()` | `sec-navigate` |
| `<webview>` attach: denied until a kind needs it | `guard()` | — |
| ptys killed on committed navigation only (`did-navigate`) | `main/index.ts` | `sec-navigate` |
| Permissions: all denied, every session | `harden()` | `sec-permissions` |
| Terminal links: hover shows URL, cmd-click only, http(s) only | `kinds/terminal.ts` `linkHandler`, `openExternal` | `sec-links` |
| Native drops: never navigate; on a terminal, quoted paths / text via guarded paste; files elsewhere → their viewer (main checks); text elsewhere: nothing | `renderer/main.ts`, `paste.ts`, `files.ts`, `kinds/terminal.ts` | `sec-drop`, `markdown-open` |
| Paste: confirm control characters and would-run newlines (settings, default on) | `paste.ts`, `@core/paste` | `sec-paste`, `sec-paste-off`, unit |
| IPC: shell main frame of shell window only | `shellIpc`, `isShellSender` | unit |
| Shell on `tie://app/` (not `file://`), traversal-safe | `serveShell`, `resolveInside` | `sec-protocol`, unit |
| Shell CSP: scripts from app only; frames only `tie-content:`; no objects, workers, forms, `<base>`. Inline styles allowed (xterm needs them) | `renderer/index.html` | `sec-csp`, `sec-content-nav` |
| Fuses (below) | `electron-builder.yml` | `check-package` |

## Fuses

- On: `runAsNode` (CLI launcher needs it), cookie encryption, asar integrity, only-load-from-asar.
- Off: `NODE_OPTIONS`, `--inspect`, file-protocol extra privileges.
- Checked after every `tie-dev package` (`dev/package-check.mjs`): fails = package removed.

## Harness

- `probe(ctx)`: local http page reporting hits and whether it got `window.tie`. `assertUntouched(what)`.
- Probe kind (dev builds): `tie open probe [--cwd root]`, `h.probeFrame(ctx, id)` = Playwright frame inside it (the attacker's seat). `h.frames(ctx)` / `tie-dev frames`: frame tree, out-of-process.
- `ctx.appLog()`: run's app log; `[security]` lines record every block/refusal.
- Harness instances (`TIE_BACKGROUND`) log `external open <url>` instead of opening, and never show the file picker (dev socket `pick` answers it).
- Markdown: `h.contentFrame(ctx, id)` = the viewer's frame; `window.markdown.port` lets a scenario post requests as the frame (stale toggles, gesture-less links).
- Keys: `h.press` / `keyDown` / `keyUp` go through main (`sendInputEvent`); CDP keys skip `before-input-event`.
- Limits: no harness path sends a key that is both routed into a focused frame and seen by `before-input-event`; `sec-keys` covers each half (frame really focused via `hiddenWindow`; main handles keys whatever the focus). Real-hardware check: manual.
- Limits: offscreen + CDP can't reach the native navigate-on-drop path; `sec-drop` asserts the mechanism (drags claimed).
