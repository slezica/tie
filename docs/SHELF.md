# Shelf

Right-hand column per space: templates on top, parked tiles below.

## Parts

```
#shelf
  #templates   tile kinds to spawn (only: terminal)
  .sep
  #items       one .item per shelved tile, in S.shelf order
```

- Templates: drag onto board → new tile there. Drag onto shelf → new shelved tile.
- Items: icon + label, activity dot, exit mark.

## Moving tiles in and out

| Action | Result |
|---|---|
| Drag tile onto shelf | Shelved at insert line (between items by vertical midpoint) |
| Drag item within shelf | Reorder |
| Drag item onto board | Unshelve, same drop rules as any tile (`INPUT.md`) |
| `tie move --shelve`, `tie open --shelved` | Appended to shelf |

- Shelving the active tile → focus goes to MRU board tile.
- Shelving clears activity.

## Reveal and pin

| State | Trigger | Tile | Interactive |
|---|---|---|---|
| Hidden | default | `visibility: hidden` | no |
| Revealed | hover item | shown next to item | no (`pointer-events: none`) |
| Pinned | click item | shown, active | yes |

- Unpin: click item again, or pointerdown anywhere outside the tile and item (menu excluded).
- `tie focus <shelved id>` pins.
- Reveal hides during drags.
- Reveal shows the close button only (no collapse/zoom).

## Reveal geometry

- Size: 30% board width × 50% board height (`revealSize()`).
  - Independent of item position, so pty size never changes on hover.
- Shelved tiles always stay laid out at reveal size, hidden.
- Vertically centered on its item, clamped into the board.
- `#peak`: `>` arrow (clip-path) from reveal edge toward the item. Accent when pinned.

## Activity and exit

- `noteActivity()` on pty data: sets dot on shelved, not-revealed, not-pinned tiles.
- Cleared by hover, pin, or re-shelve.
- Exit mark: `✓` (code 0, green) or `✗` (red) once the process exits.

## Titles and icons

- Same as tile title bar: `displayTitle()` / `displayIcon()` (`TERMINALS.md`).
- Updated on `tile-meta` DOM event.
- Right-click item → rename / set icon menu (`INPUT.md`).

## Implementation notes

- `syncShelf()`: keyed reconcile. Hovered/captured item elements survive re-renders.
- Reveal positions computed in `render.ts` from item `getBoundingClientRect()`.
