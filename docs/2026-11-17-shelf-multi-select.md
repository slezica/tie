# Shelf multi-select

Status: open. Spec settled 2026-11-17; implementation by phase.

# Topic

Select several shelved tiles, act on them together: close, unshelve, move to a tab, drag as a group.

# Current state

- Item click: pin / unpin (`shelf.ts`, via `startDrag`'s `onClick`). Hover: reveal.
- Pinned item look: accent fill + accent icon (`.item.pinned`). Pinned tile: accent border + `#peak`.
- Drag: one source (`DragSource`), one `Target` with `preview` (+ `also` for swap). Shift during a drag: float.
- Shift+click on a ×: close without asking.
- `cmd+W` (`close-tile`): closes the active tile; nothing active: no-op.
- Closing a tab asks once per busy tile (`close.ts`).

# Settled

Selection.

- `cmd+click` on a shelf item toggles it in the selection (in, or out if already in).
- Cmd held while hovering an item: no reveal.
- First `cmd+click`: the active tile loses focus (nothing active). The clicked tile is not shown.
- A pinned tile is not pulled in: click A (pinned), `cmd+click` B → selection {B}; A stays pinned, unfocused.
- De-select: plain click anywhere (item, board, tab), Escape, any shortcut that is not a group action, tab switch, drag of a non-selected thing, context menu on a non-selected thing. Hover and scroll: no.
- Model: `selected: Set<id>` per space; only shelved tiles.

Look.

- Selected item: accent fill + accent icon (today's pinned look).
- Pinned item: loses that look. The pinned tile's accent border + peak are the indicator.

Actions on the selection.

- Close all: `cmd+W`. Busy tiles: one question per tile.
- Unshelve all.
- Move all to a tab.
- Drag as a group (below).

Scope.

- Shelf tiles only. Board tiles: not now.
- Selection of 1: a selection like any other (`cmd+W` closes it unseen).
- `cmd+click` while a hover reveal shows (cmd pressed after hovering): the reveal is dismissed.
- Group order everywhere: shelf order.
- After a group action (unshelve, move, drop): selection cleared, the group's first tile active.
- No "without asking" variant for groups: a group close confirms like single closes (busy tiles, browser beforeunload).

Triggers.

- `cmd+W`: close all.
- `cmd+S`: unshelve all, beside the recent board tile (`besidePlacement`).
- Right-click a selected item: group menu (`Unshelve N tiles`, `Move N to tab ▸`, `Close N tiles`); selection kept.
- Right-click a non-selected item: de-select, its own menu.

Group drag.

- Starts on a selected item: the group. On a non-selected item: de-select, single drag.
- Tile edge: the group takes the area a single drop would take, split evenly along that area's longer side.
- Tile center: no center zone for groups; nearest edge.
- Empty board: the group fills it, split along the longer side.
- Shelf strip: reorder as a block.
- Tab: all join that tab's board.
- Shift (float): floats cascade from the pointer.
- Preview: one highlight per tile. Escape cancels.

Scripting.

- `tie list --json`: `selected` (boolean) per tile.

# Pending

Nothing open.

# Plan

## Phase 1: selection

1. State: `selected: Set<id>` per space (`state.ts`), ops `toggleSelected`, `clearSelection` (`ops.ts`); a tile leaving the shelf or closing leaves the selection.
2. `shelf.ts`: `cmd+click` toggles; cmd held: no hover reveal; reveal dismissed on `cmd+click`; first selection blurs the active tile.
3. De-select paths: plain click anywhere, Escape, non-group shortcuts, tab switch, foreign drag, foreign context menu.
4. Look: `.item.selected` takes the accent fill + icon; `.item.pinned` loses it.
5. `tie list --json` `selected`; docs (`SHELF.md`, `INPUT.md`, `CLI.md`, `AGENTS.md` model).
6. Scenario `shelf-select`.

## Phase 2: group actions

1. `cmd+W` closes the selection (one question per busy tile, `close.ts`); `cmd+S` unshelves it.
2. Group menu on a selected item: unshelve, move to tab, close.
3. Order: shelf order; after: selection cleared, first tile active.
4. Scenario `shelf-select-actions`.

## Phase 3: group drag

1. `core/layout.ts`: `insertGroup(tree, ids, at, side, rect)` (split along the longer side) + unit tests.
2. `drag.ts`: `DragSource` group, targets (edge, empty board, strip block, tab, float cascade), no center zone, `Target.previews: Rect[]`.
3. Preview elements: one per tile (pool); ghost shows the group (count).
4. Scenario `shelf-select-drag` (preview rects = landing rects, Escape cancels, each target).

## Phase 4: board tiles

Not now.
