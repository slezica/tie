# Shelf

The shelf is where shelved tiles live (`S.shelf`, per space; `location(id) === 'shelved'`, `tie add --shelved`). Shown as a strip of icons in a bar (the `shelf` component, `LAYOUT.md` "Bars"; default: the bottom bar's end): `#shelf`, one `.item` per shelved tile in `S.shelf` order. No fixed window region: `shelfRect()` is the strip's DOM box.

The template list `#templates` (the `templates` component; default: right of the shelf, in the same bar) (`TEMPLATES` in `kinds/index.ts`: `terminal`, `file`, `browser`; glyphs `terminal`, `folder`, `browser`), not part of the shelf.

- Template: drag onto board → new tile there (cwd: the tile next to it, else the active one: `DIRECTORIES.md`); onto the shelf → new shelved tile; onto a tab or `+` → new tile there (`TABS.md`).
- `file` template: the drop opens Tie's file picker first (`INPUT.md` "File picker"; starts in the context tile's cwd); cancel → no tile. By key: `cmd+O` / `cmd+shift+O`. Its kind as for `tie add` (extension, else content: `VIEWERS.md`); not openable (too large...) → modal with the reason.
- Finder drops of files on the board or the shelf follow the same rules (`INPUT.md`).
- Item: icon (`displayIcon`, `TILES.md` "Host": built-in glyph SVG, or the custom icon as text), title as tooltip (`displayTitle`), activity dot, ping dot, exit mark (`✓` green / `✗` red). Square slot: `--slot` (28 px at the default bar size; × the bar's scale in a resized top / bottom bar: "Forms"). The title also as text (`.lbl`) in a vertical bar's list form ("Forms").
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

- The drop zone is the strip itself (`shelfRect()`), plus the bar space nearest it in its bar (`LAYOUT.md` "Drops on bars"): before the strip → slot 0, after it → the end. An empty shelf keeps one slot's width so it still takes a drop. Templates are not a drop target.
- While a tile or template is dragged (`body.tile-drag`; OS file drags too, `body.os-drag`): a dashed "+" hint slot at the strip's start (left end; top in a vertical bar) (`#shelf::before`, accent dashed border; a row in the list form, an `--item` square when narrow). Over the strip (or the bar space nearest it): the ghost slot (`.item.ghost`, the dragged thing's icon; accent border + `--accent-soft` fill, like the board's `#preview`) at the slot under the pointer instead (`#shelf.landing`): what you see is where it lands. A dragged shelf item is hidden meanwhile (`.item.drag-source`): the ghost stands for it. Hint and ghost are one slot, so the strip's size never changes during a drag.
- A group drag ("Group drag"): all its items hidden; over the strip one ghost per tile (its icon, in order) from the slot under the pointer; elsewhere the "+" hint is as long as the hidden items (`--drag-slots` on `#shelf`, set by `drag.ts`). The size holds either way.
- Slot under the pointer: by pitch (an item's size along the bar, measured: `--slot`, or the scaled size in a narrow bar; + `--slot-gap`) from the strip's start along its bar's axis, scroll included (`drag.ts` `computeTarget`), counted among the items shown; the placement index is into `S.shelf` (the hidden source included; `place()` detaches first).
- The strip grows by one slot when a drag starts (hint), toward the bar's middle for an end group: items stay put, the free space shrinks.
- Shelving the active tile → `focusNext()`. Shelving clears activity.
- A new item is appended (the strip's end: right, or bottom in a vertical bar). Under the pointer, it is revealed at once (hover rule below; Blink re-hovers after layout while the window is active: `ENGINE.md`).

## Space

In a bar shared with the tabs, the shelf wins the contest: it keeps its content size along the bar while the tab list shrinks, down to the tab list's floor (`--tabs-min`); past that the strip shrinks and scrolls along the bar (no scrollbar). Templates never shrink. Same in a vertical bar, along y.

Overflow (S17), as the tab list (`overflow.ts`, `TABS.md` "Overflow"):

- Fades at the cut ends (`.more-start` / `.more-end`, 24 px), synced on scroll, every `syncShelf()` and ghost change.
- Wheel (S18): horizontal bar: a vertical wheel scrolls it sideways (`sideWheel`); vertical bar: native.
- Auto-scroll while a tile, template, shelf item or group is dragged near its ends (`edgeScroll`, from `startDrag`): 24 px zones, only over the strip along its axis and on its bar across it. The ghost slot follows each step.
- No keep-in-view: a new item appended out of view stays there.

## Forms (by bar size)

Horizontal bars (top / bottom, S19): icons only, one row. Items, templates, glyphs and dots scale with the bar's height: 1x at 40 px, 1.5x at 60 px, a floor of 0.875x from 35 px down (`--k`, `LAYOUT.md` "Bar sizes").

Vertical bars (left / right, S14, S15): one item per row, never side by side. The form follows the bar's width: `.narrow` on the bar under `LIST_MIN` (100 px, `core/barsize.ts`; set by `barsize.ts` with the size: the threshold lives in JS only), else the list form.

- Narrow (48 to 99 px): icons only, centred. Size `--item` = the width less `--pad` each side (`100cqi`: the bar is a size container), clamped to `--slot` .. 1.5 × `--slot`: 36 px at 48, 42 px (1.5x) from 54 px on, then kept at 1.5x, centred, up to 99 px. Glyphs and custom icons scale with it (16 / 15 px at the default size). Choice: a dead band (54 to 99) of centred 1.5x icons rather than a list whose titles show a letter or two; at 100 px a title shows ~6 letters.
- List (100 px and wider): rows full width less `--pad`, `--slot` tall: the icon at the default size, then the title (`.lbl`, truncated): the tile's display title; templates: their label. Activity and ping dots at the row's end.
- Default width 160: the list form. Harness: `h.setBarSize(ctx, bar, px)` (`HARNESS.md`).

## Reveal and pin

| State | Trigger | Tile | Interactive |
|---|---|---|---|
| Hidden | default | `visibility: hidden` | no |
| Revealed | hover item (`S.revealed`) | shown next to item, above every tile | yes; keys stay with the active tile until a click |
| Pinned | click item, click inside the reveal, title bar Pin, `tie focus` (`S.pinned`) | shown, active, until unpinned | yes |

- Position: next to the item on the board side, by the shelf's bar in the layout (`barOfComponent('shelf')`, not geometry): below it (top bar), above it (bottom), right of it (left bar), left of it (right bar) (S16). Centred on the item along the bar (`getBoundingClientRect()` in `render.ts`), clamped into the board; across, against the board edge nearest the shelf's bar, `--peak` + 2 px in.
- Hover zone: item ∪ reveal ∪ band between them (the gap, spanning both along the other axis; `inRevealZone`, `core/layout.ts`, orientation-agnostic: unit tests for every bar). The pointer can travel from the item into the reveal (across the gap and `#peak`); leaving the zone (or the window) dismisses. Along the bar, off the item: dismissed.
- Zone check: document `pointermove` (capture) + item `pointerleave`, against the item's box and the reveal's rect (`S.rects`). Over a frame or guest inside the reveal the UI gets no moves; leaving it crosses the tile's UI border, so the check still runs.
- The document's `pointerleave` runs the same zone check with the event's position; it is not taken as "left the window". The bars are window drag regions (`-webkit-app-region: drag`): over them macOS owns the pointer and Chromium reports it as leaving the document, and the strip between the item and the board is such a region. A real exit lands outside the zone (window edges are outside item, reveal and band), so it still dismisses.
- Click inside a hover reveal = pin (UI realm: delegated `pointerdown`, `main.ts`; frame or guest: window `blur` → `frame.ts`). It then stays when the pointer leaves, like a click on the item.
- Title bar pin button (`.btn.pin`, `setButtons` in `render.ts`): shown only on a shown shelved tile. Hover reveal → Pin (pins + activates, on click; pointerdown on it doesn't pin); pinned → Unpin. Hidden for slotted / floating tiles.
- A pin stays until released. Unpin paths: item click, Unpin button, closing the tile, leaving the shelf (drag, `cmd+S`, swap, `tie move`: `detach`). Unpinning an active shelved tile → `focusNext()`.
- Nothing else unpins: clicks outside (board tiles, frames, guests: they activate that tile), focus keys, `tie focus` of a board tile, new tiles. The reveal stays on top, unfocused.
- `tie focus --tile <shelved id>` pins (switches tab first).
- Hover reveal cleared on drag start, on a `cmd+click` selection, and when leaving the tab.
- Reveal shows only the pin and close buttons.
- Size: 30% × 50% of board (`revealSize()`), independent of item position: pty size never changes on hover. Shelved tiles stay laid out at this size while hidden.
- z-order: reveal 2000 (hovered +1), above zoomed (1000) and floating tiles, browser guests included (`<webview>` composites in the DOM).
- `#peak`: arrow from the reveal toward the item, level with it (kept on the reveal's edge): down (bottom bar), `.up` (top), `.left` (left bar), `.right` (right bar). Accent when pinned (with the tile's accent border: the pin's only indicator).

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

`shelf`, `shelf-reveal`, `shelf-select`, `shelf-select-actions`, `shelf-select-close-browser`, `shelf-select-drag`, `shelf-vertical` (left / right bars, forms, templates), `shelf-overflow` (both axes), `templates`.
