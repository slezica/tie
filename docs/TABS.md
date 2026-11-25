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
- Clears the hover reveal and the shelf selection of the tab left.
- Hidden spaces' tiles: `display: none`; terminals keep running, fit skipped.

## Tab list

The `tabs` component: `#brand` (instance name when not `default`) then `#tabs` (the tab list `#tab-list` + `#tab-add`), in the bar the `bars` setting names (`LAYOUT.md` "Bars"). `#tabs` is content-sized: it shrinks first in its bar (floor: `--tabs-min`, or its content when narrower), the shelf after; templates never.

- Tab: ping dot, custom icon, title, close button. `+` adds a tab.
- Size: in a top / bottom bar, tabs, brand and `+` scale with the bar's height (`LAYOUT.md` "Bar sizes"): tab height = bar − 2 × 5 px × `--k`; text 12 px × `--k` (12 px at 40, the minimum; 18 px at 60). A tab there never shrinks below its content (up to its max width, 200 px × `--k`): 5 letters at least at every height (`layout-bars-scale`).
- Pointerdown switches; drag along the list reorders (live, 4 px threshold along the bar's axis). Near the list's ends it auto-scrolls ("Overflow"); the order follows.
- Axis: the bar's. Top / bottom bar: a row (x). Left / right bar: a column (y). Every rule below (reorder, drop target, keep-in-view, fades, auto-scroll) runs along it.

### In a vertical bar (left / right)

- Brand above the tabs (in line with the tab titles), `+` below the last tab.
- One tab per row, full bar width less `--pad` each side, 28 px tall.
- Title only, truncated with an ellipsis (S13). Custom icon shown if set (as horizontal). No default glyph (icon set: `PENDING.md`).
- Close button only on hover (the title keeps its room). Horizontal: also on the current tab.
- Minimum width (S54): none of their own; a side bar holding the tabs goes down to 40 px like any bar ("unusable, but that's up to the user, not the resizer"). At 40 a row's title box is 24 px: "tie" whole, "node_modules" as "n…", the brand cut ("dri…"); rows, brand and `+` stay inside the bar (`tabs-vertical`, shot `tmp/shots/round7-tabs-40.png`). The edit mode never grows a bar for them. A pinged tab's dot or a custom icon take from the title.
- Narrow bar (`.narrow`, 40 to 99 px, `SHELF.md` "Forms"): no close button at all, hover included (the title keeps the row); the context menu and middle-click still close. Padding 4 px each side (the narrow `--pad` 4 px too). From 100 px (list form) the hover close button keeps 5 letters.
- Never scaled (`--k` 1): rows 28 px tall at any width.
- `+` is a full-width row; while a tile drag runs, a `--slot` tall dashed row.
- Right-click: rename / set icon menu.

## Overflow

Shared with the shelf strip: `overflow.ts` (`syncFades`, `showChild`, `sideWheel`, `edgeScroll`), along the bar's axis.

- Tabs never shrink along the list (`flex: none`; horizontal: `max-width: 200px`). When they don't fit, `#tab-list` scrolls along the bar (no scrollbar). Wheel (S18): horizontal bar: trackpad, or a vertical wheel mapped to `scrollLeft` (`sideWheel`); vertical bar: native scroll.
- `#tabs.overflow` (list content larger than the list): divider after it (horizontal: right border; vertical: bottom border); none when last in a bar's end group. Fades (`mask-image`, `--fade-dir` `to right` / `to bottom`) at the list's ends where more tabs are: `.more-start` / `.more-end` (`syncFades`), synced on scroll and every `renderTabs()`.
- The current tab is scrolled into view (`showChild`, list-only scroll) when it changes or when the list's content size along its axis changes (titles, new tabs); a user's scroll otherwise stays.
- Floor: `#tabs` `min-width` (vertical: `min-height`) `calc-size(max-content, min(size, var(--tabs-min)))` (140 px: one tab and `+`; less when its content is smaller). Below it the shelf gives way (`SHELF.md` "Space").
- Auto-scroll while dragging (`edgeScroll`, `overflow.ts`): a tab reorder (`dragTab`) or a tile / template / shelf item / group over the list (`startDrag`). Zone: 24 px inside each end (`EDGE`, the fades' depth), only while the list can scroll that way. Speed by depth: 2 to 12 px per frame (`requestAnimationFrame`, no pointer moves needed). After each step the target is computed again under the still pointer (reorder index; `tabDropAt` + `markTabDrop`). Tab reorder: past the ends = deepest. Tile drag: only over the list itself along the axis, anywhere on its bar across it (`+` and the rest of `#tabs` are the new-tab target). Stops on leaving the zone, drop, Escape, cancel. While any runs (`edgeHolding`), `renderTabs` leaves the scroll alone (no snap back to the current tab); the next render after the drag catches up.

Title (`tabTitle`), first match:

1. `customTitle`.
2. Tile = active, else first shelved, any kind: its cwd's basename (`prettyDir(Tile.cwd)`, `~` for home; `DIRECTORIES.md`). A tile's cwd is always set: the tile's own title never names the tab.
3. No such tile: `empty`.

## Open and close

- New tab (`newTab`: `+`, cmd+T): inserted after the visible one, switched to, with a terminal (root slot, app cwd `S.cwd`: no context tile); `{empty: true}`: none (drops, CLI `new`). Boot: the first space gets a terminal (`main.ts`).
- Emptied tab: its last tile closed or moved out by any path (close button, cmd+W, `tie close`, a drop onto another tab, `tie move --tab`) closes the tab (`closeTile` / `moveToSpace` empty hook → `dropSpace`, registered by `initTabs`). Visible: back to the tab before; hidden: gone, the visible tab stays. The only tab stays: board empty (notice), title `empty`; cmd+W there (nothing active) does nothing.
- Close (tab ×, cmd+shift+W → `requestCloseTab`, `close.ts`): the tab with every tile (board, floats, shelf). Busy terminals listed first (confirm); idle or empty: at once; shift+click on the ×: no questions (`INPUT.md` "Closing").
- `closeTab(id)`: closes its tiles (no questions), then `dropSpace`: visible → switch to the tab before; hidden → removed, visible tab kept, `S.current` back to visible.
- Never zero tabs: the only tab closed → fresh space + terminal.

## Drops onto tabs

Tile and template drags (`drag.ts` `startDrag`; rows in `INPUT.md` "Drop targets"). Which component of a bar takes the drop: `barDropAt` (`LAYOUT.md` "Drops on bars").

- Over a tab (gaps between tabs: the nearest one along the bar's axis, `tabDropAt(x, y)`): that space.
- Over the rest of `#tabs` (`+`, the space after it; with overflow, the strip's edge): a new tab (`newTab({empty: true})`: no terminal).
- Bar space nearest the tabs (brand, the free space up to its midpoint with the shelf when both share the bar, all of it when the shelf is elsewhere): a new tab.
- Tile → `moveToTab`: switch to the target tab, then `moveToSpace` (`ops.ts`): `detach`, `place(besidePlacement(null))` in the target space (root slot if its board is empty), active there; keys follow it. The source space: dropped from its `mru`, `focusNext` if it was active there; emptied, it closes like after `closeTile` (already hidden: just removed).
- Same tab: a board tile = no target (no highlight); a shelf item = unshelved beside the active tile (as `cmd+S`).
- Template → a new tile of its kind in that tab (or a new one), beside its active tile; the tab is shown. Cwd: that tab's active tile's (fresh `cwdOf`; none → `S.cwd`), every kind; new tab → `S.cwd` (`DIRECTORIES.md`). `file`: picker first (from that dir), cancel → nothing, no switch.
- Feedback: `.tab.drop` / `#tab-add.drop` (accent border + `--accent-soft` fill, like the board's `#preview`). While any tile drag runs (`body.tile-drag`) `+` matches the shelf's "+" hint: a `--slot` square, `--slot-gap` from the last tab, dashed accent border. Outside drags: its usual look. No board preview.
- CLI (`CLI.md` "Placement"): `tie move --tab <tab|new>`, `tie add --tab`: same placement (`moveToSpace`, `activate: false` into the visible tab), but the visible tab stays unless `--focus` (or the moved tile was the last of the tab on screen: the user follows it). `new`: an empty tab after the visible one, not shown (driver `addTab`; `newTab` would switch).

## Limitations

- No tab commands over the CLI beyond `--tab` (new tab, move into a tab): no close, rename, reorder or switch (except `--focus`).

## Scenarios

`tabs`, `tabs-drops`, `tabs-overflow` (both axes), `tabs-vertical` (also the minimum width: 40 px rows, characters shown, edit mode drop), `cli-tabs`, `layout-bars-scale` (sizes, 5 letters horizontal, narrow tabs on hover).
