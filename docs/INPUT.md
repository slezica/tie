# Input

Mouse map, keyboard shortcuts, drag mechanics, menus.

## Mouse map

| Where | Gesture | Effect |
|---|---|---|
| Tile (anywhere) | pointerdown | Activate (not for unpinned shelved tiles) |
| Title bar | drag | Move, with drop preview |
| Title bar | shift held at drop | Float at pointer |
| Title bar | click on collapsed tile | Expand |
| Title bar | double-click | Toggle zoom (board tiles) |
| Title bar | right-click | Menu: rename, set icon, reset |
| Title buttons | click | Collapse / zoom / close |
| Border between slotted tiles | drag | Resize both neighbors |
| Floating tile edges / corners | drag | Activate, raise, resize (8 handles, `.rz`) |
| Shelf template | drag | Spawn tile at drop |
| Shelf item | hover / click / drag / right-click | Reveal / pin / move / menu (`SHELF.md`) |
| Tab | click / drag / right-click | Switch / reorder / menu (`TABS.md`) |

## Drop targets

| Pointer over | Shift | Result | Preview |
|---|---|---|---|
| Shelf | any | Shelf at insert line | accent line between items |
| Board | yes | Float, grabbed at pointer | float rect |
| Board, no slotted tiles (or only the dragged one) | no | Root slot | whole board |
| Slotted tile | no | Slot on nearest edge (`dropSide`) | resulting rect |
| Dragged tile itself | no | Nothing | none |
| Elsewhere | - | Nothing | none |

- Floating tiles are not drop targets. The slotted tile under them is.
- New tile takes half the target's space.
- Shift can be pressed or released mid-drag.
- Escape cancels.
- Dragged or target tile closed mid-drag: drop ignored.
- Ghost label (icon + title) follows the pointer.

## Drag mechanics (`drag.ts`)

- `startDrag()`: pointerdown becomes a drag after 4 px (`THRESHOLD`), else a click (`onClick`).
- `track()`: pointer followed on `window` in capture phase.
  - Release seen even if pointer capture is lost.
  - A move with no button held counts as a missed release.
- Pointer capture retargets native `click` / `dblclick`. Title clicks come through `startDrag`'s `onClick`; double-click detected in `main.ts` (350 ms).
- During any drag: `body.dragging` → tile content and reveals get `pointer-events: none` (drag shield).
- Border resize: computed from the tree at drag start + pointer delta. Min 80 px.
  - Stops if the tree changes (open, close, move) or the tab switches mid-drag.

## Keyboard

Default keymap (`DEFAULT_KEYMAP`, `keys.ts`):

| Chord | Action |
|---|---|
| `cmd+D` | Split active tile right (new terminal) |
| `cmd+shift+D` | Split active tile down |
| `cmd+←/→/↑/↓` | Focus neighbor in direction |
| `cmd+W` | Close active tile |
| `cmd+T` | New tab |
| `cmd+shift+W` | Close tab (empty only) |
| `cmd+1..8` | Tab by position |
| `cmd+9` | Last tab |
| `ctrl+tab` / `ctrl+shift+tab` | Next / previous tab |
| `cmd+,` | Settings (app menu, main process) |

- Handler on `window`, capture phase: runs before xterm.
- Skipped while editing text (`input`, `textarea`, `select`, contenteditable). xterm's hidden textarea doesn't count.
- Skipped while settings panel or a dialog is open.
- Chord format: `Cmd+Ctrl+Alt+Shift+Key`, arrows as `Left/Right/Up/Down`.
- App menu includes the standard Edit menu (copy, paste).

Split:

- Empty board: opens a terminal as root.
- Active tile not slotted (floating, shelved): no-op.

Focus direction (i3-like). Candidates: visible slotted + floating tiles, center beyond the active one in that direction. Ranked by:

1. Overlap on the perpendicular axis (yes first).
2. Gap along the axis.
3. Perpendicular center offset.
4. MRU order.

## Context menu (`menu.ts`)

- HTML, not native (drivable by Playwright).
- Targets: tile title bar, shelf item, tab.
- Items: `Rename…`, `Set icon…`, `Reset title & icon` (only if custom).
- Rename / icon replace the menu with an input. Enter applies, Escape closes. Empty = automatic.
- Closes on outside pointerdown or Escape. Clamped into the window.
- Tile menu closes with its tile. Actions on a closed tile ignored.
- On close, if it held keyboard focus: `refocus()`.

## Dialog (`dialog.ts`)

- `infoDialog(title, message)`: modal, OK button. Enter / Escape / backdrop click close.
- On close: `refocus()`.
- Used for "Tab not empty".

## Limitations

- Keymap not configurable yet (`PENDING.md`).
- No dropping tiles onto tabs.
- No confirmation before closing a tile with a running program.
