# Pending

## Interface

- Keymap settings: override default shortcuts (`DEFAULT_KEYMAP` in `src/core/keymap.ts`) from the settings panel.
- Move tile to another tab: drop a dragged tile onto a tab in the tab bar.
- Open question: confirm before closing a tile (cmd+W) whose foreground process isn't the shell?
- Quit: replace hold-to-quit with a confirmation dialog. Then ⌘Q is a plain shortcut: block it in main like the rest, drop quit-press/release/cancel (`main/keys.ts`, `quit.ts`). Hold needed the keyup, which a blocked keydown loses.
- Exit dialog checkbox: restore tabs + layout on next launch. Variants and trade-offs to analyze first (terminal state, content tiles, scrollback).

## Alerts

- New system: notifications floating top-right of board, next to shelf. Title, body, x to close, swipe to close.
- Ephemeral for now. Later maybe history.
- First use: explain blocked actions the user may not understand (refused link scheme, denied permission, blocked navigation).

## Tiles

- Kinds add custom title-bar buttons (first use: back/forward, maybe reload, beside hotkeys).
- Visual feedback for a content tile whose file is missing (today: frozen last render; `tie list` `doc.missing`).
- Markdown: images outside the file's folder (`../img.png`) never load (root = the file's directory). Option: root = repo / nearest common ancestor.
- Markdown: scroll memory lost across a frame reload (back/forward between directories → top). Option: viewer reports scroll on navigation.
- Markdown: link target shown on hover (like terminal links), outline, search.

## CLI

- `tie` resolution relies on PATH. macOS `path_helper` (login shells) moves Tie's `bin/` behind system dirs, so another `tie` earlier on PATH (e.g. the installed app's, from rc files) would win in a dev instance's shells (same socket, older CLI). Trusted for now; if it bites: `TIE_BIN` (absolute path of the matching CLI) + every `tie` re-execs `TIE_BIN` when it isn't it.

## Markdown

- Change marks fade while the tile is shelved (frame reports itself visible). Host should tell the viewer it's hidden.
- Math: Temml researched (2026-10-15), ready if wanted.

## Security

- `runAsNode` fuse on: CLI launcher runs Tie as Node. Signed binary usable as generic Node (Wave CVE-2025-12843 class). Fix: `Tie --cli` mode in main, then fuse off.
- Opt-ins to revisit, each scoped and guarded: remote images per tile, `file://` links in terminals (open in Tie's viewer), OSC 52 write-only, raw HTML in markdown, popups for the browser tile (OAuth).
- Per-tile capabilities (shell without pty power): terminals as `<webview>`s with their own preload, not `nodeIntegrationInSubFrames`.
- OS drag entering straight over a content frame goes to the frame (it can read dropped files; no way out but `openLink`). Mitigated: `body.os-drag` shield once the drag is over the shell; viewers refuse drops.
- Gesture rule = frame focused, not a fresh user activation: script in a focused frame may post gesture verbs any time. Html pages do run scripts: mitigated by routing (confirm for the web, one new tile per second). Revisit (e.g. activation token from main's input events).
- Html storage left on disk after close (Chromium's data removal skips `tie-content`). Options: (a) shell window on an in-memory partition (never on disk; protocols re-registered on it), (b) bootstrap clears storage on host request before close (cooperative) + wipe the profile's storage folders at launch (the shell stores nothing there), (c) launch-time wipe only.
- Html: persistent storage per file (opt-in), `<title>` as tile title, range requests (media seeking), subfolder watch.
