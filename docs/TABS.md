# Tabs and Spaces

One tab per space. All spaces live in one renderer. Decision: `2026-10-10-tabs-single-renderer.md`.

## Space

```ts
Space {
  id            // "s1", "s2", ...
  tree, floats, shelf
  collapsed, zoomed, active, mru, pinned, revealed
  customTitle?, customIcon?
}
```

- `S.spaces`: tab order.
- `S.visible`: space on screen.
- `S.current`: space ops act on. Equals `visible` except inside `withSpace()`.
- `S.tree`, `S.floats`, ... are accessors onto `S.current`. Ops need no space parameter.
- `S.tiles` is global (all spaces). `spaceOf(id)` finds a tile's space.

## Working in a background space

- `withSpace(id, fn)`: run `fn` with `S.current = id`, restore after.
- `render()` always renders `S.visible`, even when called inside `withSpace`.
- `activate()` in a background space: updates state, no keyboard focus.
- `closeTile` / `activate` on a tile of another space run in that space (no tab switch).

## Switching

- Hidden spaces' tiles: `display: none`. Terminals keep running; fit skipped while hidden.
- `switchTab(id)`: activates that space's active tile (re-focus), else blurs.

## Tab bar

- In `#top` (window drag region), after macOS traffic lights.
- Each tab: optional icon, title, close button. `+` adds a tab.
- Drag sideways to reorder (live, 4 px threshold). Pointerdown also switches.
- Right-click: rename / set icon (same menu as tiles).
- `#brand` (right): instance name, when not `default`.

Title, first match:

1. Custom title.
2. Active terminal's cwd basename (`~` for home). Polled, no shell integration.
3. Active tile's title.
4. `empty`.

## Opening and closing

- New tab: empty, inserted after the visible one, switched to.
- Close: only empty tabs (board, floats and shelf). Else info dialog, tab kept.
- Closing the last tab creates a fresh empty one.
- After closing the visible tab: switch to the one before.

## Shortcuts

See `INPUT.md`. `cmd+T`, `cmd+shift+W`, `cmd+1..8`, `cmd+9` (last), `ctrl+tab` / `ctrl+shift+tab`.

## CLI

- Calls act in the space of the tile they reference (`id`, `at`, or caller `$TIE_TILE`), else the visible one.
- A terminal in a background tab can open/move tiles in its own tab without switching.
- `tie list` shows the `TAB` (1-based position) of each tile. See `CLI.md`.

## Limitations

- No moving tiles between tabs.
- No tab commands over the CLI.
