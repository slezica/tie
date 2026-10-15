# Security

## Threat model

- Shell renderer holds `window.tie` (spawns ptys): any script there = RCE as the user.
- Untrusted input: terminal output (OSC 8 links, titles), pasted and dropped data (incl. file names), future content tiles (markdown, html, web).
- Not a boundary: the `tie` socket. Reachable only by the user's own processes, which can already run code.

## Rules

- Only our code runs in the shell. Content never shares its JS realm.
- Every guard has an e2e scenario `sec-*` (red first). Guards get lost in refactors otherwise.
- Security-relevant code carries a `// SECURITY:` comment saying what matters about it.
- New IPC: `ipc.on` / `ipc.handle` (`shellIpc`), never `ipcMain` directly.
- Opening URLs: only `openExternal` in `src/main/security.ts`.
- Pure checks in `src/core/security.ts` (main) and `src/core/paste.ts` (renderer), unit-tested.

## Guards

| Guard | Where | Test |
|---|---|---|
| Navigation (all frames), redirects: only shell reloads pass | `security.ts` `guard()` | `sec-navigate` |
| `window.open`: always denied (child windows inherit preload) | `guard()` | `sec-navigate` |
| `<webview>` attach: denied until a kind needs it | `guard()` | — |
| ptys killed on committed navigation only (`did-navigate`) | `main/index.ts` | `sec-navigate` |
| Permissions: all denied, every session | `harden()` | `sec-permissions` |
| Terminal links: hover shows URL, cmd-click only, http(s) only | `tile.ts` `linkHandler`, `openExternal` | `sec-links` |
| Native drops: never navigate; on a terminal, quoted paths / text via guarded paste, else nothing | `renderer/main.ts`, `paste.ts` | `sec-drop` |
| Paste: confirm control characters and would-run newlines (settings, default on) | `paste.ts`, `@core/paste` | `sec-paste`, `sec-paste-off`, unit |
| IPC: shell main frame of shell window only | `shellIpc`, `isShellSender` | unit |
| Shell on `tie://app/` (not `file://`), traversal-safe | `serveShell`, `resolveInside` | `sec-protocol`, unit |
| Shell CSP: scripts from app only; no frames, objects, workers, forms, `<base>`. Inline styles allowed (xterm needs them) | `renderer/index.html` | `sec-csp` |
| Fuses (below) | `electron-builder.yml` | `check-package` |

## Fuses

- On: `runAsNode` (CLI launcher needs it), cookie encryption, asar integrity, only-load-from-asar.
- Off: `NODE_OPTIONS`, `--inspect`, file-protocol extra privileges.
- Checked after every `tie-dev package` (`dev/package-check.mjs`): fails = package removed.

## Harness

- `probe(ctx)`: local http page reporting hits and whether it got `window.tie`. `assertUntouched(what)`.
- `ctx.appLog()`: run's app log; `[security]` lines record every block/refusal.
- Harness instances (`TIE_BACKGROUND`) log `external open <url>` instead of opening.
- Limits: offscreen + CDP can't reach the native navigate-on-drop path; `sec-drop` asserts the mechanism (drags claimed).
