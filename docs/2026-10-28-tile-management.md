# Tile management, pills, markdown lists

Session record. PENDING items 4, 5, 6, 7, 8, 15 + markdown list alignment. Item 10 (shelf ghost slot) found done (`78dd6ea`): dropped.

# Settled

- Tab drops (4, 5): any dragged tile (board or shelf) or template onto a tab = joins that tab (`besidePlacement` there); onto the tab list's empty space, its right edge when full, or the `+` button = new tab holding it. Templates: a new tile of that kind in the target tab.
- Swap (6, 8): one op `swap(a, b)` exchanging locations generically (slot ↔ slot, shelf ↔ slot, float ↔ slot). Any tile dropped on a title bar swaps with that tile (accepted: the title bar no longer offers the top-edge split; tiles are rarely that short). `cmd+shift+arrows` swaps with the tile `cmd+arrows` would focus.
- cmd+S (7): shelve the active tile; if it is a shown (pinned) shelved tile, unshelve it via `besidePlacement`. Action `toggle-shelf`.
- Pills (15): `Surface.pill` becomes a list; each pill: label, title, on, optional toggle, optional color, optional gravity (right). File kinds show a static "Missing" pill while `doc.missing`.
- Markdown lists: markers left-aligned, flush with the body text's left edge; item text indented by a fixed width, wrapped lines aligned with the first (hanging). Body gets wider left/right margins.

# Plan

- Phase 1 (parallel): B = swap op + cmd+shift+arrows + cmd+S. D = pills + "Missing" + markdown lists.
- Phase 2 (after B): A = drag targets: tabs (4, 5), title-bar swap (6).

# Done

- Commits: `a43305e` layout swap op, `2702187` swap/shelve keys, `c258c65` pills + Missing, `07ff0fe` markdown lists, `e538150` tab drops, `9b7a166` title-bar swap, harness fix for `toolbar-overflow` (tab count to overflow depends on the cwd title; opens tabs until overflow with settled titles).
- Scenarios: `swap`, `tab-drops`, `title-swap`; `markdown` covers the Missing pill. Full e2e green.

# Notes

- Tab drop: switches to the target tab, the moved tile is active there; emptied source tab closes. Templates open beside the target tab's active tile, default cwd.
- Swap by drag: title bar = top `TITLE` px (collapsed: the whole tile); Shift still floats. Preview: both rects (`#preview2`).
- cmd+shift+arrows and cmd+S are Tie's everywhere, browser tiles included (as cmd+arrows already were).
- Markdown numbers of 3+ digits are wider than the 2em indent (accepted, rare).
- `gravity: 'left'` and non-red pill colors have no user yet.

# Pending

- `tie move --tab / --swap` (PENDING 15). Tab-list auto-scroll during tile drags (PENDING 4).
