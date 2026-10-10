# Tabs in a Single Renderer

Decision 2026-10-10. Supersedes "one WebContentsView per tab" from brainstorming (2026-10-08).

## Decision

- All tabs live in one renderer. Each tab shows one **space** (board + shelf + focus state).
- Switching hides other spaces' tiles (`display: none`); their terminals keep running.

## Rationale

- Since 2026-10-09 the renderer owns all state (UI-centric, minimal architecture).
- WebContentsView per tab would split that state across processes and need cross-process tab ops.
- Single renderer: tab switch = state flip + render. Cheap, simple, testable.
- Revisit if per-tab isolation (crash containment, memory) becomes a real need.

## Details

- `S` per-space fields (`tree`, `floats`, `shelf`, ...) are accessors onto the current space; `withSpace(id, fn)` runs ops in a background space (e.g. CLI calls from a terminal in another tab).
- `render()` always renders the visible space.
- Tab title: custom (right-click menu, shared with tiles) or derived from the active terminal's cwd (polled via `lsof`, no shell integration), else its title.
- Closing: only empty tabs (board and shelf); otherwise a dialog explains. Safety first; revisit later.
- Shortcuts: `cmd+T` new (empty), `cmd+W` close, `cmd+1..8` by position, `cmd+9` last, `ctrl+tab` / `ctrl+shift+tab` cycle.
