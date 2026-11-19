# Shelf

The shelf is where shelved tiles live (`S.shelf`, per space; `location(id) === 'shelved'`, `tie add --shelved`). Shown as a strip of icons in the toolbar (`TABS.md`): `#shelf`, one `.item` per shelved tile in `S.shelf` order, growing leftward from the template list. No fixed window region: `shelfRect()` is the strip's DOM box.

Beside it, at the toolbar's right edge: the template list `#templates` (`TEMPLATES` in `kinds/index.ts`: `terminal`, `file`, `browser`; glyphs `terminal`, `folder`, `browser`), not part of the shelf.

- Template: drag onto board → new tile there (cwd: the tile next to it, else the active one: `DIRECTORIES.md`); onto the shelf → new shelved tile; onto a tab or `+` → new tile there (`TABS.md`).
- `file` template: the drop opens Tie's file picker first (`INPUT.md` "File picker"; starts in the context tile's cwd); cancel → no tile. By key: `cmd+O` / `cmd+shift+O`. Its kind as for `tie add` (extension, else content: `VIEWERS.md`); not openable (too large...) → modal with the reason.
- Finder drops of files on the board or the shelf follow the same rules (`INPUT.md`).
- Item: icon only (`displayIcon`, `TILES.md` "Host": built-in glyph SVG, or the custom icon as text), title as tooltip (`displayTitle`), activity dot, ping dot, exit mark (`✓` green / `✗` red). Square slot: `--slot` (28 px).
- Right-click item: tile menu (`INPUT.md`); a selected item: the group menu ("Selection").
- Look: hover, revealed and pinned items: `--fg-b` fill, text-colored icon. Selected: `--accent-soft` fill + accent icon (`.item.selected`). Pinned has no look of its own: the pinned tile's accent border + `#peak` say it.

## In and out

| Action | Result |
|---|---|
| Drag tile onto the shelf strip | Shelved at the ghost slot (slot under the pointer) |
| Drag item within the strip | Reorder |
| Drag item onto board | Unshelve, normal drop rules (`INPUT.md`) |
| Drag item onto a board tile's center zone | Swap: the item takes that slot, the tile is shelved at the item's index |
| Drag template / OS file onto a board tile's center zone | The new tile takes that slot, the tile is appended to the shelf |
| Drag item onto a tab | Joins that tab's board (its own tab: back on the board), `TABS.md` "Drops onto tabs" |
| `tie add/move --shelve` | Appended |

- The drop zone is the strip itself (`shelfRect()`), plus the empty toolbar left of it up to the toolbar's midpoint (or `+`), over the toolbar's height: slot 0 there (`TABS.md` "Drops onto tabs"). An empty shelf keeps one slot's width so it still takes a drop. Templates are not a drop target.
- While a tile or template is dragged (`body.tile-drag`; OS file drags too, `body.os-drag`): a dashed "+" hint slot at the strip's left end (`#shelf::before`, accent dashed border). Over the strip (or its gap half): the ghost slot (`.item.ghost`, the dragged thing's icon; accent border + `--accent-soft` fill, like the board's `#preview`) at the slot under the pointer instead (`#shelf.landing`): what you see is where it lands. A dragged shelf item is hidden meanwhile (`.item.drag-source`): the ghost stands for it. Hint and ghost are one slot, so the strip's width never changes during a drag.
- A group drag ("Group drag"): all its items hidden; over the strip one ghost per tile (its icon, in order) from the slot under the pointer; elsewhere the "+" hint is as wide as the hidden items (`--drag-slots` on `#shelf`, set by `drag.ts`). The width holds either way.
- Slot under the pointer: by pitch (`--slot` + `--slot-gap`) from the strip's left edge (`drag.ts` `computeTarget`), counted among the items shown; the placement index is into `S.shelf` (the hidden source included; `place()` detaches first).
- Shelving the active tile → `focusNext()`. Shelving clears activity.
- Items grow leftward: a new item lands where the previous last one was. Under the pointer, it is revealed at once (hover rule below; Blink re-hovers after layout while the window is active: `ENGINE.md`).

## Space

The shelf wins the toolbar contest: it keeps its content width while the tab list shrinks, down to the tab list's floor (`--tabs-min`); past that the strip shrinks and scrolls sideways (no scrollbar). `TABS.md` "Overflow".

## Reveal and pin

| State | Trigger | Tile | Interactive |
|---|---|---|---|
| Hidden | default | `visibility: hidden` | no |
| Revealed | hover item (`S.revealed`) | shown next to item, above every tile | yes; keys stay with the active tile until a click |
| Pinned | click item, click inside the reveal, title bar Pin, `tie focus` (`S.pinned`) | shown, active, until unpinned | yes |

- Position: next to the item on the board side: above it with the toolbar at the bottom, below it with the toolbar on top. Horizontally centered on the item (`getBoundingClientRect()` in `render.ts`), clamped into the board; vertically against the board edge nearest the toolbar, `--peak` + 2 px in.
- Hover zone: item ∪ reveal ∪ band between them (the gap, spanning both along the other axis; `inRevealZone`, `core/layout.ts`, orientation-agnostic). The pointer can travel from the item into the reveal (across the gap and `#peak`); leaving the zone (or the window) dismisses. Along the toolbar, off the item: dismissed.
- Zone check: document `pointermove` (capture) + item `pointerleave`, against the item's box and the reveal's rect (`S.rects`). Over a frame or guest inside the reveal the UI gets no moves; leaving it crosses the tile's UI border, so the check still runs.
- The document's `pointerleave` runs the same zone check with the event's position; it is not taken as "left the window". The toolbar is a window drag region (`-webkit-app-region: drag`): over it macOS owns the pointer and Chromium reports it as leaving the document, and the strip between the item and the board is such a region. A real exit lands outside the zone (window edges are outside item, reveal and band), so it still dismisses.
- Click inside a hover reveal = pin (UI realm: delegated `pointerdown`, `main.ts`; frame or guest: window `blur` → `frame.ts`). It then stays when the pointer leaves, like a click on the item.
- Title bar pin button (`.btn.pin`, `setButtons` in `render.ts`): shown only on a shown shelved tile. Hover reveal → Pin (pins + activates, on click; pointerdown on it doesn't pin); pinned → Unpin. Hidden for slotted / floating tiles.
- A pin stays until released. Unpin paths: item click, Unpin button, closing the tile, leaving the shelf (drag, `cmd+S`, swap, `tie move`: `detach`). Unpinning an active shelved tile → `focusNext()`.
- Nothing else unpins: clicks outside (board tiles, frames, guests: they activate that tile), focus keys, `tie focus` of a board tile, new tiles. The reveal stays on top, unfocused.
- `tie focus --tile <shelved id>` pins (switches tab first).
- Hover reveal cleared on drag start, on a `cmd+click` selection, and when leaving the tab.
- Reveal shows only the pin and close buttons.
- Size: 30% × 50% of board (`revealSize()`), independent of item position: pty size never changes on hover. Shelved tiles stay laid out at this size while hidden.
- z-order: reveal 2000 (hovered +1), above zoomed (1000) and floating tiles, browser guests included (`<webview>` composites in the DOM).
- `#peak`: arrow from the reveal toward the item (down, or up with `.up` when the toolbar is on top). Accent when pinned (with the tile's accent border: the pin's only indicator).

## Selection

`cmd+click` items to act on several shelved tiles at once. Record: `docs/2026-11-17-shelf-multi-select.md`.

- Model: `Space.selected: Set<id>` (`S.selected`), shelved tiles of that space only. `selection()`: in shelf order (every group action's order).
- `cmd+click` (`toggleSelected`, `ops.ts`; the press's `metaKey`, the click arrives via `startDrag`): in, or out. Selecting: nothing active (keys go nowhere, `refocus` blurs), a hover reveal is dismissed; the clicked tile is never shown. A pinned tile stays pinned (shown, unfocused) and isn't pulled in; it can be `cmd+click`ed in like any item. Toggling the last one out: `focusNext`.
- Cmd held over an item (`pointerenter` `metaKey`): no reveal.
- Invariant: a selection means nothing active. `activate()` clears its space's selection (so every path that hands a tile the keys de-selects: clicks in frames, `tie focus`, pins). CLI placements without `--focus` count a selection as the user's input: they don't activate (`place`).
- De-select (`clearSelection`): pointerdown anywhere but a `cmd+click` on an item / a selected item / a menu / a modal (capture, `shelf.ts` `initSelection`; the click then acts as usual, e.g. pins); Escape (not when a menu, modal, drag or text field takes it); any shortcut but the group ones; tab switch (the tab left); any drag but one from a selected item (`drag.ts` begin); context menu on anything but a selected item. Hover and scroll keep it. Escape, shortcuts: keys back to the most recent board tile.
- A tile that closes or leaves the shelf by any path (drag, swap, CLI `move`) leaves the selection (`detach`, `swap`).
- Group actions (selection cleared):
  - `cmd+W` (`close-tile`), menu `Close N tiles`: `requestCloseGroup` (`close.ts`): each asks as a single close does (busy, beforeunload), one at a time; a declined tile stays shelved, the rest close. Then nothing active: `focusNext`.
  - `cmd+S` (`toggle-shelf`), menu `Unshelve N tiles`: `unshelveGroup`: beside the recent board tile (`besidePlacement`) as a group (`placeGroup` → `insertGroup`, `LAYOUT.md` "Group insertion"); the first tile active.
  - Menu `Move N to tab ▸`: the other tabs (`N · title`) + `New tab`; that tab is shown, the tiles join its board as with `cmd+S` there, the first active (`moveGroupToTab` → `moveGroupToSpace`). Emptied source tab closes.
- Drag of a selected item (cmd held or not): the group ("Group drag"). A plain click on a selected item (no movement): de-selects, then its normal click (pin / unpin); `initSelection` leaves that press to the item.
- `tie list`: `selected` (`CLI.md`).

## Group drag

A drag starting on a selected item drags the selection (`drag.ts`: `DragSource` `group`, `selection()` at drag start, shelf order). Targets (`groupTarget`, `dropGroup`):

| Over | Result |
|---|---|
| Slotted tile, anywhere | Its nearest edge (`nearestEdge`; no center zone: no swap, no displace): the area one tile dropped there would take, split evenly along its longer side, in order (`placeGroup`, `LAYOUT.md` "Group insertion") |
| Empty board | Fills it, split along its longer side |
| Shift, board | Each floats (`floatGroup`): the first where a single tile would, each next `TITLE` px up and left of the previous, clamped to the board (`clampFloat`); the first in front |
| Strip | Block reorder at the slot under the pointer, among the other items, order kept (`shelveGroup`) |
| Tab / `+` | All join that tab (or a new one) as "Move N to tab" (`moveGroupToTab`) |

- Preview: one rect per tile, from the same insertion the drop applies (preview = result). Pool: `#preview`, `#preview2`, then `.drop-preview` made on demand (`drag.ts` `showPreviews`). Floats: dashed.
- Pointer ghost (`#ghost`): the first tile's icon + "N tiles".
- After a drop: selection cleared, the first tile active. Strip reorder: nothing shown, keys back to the recent board tile (`focusNext`).
- Escape (or a pointer cancel): nothing moves, the selection stays.

## Activity

- `noteActivity()` (`Host.activity`) on pty data (terminals), file changes (file views), live reloads (html): dot on shelved tiles not revealed or pinned.
- Cleared by hover, pin, re-shelve.

## Scenarios

`shelf`, `shelf-reveal`, `shelf-select`, `shelf-select-actions`, `shelf-select-close-browser`, `shelf-select-drag`, `templates`.
