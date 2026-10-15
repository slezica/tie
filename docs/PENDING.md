# Pending

## Interface

- Keymap settings: override default shortcuts (`DEFAULT_KEYMAP` in `src/renderer/keys.ts`) from the settings panel.
- Move tile to another tab: drop a dragged tile onto a tab in the tab bar.
- Open question: confirm before closing a tile (cmd+W) whose foreground process isn't the shell?

## Alerts

- New system: notifications floating top-right of board, next to shelf. Title, body, x to close, swipe to close.
- Ephemeral for now. Later maybe history.
- First use: explain blocked actions the user may not understand (refused link scheme, denied permission, blocked navigation).

## Security

- `runAsNode` fuse on: CLI launcher runs Tie as Node. Signed binary usable as generic Node (Wave CVE-2025-12843 class). Fix: `Tie --cli` mode in main, then fuse off.
