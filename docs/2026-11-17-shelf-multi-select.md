# Shelf multi-select

Status: open. Spec settled 2026-11-17; Phases 1-3 done 2026-11-17; Phase 4 (board tiles) not now.

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

## Phase 1: selection (done)

1. State: `selected: Set<id>` per space (`state.ts`), ops `toggleSelected`, `clearSelection` (`ops.ts`); a tile leaving the shelf or closing leaves the selection.
2. `shelf.ts`: `cmd+click` toggles; cmd held: no hover reveal; reveal dismissed on `cmd+click`; first selection blurs the active tile.
3. De-select paths: plain click anywhere, Escape, non-group shortcuts, tab switch, foreign drag, foreign context menu.
4. Look: `.item.selected` takes the accent fill + icon; `.item.pinned` loses it.
5. `tie list --json` `selected`; docs (`SHELF.md`, `INPUT.md`, `CLI.md`, `AGENTS.md` model).
6. Scenario `shelf-select`.

## Phase 2: group actions (done)

1. `cmd+W` closes the selection (one question per busy tile, `close.ts`); `cmd+S` unshelves it.
2. Group menu on a selected item: unshelve, move to tab, close.
3. Order: shelf order; after: selection cleared, first tile active.
4. Scenario `shelf-select-actions`.

## Notes (Phases 1-2)

- Invariant: selection ⇒ nothing active. `activate()` clears the space's selection: every path handing a tile the keys de-selects (frame / guest clicks included, which never reach the UI's pointerdown).
- CLI placements without `--focus` (`place`, "nothing has input → activate") treat a selection as the user's input: no activation, the selection survives a `tie move` of another tile.
- Escape, non-group shortcuts, toggling the last item out: keys back to the most recent board tile (`focusNext`); a shortcut then runs (cmd+D splits from it). Plain clicks: the clicked thing decides; a plain item click still pins.
- Plain click on a pinned item clears the selection and unpins (its normal click).
- A pinned item can be `cmd+click`ed in (it is shelved); it stays pinned.
- Unshelve / move as a group: each beside the previous on the first's side, then `spreadEven`. Replaced in Phase 3 by `insertGroup` (longer-side rule).
- The single-tile menu has no "move to tab"; the group submenu lists the other tabs (`N · title`) + `New tab` (same targets as a tab drop). Own tab omitted (= Unshelve).
- Group close: after the questions, nothing active → `focusNext`.
- Clicks on the toolbar's empty area (`-webkit-app-region: drag`) never reach the page: they don't de-select. Items, tabs, `+` do.
- Drag of a selected item: de-selects, single drag. Replaced in Phase 3 (group drag).

## Phase 3: group drag (done)

1. `core/layout.ts`: `insertGroup(tree, ids, at, side, rect)` (split along the longer side) + unit tests.
2. `drag.ts`: `DragSource` group, targets (edge, empty board, strip block, tab, float cascade), no center zone, `Target.previews: Rect[]`.
3. Preview elements: one per tile (pool); ghost shows the group (count).
4. Scenario `shelf-select-drag` (preview rects = landing rects, Escape cancels, each target).

## Notes (Phase 3)

- `insertGroup(root, at, side, ids, board, opts)`: rect-dependence explicit: measures the single insert's area with `compute` in `board` / `opts` (the board's `layoutOpts()`). Pure, unit-tested.
- One landing for all paths: `placeGroup` (`cmd+S`, Move to tab, drag) → `insertGroup`. `spreadEven` removed. Changes Phase 2's arrangement: `cmd+S` beside a lone wide tile lands in its right half (tall) → stacked, not side by side (`shelf-select-actions` updated).
- Donors: every group leaf has the target as donor (not a chain): closing the whole group in any order restores the target; one of a nested group shares within the group.
- Selected-item press: no longer de-selects at pointerdown; drag = group, click (no movement) = de-select + pin / unpin.
- Strip: group items hidden, one ghost per tile (its icon) from the slot under the pointer: what you see is where it lands. Elsewhere the "+" hint is as wide as the hidden items (`--drag-slots`): width stable. Fixed: the hint's border was outside its width (+2 px during any drag over the board).
- Strip drop: block among the other items; nothing activated (a reorder shows nothing), keys to the recent board tile. Deviates from "first tile active" on purpose: activating a shelved tile without a pin would hide it again.
- Floats cascade: the first where a single float would land (grab at the pointer), each next `TITLE` px up-left, behind it: the title bars stay visible; clamped per tile (near the top-left edge they can stack up).
- Ghost: first icon + "N tiles".
- Escape: selection kept.
- Group of 1 (one selected item dragged): a group like any (no center zone: no swap).

## Phase 4: board tiles

Not now.
