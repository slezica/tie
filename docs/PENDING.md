# Pending

## Interface

- Keymap settings: override default shortcuts (`DEFAULT_KEYMAP` in `src/renderer/keys.ts`) from the settings panel.
- Move tile to another tab: drop a dragged tile onto a tab in the tab bar.
- Open question: confirm before closing a tile (cmd+W) whose foreground process isn't the shell?

## Alerts

- New system: notifications floating top-right of board, next to shelf. Title, body, x to close, swipe to close.
- Ephemeral for now. Later maybe history.
- First use: explain blocked actions the user may not understand (refused link scheme, denied permission, blocked navigation).

## Tiles

- Generic viewers when no specific kind exists: plain text, binary (hex). Until then: fail.
- Kinds add custom title-bar buttons (first use: back/forward, maybe reload, beside hotkeys).
- Visual feedback for a content tile whose file is missing (today: frozen last render).
- Content frame crash not detected: tile stays blank.

## Security

- `runAsNode` fuse on: CLI launcher runs Tie as Node. Signed binary usable as generic Node (Wave CVE-2025-12843 class). Fix: `Tie --cli` mode in main, then fuse off.
- Opt-ins to revisit, each scoped and guarded: remote images per tile, `file://` links in terminals (open in Tie's viewer), OSC 52 write-only, raw HTML in markdown, popups for the browser tile (OAuth).
- Per-tile capabilities (shell without pty power): terminals as `<webview>`s with their own preload, not `nodeIntegrationInSubFrames`.
- OS drag entering straight over a content frame goes to the frame (it can read dropped files; no way out but `openLink`).
