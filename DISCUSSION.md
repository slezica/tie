# Topic

Release testing. v0.3.0 released + installed 2026-10-22 (`git tag v0.3.0`). Next: manual checks of 0.3.0 (list below), then whatever the testing notes bring. If terminals stop starting: `tie-dev ptydump` + the printed `sudo spindump` BEFORE rebooting (`docs/2026-10-21-pty-wedge.md`).
Earlier: security pass (2026-10-17): `docs/2026-10-17-security-review.md`, report `docs/2026-10-17-security-report.html` (artifact https://claude.ai/artifact/GNrT91W5aB3uwXz7ne96QR), explainer `docs/EXECUTION-AND-SECURITY.html` (artifact https://claude.ai/artifact/NpWRuM8j8YBJrdzFyDrTvJ). Now: socket caller identity, then the fact-check items as design changes.
Earlier: live file viewer tiles; plan record `docs/2026-10-15-tile-host-plan.md`. Backlog: `docs/PENDING.md`.

# Settled

## Release testing 0.2.0 → 0.3.0 (2026-10-21/22, done, 66/66 e2e)

- Fixed from notes: empty pill circle (`.btn[hidden]`); terminal right/bottom clipping (xterm 6.0 DOM renderer width-cache bug, workaround until 6.1; padding on `.xterm`); macOS press-and-hold popup (`registerDefaults ApplePressAndHoldEnabled=false`, in memory, like kitty).
- Icons: SVG set (`GLYPH`), kind icons only (program icons removed), user emoji stay; collapse/expand arrows follow the collapse direction, tile icon upright on strips; active = glow on icon (no dot, title position fixed).
- Shelf: hover reveal takes the pointer (geometry zone `inRevealZone`), click pins; pin/unpin title-bar button; pin stays until released (item click, button, close, unshelve, `tie move`). Outside clicks never unpin.
- Tabs: new tab opens a terminal. Empty-tab auto-close tried and reverted (user: empty board + notice stays). ⌘W on empty tab closes it, only tab no-op. Tab × / ⌘⇧W close with tiles.
- Terminal title setting: Automatic (OSC) / Command (default) / Directory (basename + path tooltip).
- Close/quit: hold-⌘Q removed. ⌘Q / red button / menu → dialog always, "Currently running" list by tab. ⌘W/×/menu Close ask only if busy; `tie close` never asks. Busy = shell has children (`tie-peer childrenOf`, libproc, synchronous) or `cmd` alive. Browser `beforeunload` → Leave/Stay.
- Known: `kill` on a visible Tie shows the quit dialog (Electron maps SIGTERM to `app.quit`); `tie-dev stop` quits via debug port. Shell plugins keeping a child alive read as busy. Browser close via `about:blank` load (`webContents.close({waitForBeforeUnload})` broken for webview guests in Electron 44).
- pty wedge (2026-10-21): system-wide, every `openpty` blocks in kernel `lstat` of `/dev/ttysNNN`; reboot only. Not Tie, not harness (idle 19:10–22:13); onset after a clamshell sleep (19:31–20:34). Harness: per-scenario pty leak count, `tie-dev ptys`, `tie-dev ptydump`.
- Manual checks pending on 0.3.0: Shift+W held in nvim (repeat, no popup); terminal right edge; ⌘Q dialog; ⌘W on a running command; shelf hover → click → pin button; `tie-dev ptys` now and then.
- Icon nits unresolved: active glow subtle on Tie Dark (`style.css` drop-shadow ~1074).

## Batch 3 (2026-10-21, done): rename shell→UI; html static only (option B) + "Scripts blocked" tag; downloads always ask; explainer fact-checked and corrected.

- Settled 2026-10-21: randomized socket in tmp: no (dir already 0700; shells carry the path anyway; discovery outside Tie needs a fixed name; tmp cleaners).
- Settled 2026-10-21: tile ids stay incremental (`t1`…): names, not credentials; `tie list` shows them anyway. Ownership, not secrecy, if a permission model comes.
- Discussing one by one (2026-10-21):
  1. Token / caller identity for the socket (now). Same-uid privacy doesn't exist on macOS; a secret in env is readable by every process of the user. Proposal: identity without a secret: peer pid (`LOCAL_PEERPID`, tiny N-API addon) + lineage up to a pty's shell = insider; unknown callers get a default role. Alternative rejected: inherited fd (spawners close fds). Pushback: a week of plumbing, worth it only as the base for ownership scoping / sandbox broker.
  2. Fact-check items as design changes: security refusals always logged (done: always on, `<untrusted>` markers); browser popups through the confirm (done: option 2 "dialog always", no timer; Electron has no popup blocker, the dialog is it); html nav-failure auto-reload → error at once (done, names the target); links to files outside the document's folder ask first (done, option C). Fact-check list complete.
  1b. Lineage: done (native/peer, allowExternalControl default off, Security page). Keychain prompt = packaged app's cookie-encryption key per ad-hoc build; harness uses a mock keychain.
- Open: settings UI review, root restrictions, sandbox research.

## Deceptive tiles (2026-10-20, done: html static by default + pill, confirm on every link out, no page titles, link strip)

- Socket authorization: settled as "known concern, not Tie's" (2026-10-19). Revisit only with a Tie-run sandbox (PENDING).
- To discuss: root restrictions (markdown root = cwd when it contains the file; html stays file dir), sandbox as a feature (research first), settings UI review.

## Security pass 2026-10-17 (done, committed, 58/58 e2e)

- Fixed: frames can't focus themselves (Blink policy); content protocol streams root files, caps root documents; Bluetooth chooser cancelled, client certs refused, downloads need recent input; state dir 0700 / files 0600, socket line cap; external-open dialog armed 600 ms, host bold, long-link warning; frame message flood cap.
- Dead ends: main's `input-event` never sees clicks routed into OOPIFs (UI-side focus guard impossible that way); Playwright `evaluate` carries a user gesture.
- Flagged, open: socket = full power for any reachable process; html root = whole folder; gesture rule = focused; runAsNode; dev CDP port; impersonable titles; shared browser profile.
- Opinion: safe for a developer against content. Softest spot: the socket vs agents. Change list, in order: socket scoping → html root warning → html as webview → file-view routing → runAsNode → dev CDP port.

## Security

- Threat model, one line: viewing is safe, running is a choice, content never reaches the UI.
- Strong isolation by default for every tile rendering foreign content. UI realm runs only our code.
- Track A (baseline hardening): done. `docs/SECURITY.md`, `sec-*` scenarios.
  - Terminal links: cmd-click, http(s) only, hover shows URL.
  - UI on `tie://app/`. UI CSP tightened; inline styles stay (xterm needs them).
  - Fuses, permissions denied, IPC sender check, nav/window lock.
- Paste + drops: done. Confirm on control chars / would-run newlines; settings `warnPasteControl`, `warnPasteRun` (off = raw). Drops on terminals: quoted paths, same guard.
- Electron: 44.7.2. `tie-dev electron-check` in release. Majors: info only. Offline: warn, repeated at end.
- Alerts system: not now. Separate cross-cutting feature; expand horizontally first.

## Tile host (Phases 1–3, done, reviewed)

- Kind registry + `Surface`; terminal behind it. `docs/TILES.md`.
- Content frames: sandboxed iframe, per-tile `tie-content://<token>/`, nonce CSP, nav lock (own viewer only, direct child of the UI), private port, typed requests, gesture rule (frame focus).
- Shortcuts in main `before-input-event` (verified by hand: cmd+D with frame focused). ⌘Q keydown not blocked (hold-to-quit needs keyup).
- Pointer shield during drags, focus → activate.

## Markdown tile (Phase 4, done, reviewed)

- Viewer: markdown-it (raw HTML escaped) → highlight.js → DOMPurify on final HTML. Parsed inside the frame.
- Read-only (2026-10-16): no write path; task boxes display only. Reverses checkbox write-back.
- Remote images blocked (placeholder). Relative images from the file's folder.
- Links: relative `.md` plain = same tile, cmd = new tile; http(s) = system browser (confirm since 2026-10-20); other schemes ignored. History cmd+[ / cmd+].
- Opening: `tie open <path>`, Finder drop on board, template + picker. No viewer: fail (`tie open` exit 1; drop = modal).
- Style: proportional, small size range. Code highlighting: highlight.js, theme ANSI colors.
- Live reload: watcher per research algorithm. Missing file: frozen last render, watching continues.
- Keys: shift+up/down scroll a third of the tile. Styles: `src/viewers/markdown.html`.
- Extensions (done): footnotes, front matter (muted, shown without `---`, never parsed), `:emoji:` full set (emoticons off), definition lists. Typographer off.
- Diagrams: Mermaid inside the markdown frame (style 'unsafe-inline' there only; scripts nonce-only), lazy, strict config locked against `%%{init}%%`, DOMPurify on output. Not the separate diagram frame.
- Math: skipped for now. Temml ready if wanted (research below).

## CLI and layout

- `tie --help`: manpage-like capability listing for agents; `cli` scenario guards coverage.
- `tie open` / `tie move` keep the user's input unless `--focus` (empty board: activates).
- `tie` resolution: trust PATH for now; `TIE_BIN` + re-exec if it bites (PENDING).
- Layout: closing a tile returns its space to its donor (split → close restores sizes).

# Pending

## Done 2026-10-16 (reviewed)

- Watchdog: ping 1 s, hang 5 s (10 s render grace) → "Viewer stopped responding"; port closed → "Viewer crashed". No auto-reload. Hung frame's process killed if not shared.
- Read-only markdown: write path removed end to end; task boxes display-only.
- Mermaid (@mermaid-js/tiny 12.2.0) in the markdown frame, lazy; frame style-src 'unsafe-inline' (no nonce: CSP3 ignores unsafe-inline with a nonce). SVG-only DOMPurify.
- Live updates: morphdom + manual anchoring (native didn't hold); change marks, edge markers, `n`.

## Open questions

- Scroll on external change: DONE (c). Never move from the viewer's point of view.
  - Re-render by DOM diff (morphdom) so unchanged nodes stay; native scroll anchoring keeps the view still.
  - Changed blocks: margin accent bar, fades once seen. Off-screen changes: edge marker ("changed above/below") until seen.
  - Jump key `n`: newest unseen change to ~1/3 from top; repeats walk the rest.

## Viewers + browser (done 2026-10-17, reviewed)

- Plan: `docs/2026-10-16-viewers-and-browser-plan.md`. P0–P5 done.
- Kinds: terminal, markdown, text, image, hex, html, browser. Unknown files → text/hex. Shelf: terminal, file, browser.
- UI on in-memory session (content storage never on disk); no network for UI + content (incl. WebRTC); browser on `persist:browser`.
- Known flakes (green on rerun): `html` cmd+R after quick live reloads (PENDING), `markdown-keys`, `shelf`, `quit-hold`, `markdown-links` (first click) once each.
- Untested: guest `unresponsive` (never fired in 60 s busy loop).

## Decided not now

- "Edit" action (`$EDITOR` in adjacent split): not for now.
- Agent HTML tiles: later. Html dynamic pages: not supported (static only, 2026-10-21).

## Postponed (in PENDING.md)

- Generic viewers (plain text, hex) when no kind exists.
- Kind title-bar buttons (back/forward, reload). Pill exists now (non-interactive tag; `toggle?` optional).
- Missing-file visual feedback.
- Quit dialog instead of hold-to-quit; restore tabs + layout (trade-offs to analyze).
- Opt-ins: remote images, `file://` terminal links, OSC 52 write-only, raw HTML, browser-tile popups.
- Per-tile capabilities: terminals as `<webview>`s (UI without pty power).

# Research

- `docs/2026-10-14-security-research.md`: Wave, VS Code, Joplin, Hyper/Tabby, Electron. Methodology inside.

## File watching (2026-10-15, source-pinned; merged into plan record Phase 4)

- In-place writers (inode kept): VS Code, Zed, nano, JetBrains, Codex, Aider, Cline, opencode. Risk: partial reads.
- Temp + rename (new inode, never missing): Claude Code, Gemini CLI, write-file-atomic, atomicwrites, Rust tempfile.
- Backup rename + new file (missing ~5-6 ms): Vim, Neovim (default), Helix, Emacs (1st save).
- macOS `fs.watch(file)` dead after rename (kqueue on inode). `fs.watch(dir)` = FSEvents: 50 ms latency, eventType unreliable, overflow dropped.

## Diagrams (2026-10-15, source-pinned)

- Mermaid 12.2: 16 advisories (8 in 2026): CSS into `<style>` escapes, labels via innerHTML, DoS loops. Patch-on-patch fixes. "strict" = DOMPurify defaults on labels. Needs live DOM layout.
- Decided simpler than proposed: in the markdown frame. Nonce-only scripts neutralize its XSS class; CSS escapes only restyle the tile; watchdog for DoS.
- Fallback: beautiful-mermaid (string SVG, subset). Rejected: D2, WaveDrom (eval), svgbob (`</style>`), flowchart.js, Kroki/PlantUML. Graphviz optional (wasm-unsafe-eval).

## Math (2026-10-15, source-pinned, tested in headless Chrome 155 under our CSP)

- Temml 0.14: MathML via createElementNS, no CSP change, 60 KB gz, no \href/\url, trust off, no advisories, single maintainer.
- DoS verified (nested \cancelto, huge alignedat): needs the watchdog.
- Plugin: markdown-it-math 6.0.1 (`no-default-renderer`). Delimiters: GitHub parity; `\(…\)` behind a setting.
- Fallback: KaTeX 0.19 HTML (font-src + 20 woff2). Rejected: KaTeX MathML, MathJax, texmath/vscode-katex/markdown-it-katex.
