# Shelf

The shelf is where shelved tiles live (`S.shelf`, per space; `location(id) === 'shelved'`, `tie add --shelved`). It is shown as a strip of icons in the toolbar (`TABS.md`): `#shelf`, one `.item` per shelved tile in `S.shelf` order, growing leftward from the template list. Nothing in code or docs assumes a fixed region of the window for it: `shelfRect()` is the strip's DOM box.

Beside it, at the toolbar's right edge: the template list `#templates` (`TEMPLATES` in `kinds/index.ts`: `terminal`, `file`, `browser`; each a `GLYPH` SVG: prompt, folder, globe), not part of the shelf.

- Template: drag onto board → new tile there (next to a tile: starts in its shell's cwd); onto the shelf → new shelved tile; onto a tab or `+` → new tile there (`TABS.md`).
- `file` template: the drop opens a file picker first (any file; starts in the target tile's directory); cancel → no tile. Its kind as for `tie add` (extension, else content: `VIEWERS.md`); not openable (too large...) → modal with the reason.
- Finder drops of files on the board or the shelf follow the same rules (`INPUT.md`).
- Item: icon only (`displayIcon`, `TERMINALS.md`: built-in glyph SVG, or the custom icon as text), title as tooltip (`displayTitle`), activity dot, ping dot, exit mark (`✓` green / `✗` red). Square slot: `--slot` (28 px).
- Right-click item: tile menu (`INPUT.md`).

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
- Slot under the pointer: by pitch (`--slot` + `--slot-gap`) from the strip's left edge (`drag.ts` `computeTarget`), counted among the items shown; the placement index is into `S.shelf` (the hidden source included; `place()` detaches first).
- Shelving the active tile → `focusNext()`. Shelving clears activity.
- Items grow leftward: a new item lands where the previous last one was. Under the pointer, it is revealed at once (hover rule below).

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
- A pin stays until released. Unpin paths: item click, Unpin button, closing the tile, unshelving by drag, `tie move` (`detach`). Unpinning an active shelved tile → `focusNext()`.
- Nothing else unpins: clicks outside (board tiles, frames, guests: they activate that tile), focus keys, `tie focus` of a board tile, new tiles. The reveal stays on top, unfocused.
- `tie focus --tile <shelved id>` pins (switches tab first).
- Hover reveal cleared on drag start and when leaving the tab.
- Reveal shows only the pin and close buttons.
- Size: 30% × 50% of board (`revealSize()`), independent of item position: pty size never changes on hover. Shelved tiles stay laid out at this size while hidden.
- z-order: reveal 2000 (hovered +1), above zoomed (1000) and floating tiles, browser guests included (`<webview>` composites in the DOM).
- `#peak`: arrow from the reveal toward the item (down, or up with `.up` when the toolbar is on top). Accent when pinned.

## Activity

- `noteActivity()` on pty data (terminals) or file changes (markdown): dot on shelved tiles not revealed or pinned.
- Cleared by hover, pin, re-shelve.
