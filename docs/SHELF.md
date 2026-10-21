# Shelf

Right-hand column per space: `#templates` (`TEMPLATES` in `kinds/index.ts`: `terminal`, `file`, `browser`; each a `GLYPH` SVG: prompt, folder, globe), `.sep`, `#items` (one `.item` per shelved tile, `S.shelf` order).

- Template: drag onto board → new tile there (next to a tile: starts in its shell's cwd); onto shelf → new shelved tile.
- `file` template: the drop opens a file picker first (any file; starts in the target tile's directory); cancel → no tile. Its kind as for `tie open` (extension, else content: `VIEWERS.md`); not openable (too large...) → modal with the reason.
- Finder drops of files on the board or shelf follow the same rules (`INPUT.md`).
- Item: icon + label (`displayTitle`/`displayIcon`, `TERMINALS.md`: built-in glyph SVG, or the custom icon as text), activity dot, ping dot, exit mark (`✓` green / `✗` red).
- Right-click item: tile menu (`INPUT.md`).

## In and out

| Action | Result |
|---|---|
| Drag tile onto shelf | Shelved at insert line (by item vertical midpoints) |
| Drag item within shelf | Reorder |
| Drag item onto board | Unshelve, normal drop rules (`INPUT.md`) |
| `tie open/move --shelve` | Appended |

- Shelving the active tile → `focusNext()`. Shelving clears activity.

## Reveal and pin

| State | Trigger | Tile | Interactive |
|---|---|---|---|
| Hidden | default | `visibility: hidden` | no |
| Revealed | hover item (`S.revealed`) | shown next to item, above every tile | yes; keys stay with the active tile until a click |
| Pinned | click item, or click inside the reveal (`S.pinned`) | shown, active | yes |

- Hover zone: item ∪ reveal ∪ band between them (reveal's right edge to item's left edge, spanning both vertically; `inRevealZone`, `core/layout.ts`). The pointer can travel from the item into the reveal (across the gap and `#peak`); leaving the zone (or the window) dismisses.
- Zone check: document `pointermove` (capture) + item `pointerleave`, against the item's box and the reveal's rect (`S.rects`). Over a frame or guest inside the reveal the UI gets no moves; leaving it crosses the tile's UI border, so the check still runs.
- Click inside a hover reveal = pin (UI realm: delegated `pointerdown`, `main.ts`; frame or guest: window `blur` → `frame.ts`). It then stays when the pointer leaves, like a click on the item.
- Unpin: click item again, or pointerdown outside tile and item (menu excluded). Unpinning an active shelved tile → `focusNext()`. Clicks into another tile's frame or guest don't reach the UI: they activate that tile, the pin stays.
- Keyboard focus changes (focus keys, `tie focus` of a board tile, new tiles) keep the pin; the reveal stays on top, unfocused.
- `tie focus <shelved id>` pins (switches tab first).
- Hover reveal cleared on drag start and when leaving the tab.
- Reveal shows only the close button.
- Size: 30% × 50% of board (`revealSize()`), independent of item position: pty size never changes on hover. Shelved tiles stay laid out at this size while hidden.
- Position: left of shelf, vertically centered on its item (`getBoundingClientRect()` in `render.ts`), clamped into the board.
- z-order: reveal 2000 (hovered +1), above zoomed (1000) and floating tiles, browser guests included (`<webview>` composites in the DOM).
- `#peak`: arrow from reveal toward item. Accent when pinned.

## Activity

- `noteActivity()` on pty data (terminals) or file changes (markdown): dot on shelved tiles not revealed or pinned.
- Cleared by hover, pin, re-shelve.
