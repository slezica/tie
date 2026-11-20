# Layout

## Locations

`location(id)`: `slotted` (`S.tree`, rect from `compute()`), `floating` (`S.floats`, own rect), `shelved` (`S.shelf`, reveal rect, `SHELF.md`).

- `place(id, placement)` (`ops.ts`): `detach` from anywhere, insert, `activate` (shelf: `focusNext` if it was active).
- Placement: `{type:'slot', at, side}` | `{type:'float', rect?}` | `{type:'shelf', index?}`.
- `detach` clears the tile's collapse, zoom, pin, reveal, selection.
- `swap(a, b)` (`ops.ts`): exchange two tiles' locations, same space only (else no-op, debug log). Any pair: slot ↔ slot (leaf ids, `swapLeaves`: sizes and donors stay with the positions), slot ↔ float (the slotted tile takes the float's rect and z-order), float ↔ float, shelf ↔ anything (shelf index).
  - Each tile keeps its own collapse / zoom where the new place allows (`canCollapse`); onto the shelf: collapse, zoom, activity cleared; off the shelf: pin, reveal, selection cleared.
  - Active tile stays active; moved to the shelf: `focusNext`.
  - Keys: `cmd+shift+arrows`; mouse: a tile dropped on a slotted tile's center zone (`INPUT.md` "Drop targets"); CLI: `tie move --swap`.
- `replaceTile(old, id)` (`ops.ts`, `tie replace`, `CLI.md`): `id` takes `old`'s place (leaf via `replaceLeaf`, float rect + z-order, shelf index) and state (active, zoomed, collapsed, pinned, revealed), then `old` closes (`closeTile`). Same space only (else no-op, debug log).
- `displaceTile(old, kind, opts)` (`ops.ts`): a new tile takes slotted `old`'s exact leaf, `old` moves to the end of the shelf (just shelved: not revealed, not pinned); the new tile is active. Built as open-shelved + `swap` + `activate`. Mouse: a template or OS file dropped on a tile's center zone.
- `moveToSpace(id, spaceId)` (`ops.ts`): into another space (drop onto its tab, `TABS.md`): `detach`, then `place(besidePlacement(null))` there (active in that space); the source space `focusNext`s if it was active there, and closes if emptied. Same space: shelved → unshelved beside; else no-op. `{activate: false}` (CLI `--tab` into the visible tab): as `place`.

## Slot tree (`src/core/layout.ts`)

- `row` = side by side, `col` = stacked. Sizes are fractions, sum 1.
- Normalized after every change: no single-child splits; nested same-dir splits merge (sizes multiply).

| Function | Effect |
|---|---|
| `insert(root, target, side, id)` | New leaf takes half of target. Same-dir parent: sibling; else target becomes a 2-split. Unknown/null target: first leaf |
| `remove(root, id)` | Freed space back to its donor (the sibling subtree holding it: split then close restores sizes), else to siblings proportionally. Unchanged tree keeps identity |
| `move(root, id, target, side)` | `remove` + `insert`; onto itself: no-op |
| `swapLeaves(root, a, b)` | Exchange two leaf ids (donor links relabeled: they follow the positions). Only one present: it takes the other id. Neither / same: unchanged |
| `replaceLeaf(root, a, b)` | `b` takes `a`'s leaf (size, place, donor; leaves with donor `a` now point at `b`). `b` already in the tree: removed first. `a` absent / same: unchanged |
| `resize(root, path, index, dpx, len, min)` | One border; only the two neighbors change. Min `MIN` = 80 px (at most half the pair) |
| `equalize(root, path)` | Every child of the split at `path` gets `1/n` (border double-click) |
| `insertGroup(root, at, side, ids, board, opts)` | Leaves `ids` as a group: "Group insertion" below |
| `dropZone(rect, x, y)` | `'center'` inside the centered `CENTER_ZONE` (25%) rectangle, else the nearest edge (rect split by diagonals) |
| `nearestEdge(rect, x, y)` | The nearest edge, no center (group drops) |
| `compute(root, area, opts)` | Tile rects + border hit areas |

### Group insertion

`insertGroup(root, at, side, ids, board, opts)`: how several tiles land on the board together (shelf group: `cmd+S`, "Move N to tab", drag; `ops.ts` `placeGroup`).

- Area: what `insert(root, at, side, ids[0])` gives that tile, measured with `compute` in `board` with `opts` (the board's `layoutOpts()`, zoom ignored). Empty tree: the whole board.
- Split evenly along the area's longer side (`w >= h`: `row`, side by side; else `col`, stacked), in order.
- Normalized: a group in the parent's direction merges into it (shares multiply); the other children's shares are those of a single insert.
- Donors: every group leaf has the target (`at`) as donor: closing all, in any order, gives the target its space back.
- N = 1: exactly `insert`. `ids` already in the tree: moved.

`compute()`:

- Collapsed leaf: `--title-h` thick; others share the rest by size. All collapsed: last stays expanded.
- Borders only between two non-collapsed siblings; none while zoomed.
- `zoomed` (a leaf of the tree): at each split down to it, every other child shrinks to one bar; a squashed subtree shows its leaves as collapsed bars sharing that bar equally (document order). `collapsed` ignored.

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

- Slotted or floating only. Clears the tile's collapse. Toggle: button, title double-click.
- Slotted: the tile takes the board; the other slotted tiles are squashed to bars (`compute` `zoomed`; `squashed(id)`, `state.ts`), a map of the tab. Derived at layout time: `S.collapsed` untouched, unzoom gives every tile its size and collapse back. Floats stay, above.
- Squashed bar: no collapse button; zoom button moves the zoom there; close closes it (zoom kept); buttons don't activate on pointerdown (`main.ts`). A click elsewhere on it activates it: unzoom. Drop target as a collapsed tile (swap).
- Floating: covers the board (z 1000, the rest dimmed), nothing squashed.
- Unzoom on activation: a squashed tile (click, focus keys, `tie focus`, new tile); under a floating zoom, any board tile. A float over a slotted zoom: zoom kept. Pinning a shelved tile: kept.

## Focus

- `S.active`: per space. Null when no board tile is left, or with a shelf selection (`SHELF.md` "Selection"). A pinned shelved tile can be active.
- `S.mru`: most recent first, updated by `activate()`.
- After close or shelve: `focusNext()` = MRU tile still on the board.
- `activate()` calls `refocus()` only if its space is visible.
- `refocus()`: keys to the active tile; blur if none, collapsed, or it can't take them (`Surface.focus()` false: not started).
- Empty board: hint "Drag a terminal from the templates, or press ⌘D".

## Ping

`tie ping [--tile id] [--clear]`: soft attention mark (`Tile.pinged`). Strong counterpart: `tie focus`.

- No focus, layout or tab change. Ignored for the active tile of the visible tab.
- Yellow (`--yellow`): title-bar icon glow (the active tile's icon glows accent; no extra element, title text never moves), shelf item dot (hides activity dot), tab dot (non-current tabs only).
- Cleared by `activate()` (click, focus keys, `tie focus`, pin, switching to its tab) or `--clear`.

## Bars

Window chrome around the board (`renderer/bars.ts`, rules `core/bars.ts`; design: `2026-11-19-configurable-toolbars.md`).

- Title strip `#titlebar`: the system traffic lights only, never Tie UI. `--strip-h` 28 px; 0 with `borderless`. Drags the window.
- Four bars `#bar-top`, `#bar-bottom`, `#bar-left`, `#bar-right` (`.bar.h` / `.bar.v`).
  - Top / bottom: full width; top sits below the strip. Left / right: between them (S9).
  - Each: `.group.start`, `.bar-space`, `.group.end`. Groups are `display: contents`: components are the bar's flex items.
  - Sizes fixed for now: `--hbar` 40 px (top / bottom), `--vbar` 160 px (left / right). Resize: phase 3.
- Components: `tabs` (`#tabs`, with `#brand` always just before it), `shelf` (`#shelf`), `templates` (`#templates`).
- Layout: setting `bars` (`SETTINGS.md`): per bar, `start` and `end` lists of components, in order. Each component in exactly one bar. Default: bottom, `start: [tabs]`, `end: [shelf, templates]`.
- `applyBars(bars)` (from `applyAppearance`): moves components into their groups (only what changed: a move resets scroll); hides an empty bar (`hidden`, no space); root class `has-<bar>` sets its inset var.
- Templates divider: only when beside the shelf in the same group, on the side facing it (`.after-shelf` / `.before-shelf`).
- Contest along a bar (S12): `#tabs` content-sized, shrinks first (`flex-shrink` 1e6) down to `min(content, --tabs-min)` (`calc-size`; width, or height in a vertical bar), then the shelf; templates never. Free space: `.bar-space`, between the groups.
- Window drag: bars are `-webkit-app-region: drag`; tabs, `+`, `#shelf`, `#templates` are `no-drag`.
- Vertical bars (`.bar.v`): a column; components stretch to the bar's width less `--pad` each side. Everything along y: tab rows (`TABS.md` "In a vertical bar"), shelf / template rows and their forms by width (`SHELF.md` "Forms"; the bar is a size container `bar`), drop slots, overflow, auto-scroll; reveal beside the item (`SHELF.md`). Dividers: templates on the side facing the shelf (top / bottom border); tabs overflow divider below the tabs.
- Scrolling lists (tab list, shelf strip): `overflow.ts`, axis per the component's bar (`TABS.md` "Overflow").
- Lookups: `bars()` (layout applied), `barOfComponent(c)`, `verticalComponent(c)`.

### Drops on bars (`barDropAt`, used by `drag.ts` `computeTarget`)

- Point in a shown bar → the component whose span (along the bar's axis: x, or y in a left / right bar) holds it.
- Else (bar space, brand, gaps) → the nearest drop-taking component in that bar, along its axis (`dropComponent`, `core/bars.ts`; ties: the first).
- Tabs: on the tab list → that tab (`tabDropAt`, along the axis); `+`, rest of `#tabs`, bar space → a new tab (`TABS.md` "Drops onto tabs").
- Shelf: on the strip → the slot under the pointer (along the axis); bar space before it → slot 0, after it → the end (`SHELF.md`).
- Templates, a bar holding only templates: no drop.
- Tabs and shelf in different bars: each bar only sees its own components.

## Geometry

CSS vars in `style.css` `:root`, read by `readGeometry()` each render:

- Insets: `TOP` = `--strip-h` + `--bar-top`; `BOTTOM` = `--bar-bottom`; `LEFT` = `--bar-left`; `RIGHT` = `--bar-right`. A bar var is 0 when the bar is empty, else `--hbar` / `--vbar` (`:root.has-<bar>`).
- `--top-h`, `--bottom-h`, `--left-w`, `--right-w`: the same insets for CSS (`calc`, so layout code adds the parts itself).
- `--pad` (window edge, 6), `--gap` (between tiles, 6), `--title-h` (title bar, collapsed thickness, 30), `--peak` (reveal arrow, 8), `--slot-gap` (between shelf slots, 2).
- CSS only: `--hbar`, `--vbar`, `--tabs-min` (tab list floor, 140), `--slot` (shelf item / template square, 28; drop slot pitch is measured from an item), `--item` (an item's size along the strip: `--slot`, scaled in a narrow vertical bar), `--nav-h`, `--tile-pad`. Constants in `state.ts`: `MIN` (80), `REVEAL` (0.3 × 0.5).

```
top  = max(TOP, pad);   bottom = max(BOTTOM, pad)
left = max(LEFT, pad);  right  = max(RIGHT, pad)
board = { x: left, y: top, w: W - left - right, h: H - top - bottom }
```

- `shelfRect()`: the shelf strip's DOM box in its bar (slot math; `SHELF.md`).
- Traffic lights: `trafficLightPosition {x: 12, y: 7}` (`main/index.ts`): centred in the 28 px strip.

## Rendering

- `S.rects`: last rendered rects of the visible space (used by keys, driver, drag). Other spaces' tiles: `display: none`.
- z-index: slotted 1, borders 5, floating 10+i, zoomed 1000, reveal 2000 (hovered +1, peak +2), preview 5000, ghost 5001, menu 6000, settings 7000, dialog 7500.
- Layout is not persisted across restarts.

## Scenarios

`layout-borders`, `layout-collapse-zoom`, `layout-displace`, `layout-drop`, `layout-float`, `layout-geometry`, `keys-swap`, `ping`.
