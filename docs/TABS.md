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

- New tab (`newTab`: `+`, cmd+T): inserted after the visible one, switched to, with a terminal (root slot, default cwd `S.cwd`, like a template on an empty board). Boot: same, first space gets a terminal (`main.ts`).
- Auto-close: `closeTile` of a space's last tile (board, floats and shelf all empty), by any path (close button, cmd+W, `tie close`, shell exit) → `dropSpace`. No focus pass inside the closing space.
- `dropSpace(id)`: visible → switch to the tab before; hidden (e.g. CLI in a background tab) → removed, visible tab kept, `S.current` back to visible.
- Never zero tabs: the only tab dropped → fresh space + terminal (net effect: a fresh terminal).
- Loop guard: at most one replacement terminal per second (`REPLACE_MS`). A shell that exits at once (`shell: true`) gets one, then the tab stays empty (`empty` title; `quit-empty` scenario).
- Close (`closeTab`: tab ×, cmd+shift+W): only empty tabs. Else info dialog "Tab not empty". With auto-close, only the loop guard's empty tab qualifies.

## Limitations

- No moving tiles between tabs; no dropping onto tabs (no new-tab-with-tile path: every new tab gets the terminal).
- No tab commands over the CLI.
