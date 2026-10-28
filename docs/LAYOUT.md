# Layout

## Locations

`location(id)`: `slotted` (`S.tree`, rect from `compute()`), `floating` (`S.floats`, own rect), `shelved` (`S.shelf`, reveal rect, `SHELF.md`).

- `place(id, placement)` (`ops.ts`): `detach` from anywhere, insert, `activate` (shelf: `focusNext` if it was active).
- Placement: `{type:'slot', at, side}` | `{type:'float', rect?}` | `{type:'shelf', index?}`.
- `detach` clears the tile's collapse, zoom, pin, reveal.
- `swap(a, b)` (`ops.ts`): exchange two tiles' locations, same space only (else no-op, debug log). Any pair: slot ↔ slot (leaf ids, `swapLeaves`: sizes and donors stay with the positions), slot ↔ float (the slotted tile takes the float's rect and z-order), float ↔ float, shelf ↔ anything (shelf index).
  - Each tile keeps its own collapse / zoom where the new place allows (`canCollapse`); onto the shelf: collapse, zoom, activity cleared; off the shelf: pin, reveal cleared.
  - Active tile stays active; moved to the shelf: `focusNext`.
  - Keys: `cmd+shift+arrows`; mouse: a tile dropped on a slotted tile's title bar (`INPUT.md` "Drop targets").
- `moveToSpace(id, spaceId)` (`ops.ts`): into another space (drop onto its tab, `TABS.md`): `detach`, then `place(besidePlacement(null))` there (active in that space); the source space `focusNext`s if it was active there, and closes if emptied. Same space: shelved → unshelved beside; else no-op.

## Slot tree (`src/core/layout.ts`)

- `row` = side by side, `col` = stacked. Sizes are fractions, sum 1.
- Normalized after every change: no single-child splits; nested same-dir splits merge (sizes multiply).

| Function | Effect |
|---|---|
| `insert(root, target, side, id)` | New leaf takes half of target. Same-dir parent: sibling; else target becomes a 2-split. Unknown/null target: first leaf |
| `remove(root, id)` | Freed space to siblings, proportionally. Unchanged tree keeps identity |
| `move(root, id, target, side)` | `remove` + `insert`; onto itself: no-op |
| `swapLeaves(root, a, b)` | Exchange two leaf ids (donor links relabeled: they follow the positions). Only one present: it takes the other id. Neither / same: unchanged |
| `resize(root, path, index, dpx, len, min)` | One border; only the two neighbors change. Min `MIN` = 80 px |
| `dropSide(rect, x, y)` | Nearest edge (rect split by diagonals) |
| `compute(root, area, opts)` | Tile rects + border hit areas |

`compute()`:

- Collapsed leaf: `--title-h` thick; others share the rest by size. All collapsed: last stays expanded.
- Borders only between two non-collapsed siblings; hidden while zoomed.

## Floats

- `S.floats` order = z-order, last on top. `activate()` raises.
- Min 200×120. Clamped into the board on every render.
- Default rect: 45% of board, centered. `--float` on an already floating tile keeps its rect.
- Always above slotted tiles. Not drop targets.
- Px coords: not proportional to board size.

## Collapse

- Shape: slotted in `col` → bar (`collapsed-h`); in `row` → vertical strip, rotated title (`collapsed-v`); floating → title bar (`collapsed-h`).
- Button arrows follow the shrinking axis: horizontal in `row`, vertical in `col` / floating (`render.ts` `setButtons`). Kind icon stays upright on the strip.
- Not for a root slotted tile or shelved tiles (button hidden). Slotted tile left without siblings: collapse cleared.
- Expand: title click, button, `tie focus`.

## Zoom

- Slotted or floating only. Covers the board. Clears collapse. Toggle: button, title double-click.
- Activating another board tile unzooms (focus keys, `tie focus`). Pinning a shelved tile doesn't.

## Focus

- `S.active`: per space. Null only when no board tile is left (a pinned shelved tile can be active).
- `S.mru`: most recent first, updated by `activate()`.
- After close or shelve: `focusNext()` = MRU tile still on the board.
- `activate()` calls `refocus()` only if its space is visible.
- `refocus()`: keys to the active tile; blur if none, collapsed, or xterm not opened.
- Empty board: hint "Drag a terminal from the toolbar, or press ⌘D".

## Ping

`tie ping [id] [--clear]`: soft attention mark (`Tile.pinged`). Strong counterpart: `tie focus`.

- No focus, layout or tab change. Ignored for the active tile of the visible tab.
- Yellow (`--yellow`): title-bar icon glow (the active tile's icon glows accent; no extra element, title text never moves), shelf item dot (hides activity dot), tab dot (non-current tabs only).
- Cleared by `activate()` (click, focus keys, `tie focus`, pin, switching to its tab) or `--clear`.

## Geometry

CSS vars in `style.css` `:root`, read by `readGeometry()` each render:

- `--top-h`: top strip: the toolbar (`--toolbar-h`, 40px) when it is on top; else the system title bar (`--titlebar-h`, 28px, traffic lights), 0 with `borderless`. `--bottom-h`: the toolbar at the bottom (default), else 0.
- `--pad` (window edge), `--gap` (between tiles), `--title-h` (title bar, collapsed thickness), `--peak` (reveal arrow), `--slot` (shelf item / template square), `--tabs-min` (tab list floor; CSS only).
- `--tile-pad`: CSS only. `MIN` (80) and `REVEAL` (0.3 × 0.5) are constants in `state.ts`.

```
top   = max(top-h, pad);  bottom = max(bottom-h, pad)
board = { x: pad, y: top, w: W - 2·pad, h: H - top - bottom }
```

- `shelfRect()`: the shelf strip's DOM box inside the toolbar (drop target, reveal anchor; `SHELF.md`).

## Rendering

- `S.rects`: last rendered rects of the visible space (used by keys, driver, drag). Other spaces' tiles: `display: none`.
- z-index: slotted 1, borders 5, floating 10+i, zoomed 1000, reveal 2000 (hovered +1, peak +2), preview 5000, ghost 5001, menu 6000, settings 7000, dialog 7500, quit hint 9000.
- Layout is not persisted across restarts.
