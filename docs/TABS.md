# Tabs and Spaces

One tab per space, all in one renderer (`2026-10-10-tabs-single-renderer.md`). Space fields: AGENTS.md "Model".

## Acting on a space

- Ops act on `S.current` with no space parameter.
- `withSpace(id, fn)`: run `fn` with `S.current = id`, restore after. If `fn` switched tabs: `S.current` = new visible space.
- `render()` always renders `S.visible`, even inside `withSpace`.
- `closeTile` / `activate` on another space's tile run in that space, no tab switch, no keyboard focus.
- `tie focus` is the exception: switches to the tile's tab.
- Socket calls run in the space of `id`, `at` or `caller`, else visible (`CLI.md`).

## Switching (`switchTab`)

- Activates the space's active tile (refocus), else blurs.
- Clears hover reveal of the tab left.
- Hidden spaces' tiles: `display: none`; terminals keep running, fit skipped.

## Tab bar

- In `#top` (after traffic lights), or `#bottom` with `tabBar: bottom` (`SETTINGS.md`). Its bar is the window drag region.
- Tab: ping dot, custom icon, title, close button. `+` adds a tab.
- Pointerdown switches; drag sideways reorders (live, 4 px threshold).
- Right-click: rename / set icon menu.
- `#brand` (right): instance name when not `default`.

Title (`tabTitle`), first match:

1. `customTitle`.
2. Tile = active, else first shelved. Its `cwdNow` basename (`~` for home).
3. That tile's display title.
4. `empty`.

## Open and close

- New tab: empty, inserted after the visible one, switched to.
- Close: only empty tabs (board, floats, shelf). Else info dialog "Tab not empty".
- Last tab closed: fresh empty one created. Visible tab closed: switch to the one before.

## Limitations

- No moving tiles between tabs; no dropping onto tabs.
- No tab commands over the CLI.
