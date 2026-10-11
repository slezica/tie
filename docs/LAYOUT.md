# Layout

Board model: slot tree, floats, collapse, zoom, focus, geometry.

## Locations

A tile is in exactly one place in its space (`location(id)` in `state.ts`):

| Location | Stored in | Positioned by |
|---|---|---|
| `slotted` | `S.tree` | `compute()` from the slot tree |
| `floating` | `S.floats` | own px rect |
| `shelved` | `S.shelf` | reveal next to its shelf item (`SHELF.md`) |

- `place(id, placement)` (`ops.ts`) detaches from anywhere, then inserts.
- Placement: `{type:'slot', at, side}` | `{type:'float', rect?}` | `{type:'shelf', index?}`.

## Slot tree (`src/core/layout.ts`)

```ts
Leaf  { type: 'leaf', id }
Split { type: 'split', dir: 'row' | 'col', children, sizes }  // sizes: fractions, sum 1
```

- `row` = side by side. `col` = stacked.
- Normalized after every change:
  - No single-child splits.
  - Nested same-direction splits merge; sizes multiply.

| Function | Effect |
|---|---|
| `insert(root, target, side, id)` | New leaf takes half of target. Same-dir parent: becomes sibling. Else: target becomes a 2-split |
| `remove(root, id)` | Freed space goes to siblings, proportionally |
| `move(root, id, target, side)` | `remove` + `insert`. Onto itself: no-op |
| `resize(root, path, index, dpx, len, min)` | Moves one border. Only the two neighbors change. Min 80 px each |
| `dropSide(rect, x, y)` | Nearest edge = rect split by diagonals into 4 triangles |
| `compute(root, area, opts)` | Tile rects + border hit areas |

`insert` with unknown/null target uses the first leaf. Empty tree → root leaf.

## compute()

- Siblings separated by `--gap`.
- Collapsed leaf: fixed `--title-h` thickness. Others share the rest by size.
- All siblings collapsed: last one stays expanded.
- Border handles only between two non-collapsed siblings. Hidden while zoomed.
- Unit-tested in `layout.test.ts`.

## Floats

- Rect `{id, x, y, w, h}`, board-relative px.
- Order of `S.floats` = z-order, last on top. `activate()` raises.
- Min 200×120. Clamped into the board on every render (board may shrink).
- Default rect: 45% of board, centered.
- Always above slotted tiles. Not drop targets.

## Collapse

| Where | Shape | Class |
|---|---|---|
| Slotted, parent `col` | horizontal bar | `collapsed-h` |
| Slotted, parent `row` | vertical strip, rotated title | `collapsed-v` |
| Floating | title bar only | `collapsed-h` |

- Not allowed for the root slotted tile (no siblings) or shelved tiles. Button hidden then.
- Click on a collapsed title bar expands.
- Collapsed state lives in `S.collapsed`. Cleared when the tile moves (`detach`).
- Slotted tile left without siblings (after a detach): collapse cleared.
- `tie focus` expands.

## Zoom

- Slotted or floating only. Covers the whole board, dims the rest.
- Zooming clears the tile's collapse.
- Toggle: button or double-click title.
- Activating another board tile unzooms (e.g. focus keys, `tie focus`). Pinning a shelved tile doesn't.

## Focus

- `S.active`: per space. Null only when no board tile is left (a pinned shelf tile can also be active).
- `S.mru`: most recent first. Updated by `activate()`.
- After close or shelve: `focusNext()` = most recent tile still on the board.
- `activate()` calls `refocus()` only if its space is visible.
- `refocus()`: keys to the active tile; blur if none, collapsed, or not started.
  - Also called after: collapse toggle (active tile), dialog close, settings panel close, menu close (if it held focus).
- Empty board allowed: shows hint "Drag a terminal from the shelf, or press ⌘D".

## Geometry

Spacing is CSS vars in `style.css` `:root`. `readGeometry()` reads them on every render.

| Var | Default | Use |
|---|---|---|
| `--top-bar` | 36px | tab bar / window drag region |
| `--pad` | 6px | window edge padding |
| `--gap` | 6px | between tiles; board ↔ shelf |
| `--title-h` | 30px | title bar; collapsed thickness |
| `--shelf-w` | 68px | shelf column |
| `--peak` | 8px | reveal arrow |
| `--tile-pad` | `4px 0 0 6px` | tile content padding (CSS only) |

Constants in `state.ts`: `MIN = 80` (slotted min px), `REVEAL = {w: 0.3, h: 0.5}`.

```
board = { x: pad, y: top-bar, w: W - shelf-w - 2·pad - gap, h: H - top-bar - pad }
shelf = { x: W - shelf-w - pad, y: top-bar, w: shelf-w, h: H - top-bar - pad }
```

## Rendering

- All tiles live in `#tiles`, `position: absolute`, window coords. Never re-parented.
- `S.rects`: last rendered rects of the visible space (used by keys, driver, drag).
- Tiles of other spaces: `display: none`.

| Layer | z-index |
|---|---|
| Slotted | 1 |
| Borders | 5 |
| Floating | 10 + index |
| Zoomed | 1000 |
| Shelf reveal | 2000 (hovered +1, peak +2) |
| Drop preview | 5000 |
| Context menu | 6000 |

## Limitations

- Floats use px coords; not proportional to board size.
- Layout is not persisted across restarts.

## Ping

Soft attention request: `tie ping [id]`. Strong counterpart: `tie focus`.

- Marks the tile (`Tile.pinged`). No focus change, no layout change, no tab switch.
- Ignored for the tile active in the visible tab (already in front of the user).
- Shown as a yellow dot (`--yellow`, theme's ANSI yellow):
  - title bar, before the title (also on collapsed bars);
  - shelf item badge (hides the activity dot);
  - tab, when not the current tab and holding a pinged tile.
- Clears when the tile becomes active (`activate`): click, cmd+arrows, `tie focus`, pin, tab switch to it.
- `tie ping [id] --clear` clears explicitly.
