# Input

## Mouse map

- Tile pointerdown: activate; a hover-revealed shelved tile pins instead (`SHELF.md`); hidden shelved tiles take no pointer. Clicks inside content frames and browser guests never reach the shell: the window blur + `activeElement` activate (or pin) instead (`initFrames`).
- Title bar: drag = move; click on collapsed = expand; double-click (350 ms, `main.ts`) = toggle zoom; right-click = menu.
- Title buttons: pin / unpin (shelf reveals only, `SHELF.md`) / collapse / zoom / close.
- Nav bar (kinds that navigate, `TILES.md`): back / forward / reload buttons (never take focus); location field (browser: editable; Enter loads, Escape restores; refused input → dialog).
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
- During drags: `body.dragging` → tile content and reveals `pointer-events: none`. From pointerdown (`body.tracking`): content frames and browser guests too.
- Border resize: from tree at drag start + pointer delta. Aborts if the tree changes or the tab switches mid-drag (never writes a stale tree).

## Keyboard (`DEFAULT_KEYMAP` in `core/keymap.ts`; `main/keys.ts`, `renderer/keys.ts`)

| Chord | Action |
|---|---|
| `cmd+D` / `cmd+shift+D` | Split active tile right / down (new terminal in its shell's cwd) |
| `cmd+←/→/↑/↓` | Focus neighbor |
| `cmd+W` | Close active tile (busy: asks); nothing active on an empty tab: close the tab (only tab: no-op) |
| `cmd+T` | New tab |
| `cmd+shift+W` | Close tab with its tiles (busy ones: asks) |
| `cmd+1..8` / `cmd+9` | Tab by position / last |
| `cmd+[` / `cmd+]` | Back / forward in the active tile (kinds with navigation; no-op elsewhere) |
| `cmd+R` | Reload the active tile (kinds with navigation: file views re-read their file; html reloads the page, scroll kept) |
| `cmd+L` | Focus the active tile's location field (only if editable: browser; no-op otherwise) |
| `ctrl+tab` / `ctrl+shift+tab` | Next / previous tab |
| `cmd+Q` | Quit on release (`quit.ts`) |
| `cmd+,` | Settings (app menu, main) |

- Matched in main (`before-input-event` on the window's webContents, and on each browser guest's own: `watchKeys`): sees real keys before any page, content frames and guests included. Matching keydowns are blocked (no page sees them) and sent as `keys:action`; the renderer runs them (`run()`).
- Suspended while editing text (`input`, `textarea`, `select`, contenteditable; not xterm's textarea) or while settings/dialog open: the renderer reports changes (`keys:suspend`, on focus changes and body children changes). Actions arriving while a modal is open are dropped.
- Never in the keymap: Esc, editing combos (cmd+C/V/X/A/Z). Synthetic `KeyboardEvent`s trigger nothing (they never reach main).
- Blocked keydowns lose their keyup (Chromium suppresses it).
- Chord format: `Cmd+Ctrl+Alt+Shift+Key`, arrows `Left/Right/Up/Down`. Not configurable yet.
- `cmd+R` is blocked in main before menu accelerators: dev builds' View → Reload menu item still reloads the UI by mouse.
- Split: empty board (no tree) → root terminal; active tile not slotted → no-op. File tiles → terminal in the file's directory; browser → terminal in the default directory.
- Quit: main reports `quit-press` (cmd+Q keydown, not repeats), `quit-release` (Q or ⌘ keyup), `quit-cancel` (window blur); never suspended. The keydown is not blocked (a blocked keydown loses its keyup, and the release is what quits); the renderer keeps it from xterm. Quits on release (held key would repeat into the app behind). Tiles open (any tab): hold 1 s first (hint, progress, "Release to quit"); a tap only shows the hint. No tiles: no hold. Window blur cancels (UI page `blur`, and main's window `blur` for when a frame has focus). Menu Quit by mouse is immediate.
- Focus direction (i3-like): candidates = visible slotted + floating tiles with center beyond the active one; ranked by perpendicular overlap (yes first), gap along axis, perpendicular offset, MRU.

## Context menu (`menu.ts`) and dialog (`dialog.ts`)

- Menu targets: tile title bar, shelf item, tab. Items: `Rename…`, `Set icon…`, `Reset title & icon` (if custom), `Close` (tiles: `requestCloseTile`).
- Rename / icon swap the menu for an input: Enter applies (empty = automatic), Escape closes.
- Menu closes on outside pointerdown, Escape, or its tile closing. Clamped into the window. `refocus()` on close if it held focus.
- `infoDialog(title, message)`: modal OK; Enter / Escape / backdrop close, then `refocus()`.
- `confirmDialog({cls, title, body, confirm, cancel?, focus?, arm?})` → bool. Enter presses the focused button; Escape / backdrop = false. Default Cancel focused (Enter cancels: links out, downloads, pastes). `focus: 'confirm'` (close, quit, leave page): Enter confirms. `arm` ms: confirm disabled meanwhile (the dialog holds focus).

## Closing (`close.ts`)

- User closes (`requestCloseTile`: cmd+W, title-bar ×, menu Close; `requestCloseTab`: tab ×, cmd+shift+W): immediate unless something would be lost. One question at a time.
- Tile: busy terminal (`TERMINALS.md` "Busy") → `.dialog.close-busy` "Close <title>?" "<command> is running." (unknown: "A process is running."), Close / Cancel. Then a browser page's beforeunload (`BROWSER.md`).
- Tab: busy tiles (any location) → "Close tab <name>?" "Currently running:" + `title — command` list, Close tab / Cancel. Then each browser page's beforeunload. Then `closeTab` (`TABS.md`).
- Scripted (`tie close`, shell exit): `closeTile`, never asks.

## OS drops (`paste.ts` → `Surface.drop`)

- Native drag-and-drop from other apps (Finder, browsers). Tie's own drags are pointer-based (above).
- On a terminal: files → shell-quoted paths + space; else first `text/uri-list` link, else `text/plain`. Activates the tile, then the guarded paste.
- Files anywhere else on the board or shelf (incl. content tiles): opened in their kind (by extension or content, `VIEWERS.md`), placed like a template dropped there (`placementAt`); outside board and shelf: beside the active tile. Folder, missing, too large → modal with the reason (`files.ts`).
- Text anywhere else: nothing. Never navigates (`SECURITY.md`).
- While an OS drag is over the window (`body.os-drag`): content frames ignore the pointer, so drops over them land in the UI. A drag entering straight over a frame goes to the frame (viewers refuse drops).
