# Pending

## Interface

- Html dynamic pages: not supported (static only, decision 2026-10-21; option B of the security review). Revisit if real use needs sandboxed JS with no network; the alternative is a local server + browser tile.
- Settings panel review: three pages now (Appearance, Terminal, Content); structure, naming and scopes deserve a pass before more settings land.
- Keymap settings: override default shortcuts (`DEFAULT_KEYMAP` in `src/core/keymap.ts`) from the settings panel.
- Move tile to another tab: drop a dragged tile onto a tab in the toolbar.
- Tab list: auto-scroll while dragging a tab near its edges (deferred 2026-10-25, `2026-10-25-shelf-in-toolbar.md`).
- Shelf drop polish: a ghost of the item's icon at the landing slot instead of the insert line (wysiwyg); a dashed "+" slot at the shelf's left edge while a tile is dragged, swapped for the ghost when over it (`2026-10-25-shelf-in-toolbar.md`).
- Exit dialog checkbox: restore tabs + layout on next launch. Variants and trade-offs to analyze first (terminal state, content tiles, scrollback).

## Alerts

- Logs in the UI: comfortable access to the instance log (at least the always-on `[security]` lines), filter by tag, follow mode. Today: `tie-dev logs -f` / the file under `~/.config/tie/log/`.

- New system: notifications floating in a corner of the board, by the toolbar. Title, body, x to close, swipe to close.
- Ephemeral for now. Later maybe history.
- First use: explain blocked actions the user may not understand (refused link scheme, denied permission, blocked navigation).

## Tiles

- Kinds add custom title-bar buttons (first use: back/forward, maybe reload, beside hotkeys).
- Visual feedback for a content tile whose file is missing (today: frozen last render; `tie list` `doc.missing`).
- Markdown: images outside the file's folder (`../img.png`) never load (root = the file's directory). Option: root = repo / nearest common ancestor.
- Markdown: scroll memory lost across a frame reload (back/forward between directories → top). Option: viewer reports scroll on navigation.
- Markdown: link target shown on hover (like terminal links), outline, search.
- Terminal block/box chars show row gaps (QR codes): DOM renderer uses font glyphs. Undecided whether to fix now; options in `2026-10-24-terminal-block-glyphs.md`. Sixel (`@xterm/addon-image`) separate.

## CLI

- `tie` resolution relies on PATH. macOS `path_helper` (login shells) moves Tie's `bin/` behind system dirs, so another `tie` earlier on PATH (e.g. the installed app's, from rc files) would win in a dev instance's shells (same socket, older CLI). Trusted for now; if it bites: `TIE_BIN` (absolute path of the matching CLI) + every `tie` re-execs `TIE_BIN` when it isn't it.

## Markdown

- Change marks fade while the tile is shelved (frame reports itself visible). Host should tell the viewer it's hidden.
- Math: Temml researched (2026-10-15), ready if wanted.

## Security

- `runAsNode` fuse on: CLI launcher runs Tie as Node. Signed binary usable as generic Node (Wave CVE-2025-12843 class). Fix: `Tie --cli` mode in main, then fuse off.
- Opt-ins to revisit, each scoped and guarded: remote images per tile, `file://` links in terminals (open in Tie's viewer), OSC 52 write-only, raw HTML in markdown, popups for the browser tile (OAuth: today they go to the system browser).
- Per-tile capabilities (shell without pty power): terminals as `<webview>`s with their own preload, not `nodeIntegrationInSubFrames`.
- OS drag entering straight over a content frame goes to the frame (it can read dropped files; no way out but `openLink`). Mitigated: `body.os-drag` shield once the drag is over the shell; viewers refuse drops.
- Gesture rule = frame focused, not a fresh user activation: once the user clicked into a frame, script in it may post gesture verbs until focus leaves (scripts can't focus the frame by themselves since 2026-10-17: Blink policy, `TILES.md`; they may re-focus it within Chromium's transient activation window after a click). Html pages do run scripts: mitigated by routing (confirm for the web with an armed Open button, one new tile per second). Option: transient activation on the UI side too (main can't see input routed into out-of-process frames; a trusted signal would need the viewer or a different mechanism).
- Html root = the file's folder, recursively: a page opened from `~` or a repo root can read that whole subtree (dotfiles, `.env`); the only way out is a link the user opens (dialog shows the site and flags long links). Html is static since 2026-10-21 (no scripts: the page can't read anything), so this is about markdown images and the html document's own markup only. To discuss: html root stays the file's dir (wider = more exposure; `--root` would be agent-set); markdown root = caller's cwd when it contains the file (images `../img.png`), else the file's dir; `--root` for `tie open`.
- Sandbox as a Tie feature (to discuss): Tie launches agents / commands in a sandbox (seatbelt profile, container) and brokers the socket; then per-tile tokens, ownership scoping and prompts (never / once / always) become the broker's policy rather than theatre. Research first: microsoft/mxc, `sandbox-exec` profiles as Claude Code and Codex use them, Apple Containerization, what agents expect.
- Html: persistent storage per file (opt-in; today in memory, per open), range requests (media seeking), subfolder watch.

## Browser

- Favicon as the tile icon (needs a fetch on the browser partition, never the shell's).
- Search from the location bar (today: http(s) and bare hosts only).
- `mailto:` and other OS handlers (today refused): confirm → system handler?
- Find in page, zoom, devtools for a guest.
- Hung page: today error + renderer killed (same-site guests too). Option: "wait / close" like Chrome.
- Per-tile profiles / private mode (one shared `persist:browser` today).

## Harness

- Guards without a scenario (fact-check 2026-10-21): frame message flood cap (1000/s), content frames can't download (`noDownloads` + no `allow-downloads`), html new-tile throttle (1/s), `confirmExternal` off path, guest `window.focus()` not moving the UI's focus (probed by hand only), Bluetooth / client-cert / device denials (no device in the harness).

- Flake: `markdown-links` "b.md in the same tile" and `markdown-keys` "plain Down": under full-suite load the first click into a freshly loaded out-of-process frame is sometimes lost (no DOM event in the frame, no request). Standalone 6/6 green. Mitigation 2026-10-21: `h.clickIn` moves the pointer first and repeats the click once if the frame didn't take focus. Root cause (OOPIF surface not yet hit-testable?) unconfirmed.
- Flake (1 in a full e2e run, 2026-10-17; 5/5 standalone green): `html` "cmd+R: reloaded, scroll kept" right after a sibling change that fired two live reloads (fs events) 300 ms apart. Suspected: the cmd+R reload hit the second page before its scroll restore. Not reproduced with back-to-back reloads; not fixed.
