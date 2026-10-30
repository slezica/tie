# Tabs and Spaces

One tab per space, all in one renderer (`2026-10-10-tabs-single-renderer.md`). Space fields: AGENTS.md "Model".

## Acting on a space

- Ops act on `S.current` with no space parameter.
- `withSpace(id, fn)`: run `fn` with `S.current = id`, restore after. If `fn` switched tabs: `S.current` = new visible space.
- `render()` always renders `S.visible`, even inside `withSpace`.
- `closeTile` / `activate` on another space's tile run in that space, no tab switch, no keyboard focus.
- `tie focus` is the exception: switches to the tile's tab (also `--focus` with `--tab` / `--swap`).
- Socket calls run in the space of `id`, `at` or `caller`, else visible (`CLI.md`).

## Switching (`switchTab`)

- Activates the space's active tile (refocus), else blurs.
- Clears hover reveal of the tab left.
- Hidden spaces' tiles: `display: none`; terminals keep running, fit skipped.

## Toolbar

One `#toolbar`, in the bottom strip `#bottom` (default) or the top strip `#top` after the traffic lights (`toolbar` setting, `SETTINGS.md`; `appearance.ts` moves it). Both strips are the window drag region; everything in the toolbar is `no-drag`. Height `--toolbar-h` (40 px).

Order, left to right: `#brand` (instance name when not `default`), `#tabs` (the tab list `#tab-list` + `#tab-add`), `#shelf` (`SHELF.md`), `#templates`. Flex: the tab list takes what is left (`flex: 1`), the shelf keeps its content width, templates never shrink.

- Tab: ping dot, custom icon, title, close button. `+` adds a tab.
- Pointerdown switches; drag sideways reorders (live, 4 px threshold). Near the list's ends it auto-scrolls ("Overflow"); the order follows.
- Right-click: rename / set icon menu.

## Overflow

- Tabs never shrink (`flex: none`, `max-width: 200px`). When they don't fit, `#tab-list` scrolls sideways (no scrollbar): trackpad, or a vertical wheel mapped to `scrollLeft`.
- `#tabs.overflow` (list `scrollWidth > clientWidth`): divider toward the shelf (right border). Fades (`mask-image`) at the list's ends where more tabs are: `.more-left` / `.more-right`, synced on scroll and every `renderTabs()`.
- The current tab is scrolled into view (`showTab`, list-only scroll) when it changes or when the list's content width changes (titles, new tabs); a user's scroll otherwise stays.
- Floor: `#tabs` `min-width: var(--tabs-min)` (140 px: one tab and `+`). Below it the shelf gives way (`SHELF.md` "Space").
- Auto-scroll while dragging (`edgeScroll`, `tabs.ts`): a tab reorder (`dragTab`) or a tile / template over the list (`startDrag`). Zone: 24 px inside each end (the fades' width), only while the list can scroll that way. Speed by depth: 2 to 12 px per frame (`requestAnimationFrame`, no pointer moves needed). After each step the target is computed again under the still pointer (reorder index; `tabDropAt` + `markTabDrop`). Tab reorder: past the ends = deepest. Tile drag: only over the list itself (`+` and the rest of `#tabs` are the new-tab target). Stops on leaving the zone, drop, Escape, cancel. While it runs, `renderTabs` leaves the scroll alone (no snap back to the current tab); the next render after the drag catches up.

Title (`tabTitle`), first match:

1. `customTitle`.
2. Tile = active, else first shelved. Its `cwdNow` basename (`~` for home).
3. That tile's display title.
4. `empty`.

## Open and close

- New tab (`newTab`: `+`, cmd+T): inserted after the visible one, switched to, with a terminal (`{empty: true}`: none, for drops) (root slot, default cwd `S.cwd`, like a template on an empty board). Boot: same, first space gets a terminal (`main.ts`).
- Emptied tab: closing its last tile by any path (close button, cmd+W, exit of a `--cmd` tile closed by the user, `tie close`, from another tab) closes the tab (`closeTile` empty hook → `dropSpace`, registered by `initTabs`). Visible: back to the tab before; hidden: gone, the visible tab stays. The only tab stays: board empty (notice), title `empty`; cmd+W there (nothing active) does nothing.
- Close (tab ×, cmd+shift+W → `requestCloseTab`, `close.ts`): the tab with every tile (board, floats, shelf). Busy terminals listed first (confirm); idle or empty: at once (`INPUT.md` "Closing").
- `closeTab(id)`: closes its tiles (no questions), then `dropSpace`: visible → switch to the tab before; hidden → removed, visible tab kept, `S.current` back to visible.
- Never zero tabs: the only tab closed → fresh space + terminal.

## Drops onto tabs

Tile and template drags (`drag.ts` `startDrag`; rows in `INPUT.md` "Drop targets"). Target under the pointer: `tabDropAt` (`tabs.ts`).

- Over a tab (gaps between tabs: the nearest one): that space. Over the rest of `#tabs` (`+`, the empty space right of it up to the toolbar's midpoint; with overflow, `+` and the strip's right edge): a new tab (`newTab({empty: true})`: no terminal).
- Empty toolbar between `+` and the shelf: split at `#toolbar`'s horizontal midpoint (`computeTarget`, checked before the tabs).
  - Left of it: a new tab, as above.
  - Right of it (toolbar's height): the shelf, slot 0 (`SHELF.md`).
  - Tab area past the midpoint: the whole gap is tabs; shelf past it: the whole gap is shelf. Plain rect math, no special cases.
- Tile → `moveToTab`: switch to the target tab, then `moveToSpace` (`ops.ts`): `detach`, `place(besidePlacement(null))` in the target space (root slot if its board is empty), active there; keys follow it. The source space: dropped from its `mru`, `focusNext` if it was active there; emptied, it closes like after `closeTile` (already hidden: just removed).
- Same tab: a board tile = no target (no highlight); a shelf item = unshelved beside the active tile (as `cmd+S`).
- Template → a new tile of its kind in that tab (or a new one), beside its active tile, default cwd (`S.cwd`); the tab is shown. `file`: picker first (default dir), cancel → nothing, no switch.
- Feedback: `.tab.drop` / `#tab-add.drop` (accent border + `--accent-soft` fill, like the board's `#preview`). While any tile drag runs (`body.tile-drag`) `+` matches the shelf's "+" hint: a `--slot` square, `--slot-gap` from the last tab, dashed accent border. Outside drags: its usual look. No board preview.
- CLI (`CLI.md` "Placement"): `tie move --tab <tab|new>`, `tie add --tab`: same placement (`moveToSpace`, `activate: false` into the visible tab), but the visible tab stays unless `--focus` (or the moved tile was the last of the tab on screen: the user follows it). `new`: an empty tab after the visible one, not shown (driver `addTab`; `newTab` would switch).

## Limitations

- No tab commands over the CLI beyond `--tab` (new tab, move into a tab): no close, rename, reorder or switch (except `--focus`).
