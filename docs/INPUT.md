# Input

## Mouse map

- Tile pointerdown: activate (not unpinned shelved tiles).
- Title bar: drag = move; click on collapsed = expand; double-click (350 ms, `main.ts`) = toggle zoom; right-click = menu.
- Title buttons: collapse / zoom / close.
- Border between slotted tiles: drag resizes neighbors.
- Float edges/corners (8 `.rz` handles): activate, raise, resize.
- Shelf: `SHELF.md`. Tabs: `TABS.md`.

## Drop targets

| Pointer over | Shift | Result | Preview |
|---|---|---|---|
| Shelf | any | Shelf at insert line | accent line |
| Board | yes | Float, grabbed at pointer | float rect |
| Board, no slotted tiles (or only the dragged one) | no | Root slot | whole board |
| Slotted tile | no | Slot on nearest edge (`dropSide`) | resulting rect |
| Dragged tile itself, elsewhere | - | Nothing | none |

- Floats are not targets; the slotted tile under them is.
- Shift can change mid-drag. Escape cancels. Dragged or target tile closed mid-drag: drop ignored.

## Drag mechanics (`drag.ts`)

- `startDrag()`: drag after 4 px (`THRESHOLD`), else `onClick`.
- `track()`: window capture listeners + pointer capture. Release seen even if capture lost; a move with no button held = missed release.
- During drags: `body.dragging` → tile content and reveals `pointer-events: none`.
- Border resize: from tree at drag start + pointer delta. Aborts if the tree changes or the tab switches mid-drag (never writes a stale tree).

## Keyboard (`DEFAULT_KEYMAP`, `keys.ts`)

| Chord | Action |
|---|---|
| `cmd+D` / `cmd+shift+D` | Split active tile right / down (new terminal in its shell's cwd) |
| `cmd+←/→/↑/↓` | Focus neighbor |
| `cmd+W` | Close active tile |
| `cmd+T` | New tab |
| `cmd+shift+W` | Close tab (empty only) |
| `cmd+1..8` / `cmd+9` | Tab by position / last |
| `ctrl+tab` / `ctrl+shift+tab` | Next / previous tab |
| `cmd+Q` | Quit on release (`quit.ts`) |
| `cmd+,` | Settings (app menu, main) |

- Handler on `window`, capture phase (before xterm). Skipped while editing text (`input`, `textarea`, `select`, contenteditable; not xterm's textarea) or while settings/dialog open.
- Chord format: `Cmd+Ctrl+Alt+Shift+Key`, arrows `Left/Right/Up/Down`. Not configurable yet.
- Split: empty board (no tree) → root terminal; active tile not slotted → no-op.
- Quit: own handler, works everywhere. Quits on release (held key would repeat into the app behind). Tiles open (any tab): hold 1 s first (hint, progress, "Release to quit"); a tap only shows the hint. No tiles: no hold. Window blur cancels. Menu Quit by mouse is immediate.
- Focus direction (i3-like): candidates = visible slotted + floating tiles with center beyond the active one; ranked by perpendicular overlap (yes first), gap along axis, perpendicular offset, MRU.

## Context menu (`menu.ts`) and dialog (`dialog.ts`)

- Menu targets: tile title bar, shelf item, tab. Items: `Rename…`, `Set icon…`, `Reset title & icon` (if custom).
- Rename / icon swap the menu for an input: Enter applies (empty = automatic), Escape closes.
- Menu closes on outside pointerdown, Escape, or its tile closing. Clamped into the window. `refocus()` on close if it held focus.
- `infoDialog(title, message)`: modal OK; Enter / Escape / backdrop close, then `refocus()`.

## Limitations

- No confirmation before closing a tile with a running program.
