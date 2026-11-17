# Shelf multi-select

Status: open. Phase 1 (understanding).

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
- Model: `selected: Set<id>` per space; only shelved tiles (for now, Pending 1).

Look.

- Selected item: accent fill + accent icon (today's pinned look).
- Pinned item: loses that look. The pinned tile's accent border + peak are the indicator.

Actions on the selection.

- Close all: `cmd+W`. Busy tiles: one question per tile.
- Unshelve all.
- Move all to a tab.
- Drag as a group. Onto the board: one highlight per tile, where each would land. Escape cancels, as always.

# Pending

1. Board tiles. Selectable too (`cmd+click` on a title bar)? Mine: later phase. Different questions (what "group drag" of slotted tiles means, zoom, floats).
2. Group drop on a tile's edge. Tile T, group s1 s2 s3, dropped on T's right:
    - a. Side by side: `T | s1 | s2 | s3`. T keeps half, the group shares the other half.
    - b. Stacked across: `T | [s1 / s2 / s3]`. Same halves, group split the other way.
    - c. Follows the area's shape: split along its longer side.
    - Mine: c. Avoids slivers. Uncertain: less predictable than a fixed rule.
3. Group drop on a tile's center (single: swap / displace). Mine: no center zone for groups; nearest edge instead.
4. Group drop elsewhere. Mine:
    - Empty board: fills it, split along the longer side.
    - Shelf strip: reorder as a block, shelf order kept.
    - Tab: all join that tab's board.
    - Shift (float): floats cascade from the pointer, offset each.
5. Order of the group: shelf order (mine), or click order?
6. Triggers for unshelve / move to tab. Mine:
    - Right-click a selected item: group menu (`Unshelve 3 tiles`, `Move 3 to tab ▸`, `Close 3 tiles`). Selection kept.
    - `cmd+S` with a selection: unshelve all, beside the recent board tile.
7. Drag starts on a selected item: the group. On a non-selected item: de-select, single drag. OK?
8. After a group action (unshelve, move, drop): selection cleared. Which tile is active after? Mine: the first of the group.
9. `cmd+click` while a hover reveal is already showing (cmd pressed after hovering): dismiss the reveal. OK?
10. Selection of 1: same as any selection (`cmd+W` closes it without it ever being shown). OK?
11. `shift+cmd+W` semantics? Today `cmd+shift+W` closes the tab. No "close all without asking" for groups unless wanted.
12. Scripting: `tie list --json` gets `selected`? Needed by the harness anyway (dev `state`).

# Plan

After Pending closes. Expected phases:

1. Model + selection (click, hover rule, de-select paths, look). Scenario.
2. Close (`cmd+W`), unshelve, move to tab; group menu. Scenario.
3. Group drag: targets, multi-preview, ghost, drops. Core layout function for "N tiles into an area" (unit tests). Scenario.
4. Board tiles, if wanted.
