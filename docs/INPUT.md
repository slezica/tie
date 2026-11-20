# Input

## Mouse map

- Tile pointerdown: activate; a hover-revealed shelved tile pins instead (`SHELF.md`); hidden shelved tiles take no pointer. Clicks inside content frames and browser guests never reach the shell: the window blur + `activeElement` activate (or pin) instead (`initFrames`).
- Title bar: drag = move; click on collapsed = expand; double-click (350 ms, `main.ts`) = toggle zoom; right-click = menu.
- Title buttons: pin / unpin (shelf reveals only, `SHELF.md`) / collapse / zoom / close.
- Nav bar (kinds that navigate, `TILES.md`): back / forward / reload buttons (never take focus); location field (browser: editable; click into it selects all, type to replace, cmd+C copies, drag selects a range; Enter loads, Escape restores; refused input → dialog). A click there activates the tile without handing the keys to its content.
- Border between slotted tiles: drag resizes neighbors; double-click equalizes all siblings at that split.
- Float edges/corners (8 `.rz` handles): activate, raise, resize.
- Bar edge (`.bar-edge`, a shown bar's board-side edge): drag resizes the bar; double-click: its default size (`LAYOUT.md` "Bar sizes"). Not in the edit layout mode.
- Shelf: `SHELF.md` (`cmd+click` on an item: selection; a pointerdown elsewhere de-selects, then acts as usual: "Selection"). Tabs: `TABS.md`.
- Wheel over the tab list or the shelf strip (S18): in a top / bottom bar a vertical wheel scrolls it sideways; in a left / right bar it scrolls natively (`overflow.ts` `sideWheel`).
- Bars: every rule runs along the bar's axis (x in top / bottom bars, y in left / right ones): tab reorder, drop targets, shelf slots, auto-scroll.

## Drop targets

| Pointer over | Shift | Result | Preview |
|---|---|---|---|
| Shelf strip (in its bar) | any | Shelved at the ghost slot | ghost slot in the strip (`SHELF.md`) |
| Bar space nearest the shelf (same bar) | any | Shelved at the near end: slot 0 before the strip, the end after it | ghost there (`LAYOUT.md` "Drops on bars") |
| Tab | any | Joins that tab, shown, active (`TABS.md` "Drops onto tabs") | tab highlighted (`.tab.drop`) |
| Rest of the tabs: `+`, space after it; bar space nearest the tabs (brand included) | any | New tab holding it | `+` highlighted (`#tab-add.drop`) |
| Templates; a bar holding only templates | any | Nothing | none |
| Own tab (board tile) | any | Nothing | none |
| Board | yes | Float, grabbed at pointer | float rect |
| Board, no slotted tiles (or only the dragged one) | no | Root slot | whole board |
| Slotted tile's center zone (collapsed tile: all of it), tile dragged | no | Swap with it (`swap`, `LAYOUT.md`); dragged tile active | target rect + the dragged tile's own (`#preview2`, board sources only) |
| Slotted tile's center zone, template or OS file | no | New tile takes its exact leaf; it goes to the end of the shelf, just shelved (`displaceTile`, `ops.ts`); new tile active | target rect |
| Slotted tile, edge band | no | Slot on that edge | resulting rect |
| Dragged tile itself, elsewhere | - | Nothing | none |

- Zones of a slotted tile (`dropZone`, `core/layout.ts`): center rectangle = `CENTER_ZONE` (25%) of the tile's width and of its height, centered; around it four edge bands (trapezoids), nearest edge wins (normalized coords: the bands meet on the diagonals). The title bar has no role of its own: it is part of the top band (or the center, by geometry). A collapsed tile (all title bar) is all center for a dragged tile; for a template or file, the zones apply.
- Floats are not targets; the slotted tile under them is.
- Templates follow the same rows: a new tile of that kind lands there (tab: `TABS.md`); cwd: the tile next to / under the drop, else the active one (`DIRECTORIES.md`). OS file drops (`files.ts`, `placementAt`) too, one tile per file, each against the board as it is then (several files on a center: the last one slotted, the others shelved). A tile with its own drop (terminal: pastes the path) keeps it.
- Tab area: the tile drag only (`startDrag`); a tab's own drag (reorder, `dragTab`) is separate. Both auto-scroll the tab list near its ends (`TABS.md` "Overflow"); a tile drag also auto-scrolls the shelf strip near its ends (`SHELF.md` "Space"). OS file drops (`placementAt`): not onto tabs (they count as outside board and shelf).
- Shift can change mid-drag. Escape cancels. Dragged or target tile closed mid-drag: drop ignored.
- A selected shelf item drags the whole selection: no center zone (nearest edge), group landings, one preview per tile (`SHELF.md` "Group drag"). Escape keeps the selection.

## Drag mechanics (`drag.ts`)

- `startDrag()`: drag after 4 px (`THRESHOLD`), else `onClick`. At drag start: a selected shelf item becomes a group source (`selection()`), anything else de-selects.
- `Target.previews`: window rects, one per landing tile (a swap: target + own rect); `showPreviews` fills the pool (`#preview`, `#preview2`, `.drop-preview`).
- `track()`: window capture listeners + pointer capture. Release seen even if capture lost; a move with no button held = missed release.
- During drags: `body.dragging` → tile content and reveals `pointer-events: none`. From pointerdown (`body.tracking`): content frames and browser guests too.
- Border resize: from tree at drag start + pointer delta. Aborts if the tree changes or the tab switches mid-drag (never writes a stale tree).
- Bar edge resize (`barsize.ts`): `track()` from the bar's shown size at pointerdown + the pointer delta across the bar (toward the board grows it); clamped to the bar's limits at each move; render at each move (board, tiles re-laid out: as a border drag; terminals refit only when their grid changes). Cursor `col-resize` (side bars) / `row-resize` (top / bottom), the edge lit while dragged. The UI state file is written once, at the release (if the size changed).

## Edit layout drag (`layoutedit.ts`)

In the edit mode only (`LAYOUT.md` "Edit mode"). No modifier key.

- Press anywhere on a component's box (`.le-comp`: items, empty area, the brand with the tabs), drag past 4 px (`track()`); else a click: nothing.
- Target bar (`barAt`, `core/bars.ts`): the zone holding the pointer (existing or potential bar); an existing one wins, then the nearest window edge. Over no zone (the board): no target, a drop changes nothing.
- Gravity (`gravityAt`, S35): the pointer's half of the bar along its axis: before the middle `start`, else `end`.
- Index (`indexAt`, S36): how many other components of that list have their midpoint before the pointer.
- Preview (S38): `.le-preview`, accent box at the landing place: after the component before it (start) or before the one after it (end), roughly the component's size there (its length in its bar; in the other orientation capped at 30% of the bar). Moves with a 140 ms transition (also across the bar's middle); the first placement jumps. The target bar: `.le-bar.target`; an absent bar shows its future rect (its own preview, S34) with the box in it.
- The dragged component dims in place (`.le-dragging`).
- Drop: `moveComponent` (`core/bars.ts`) → applied live. Same place: nothing. A bar left empty hides (still indicated, as a potential zone).
- Escape: cancels the drag (the mode stays).

## Keyboard (`ACTIONS` in `core/keymap.ts`; `main/keys.ts`, `renderer/keys.ts`)

Defaults below; setting `bindings` overrides them per action (`SETTINGS.md`).

| Chord | Action |
|---|---|
| `cmd+D` / `cmd+shift+D` | Split active tile right / down (new terminal in its cwd: a shell's, fresh) |
| `cmd+O` / `cmd+shift+O` | Open a file right / down of the active tile: the file picker ("File picker" below) from its cwd; the `file` template's drop, by key |
| `cmd+←/→/↑/↓` | Focus neighbor |
| `cmd+shift+←/→/↑/↓` | Swap the active tile with the neighbor `cmd+arrows` would focus (`swap`, `LAYOUT.md`); stays active. No neighbor: no-op |
| `cmd+S` | Shelve the active tile; a shown (pinned / revealed) shelved active tile: back on the board beside the active / recent slotted tile (`besidePlacement`). Nothing active: no-op. Shelf selection: unshelves it (`SHELF.md` "Selection") |
| `cmd+W` | Close active tile (busy: asks); its tab, if that emptied it and it isn't the only one (`TABS.md`); nothing active: no-op. Shelf selection: closes it, one question per busy tile |
| `cmd+T` | New tab |
| `cmd+shift+W` | Close tab with its tiles (busy ones: asks) |
| `cmd+1..8` / `cmd+9` | Tab by position / last |
| `cmd+[` / `cmd+]` | Back / forward in the active tile (kinds with navigation; no-op elsewhere) |
| `cmd+R` | Reload the active tile (kinds with navigation: file views re-read their file; html reloads the page, scroll kept) |
| `cmd+L` | Focus the active tile's location field (only if editable: browser; no-op otherwise) |
| `cmd+=` (`cmd+shift+=`, `cmd++`) / `cmd+-` / `cmd+0` | Page zoom of the active tile, in / out / back to 100% (html, markdown, text: CSS zoom on the page root via the bootstrap / viewer runtime; browser: `setZoomFactor`); Chrome's presets (`@core/zoom`); kept across pages and reloads of the tile; a `125%` pill (click: reset). Other kinds: no-op |
| `ctrl+tab` / `ctrl+shift+tab` | Next / previous tab |
| `cmd+Q` | Quit (asks first: `quit.ts`) |
| `cmd+,` | Settings (app menu, main) |

- Matched in main (`before-input-event` on the window's webContents, and on each browser guest's own: `watchKeys`): sees real keys before any page, content frames and guests included (synthetic `KeyboardEvent`s never reach main: they trigger nothing). Matching keydowns are blocked (no page sees them) and sent as `keys:action`; the renderer runs them (`run()`).
- Decision rules: `decideKey(key, mode, fromUi, keymap)` (`@core/keymap`, unit-tested): pass, block, run an action, or capture. `main/keys.ts` `onInput` only applies it. Modes (`KeyMode`): `off` (every bound chord), `fields` (only `quit`), `capture` ("Capture fields").
- Suspended while editing text (`input`, `textarea`, `select`, contenteditable; not xterm's textarea) or while settings/dialog open: the renderer reports changes (`keys:suspend`, on focus changes and body children changes). Actions arriving while a modal is open are dropped (except `quit`: `quit.ts` ignores it while a dialog is open).
- Blocked keydowns lose their keyup (Chromium suppresses it; main's `before-input-event` doesn't see it either; `ENGINE.md`).
- Chord format: `Cmd+Ctrl+Alt+Shift+Key` (modifiers in that order), key from Electron `input.key`: single characters upper-cased (`+` as `Cmd++`), arrows `Left/Right/Up/Down`, space `Space`, named keys (`Home`, `PageUp`, `Delete`, `F1`..`F24`, ...).
- Configurable (setting `bindings`, sparse overrides): keymap = `resolveKeymap(bindings)`, rebuilt in main at startup and on each save (live). One chord per action; `zoom-in`'s aliases are default-only. `cmd+,` (Settings) is a fixed menu accelerator; the Quit menu label follows the `quit` binding (none when unbound; a malformed override: the default, as the keymap: `chordsOf` and `resolveKeymap` share the rule). Validation: `SETTINGS.md`.
- Alt chords: with Alt held the key is named from its physical position (`input.code`: `KeyD` → `D`, US names), since macOS composes (`Alt+D` → `∂`). Raw input is logged (`TIE_DEBUG=keys`) in capture mode only.
- Bindable (`validBinding`): a chord with Cmd, Ctrl or Alt, or a function key (Shift alone, bare keys: would eat typing); Escape / Enter / Backspace, editing combos and cmd+, reserved (full rule: `SETTINGS.md` "File"). A bound `Alt+<letter>` takes the key: the composed character (`å`) no longer reaches the page; same for `Ctrl+C` in terminals (the user's choice).
- `cmd+R` is blocked in main before menu accelerators: dev builds' View → Reload menu item still reloads the UI by mouse.
- Split: empty board (no tree) → root terminal (the active tile's cwd, if any, else `S.cwd`); active tile not slotted → no-op. Other kinds (file, html, browser) → a terminal in the tile's cwd (`DIRECTORIES.md`).
- Open a file (`cmd+O` / `cmd+shift+O`, `file-right` / `file-down`): like split with the `file` template (`templateOpts`, `SHELF.md`). Empty board → root tile (picker from the active tile's cwd, if any, else `S.cwd`); active tile not slotted → no-op. Picker starts in the active tile's cwd, every kind (as split); cancel → nothing; not openable → modal. The tile must still be slotted after the picker, else nothing.
- Inside the file picker: its own keys (below); shortcuts suspended (a `.dialog-backdrop` modal).
- Quit (`quit` action, cmd+Q by default; matched by action, whatever its chord): blocked in main like the rest (repeats too), but works from text fields and over modals (`fields` mode); a focused capture field takes it. The renderer asks (`quit.ts`, `ARCHITECTURE.md` "Quit"); while any dialog is open: nothing.
- Focus direction (i3-like, shared by focus and swap): `renderer/keys.ts` `neighbor()` collects candidates (visible slotted + floating tiles); ranking in `@core/focus` `neighbor` (unit-tested): center more than 1 px beyond the active one's; perpendicular overlap (yes first), gap along axis (overlapping: 0), perpendicular offset (rounded), MRU.
- Shelf selection (`SHELF.md` "Selection"): `close-tile` and `toggle-shelf` act on it (`keys.ts` `run`); any other action clears it first (keys back to the most recent board tile), then runs. Escape clears it (window keydown, capture) unless a menu, modal, drag or text field takes it. Without a selection, Escape is untouched.

### Capture fields (`renderer/capture.ts`)

- `captureField(input, {change, accept, cancel})` (settings: key search, binding edit): an input (class `capture-field`, read-only) that takes key presses as a chord name.
- Focused: the renderer reports `keys:suspend 'capture'`; main then sends every key of the UI as `keys:capture {chord, complete}` (`captured()`, `@core/keymap`) and blocks it (page, shortcuts, menu accelerators, quit). A guest's keys are never forwarded. `SECURITY.md`.
- Held modifiers alone: incomplete (`Cmd+Shift+`, shown live, following presses and releases; all released: the value again). Bare modifier keys also pass to the page (blocked, their key-ups would never reach main). A modifier's own key decides its flag (held on its key-down, released on its key-up), whatever the event's flags say.
- Own keys pass (`capturePasses`: without Cmd / Ctrl / Alt): Escape cancels (value as at focus), Backspace empties, Enter accepts; blur accepts. Tab is captured like any key.

## File picker (`renderer/picker.ts`)

`pickPath(startDir)`: the `file` template's dialog (drops, tabs, shelf, cmd+O; `templateOpts`). Record: `2026-10-30-file-picker.md`.

- One line: the full path. Initial: start dir, `~`-abbreviated, trailing `/`, caret at the end. Prefix = up to the last `/` (`~` / `~/` → home: the only token; lexically normalized; no `/` → under `/`); query = the rest (`@core/picker` `parseLine`).
- Prefix dir changed → new walk (`doc:walk`, new `gen`, previous stopped); same dir → re-rank the held list. Rows: top 8 (`rank` / `merge`), relative to the prefix, dirs with `/`, matched chars `<mark>`, parent part dimmed. Top row selected.
- Status: `n files` (`…` while walking), `partial` (cap), `waiting for permission: <dirs>`, walk errors, Enter failures.
- Shown at the first chunk or 30 ms (opacity: the input has focus and takes keys from the start).

| Key | Action |
|---|---|
| typing, Backspace | edit the line; crossing a `/` re-roots the walk (Backspace past `src/` → the parent) |
| `↑` / `↓` | move the selection |
| `Enter` | the typed path names a file (selection not moved by arrows) → it (dot files, ignored, not walked yet); else selected file → its absolute path (prefix dir + row; no realpath); selected dir → line = prefix + dir (re-roots); no rows, no file → status error |
| `Tab` | descend into the selected row's dir (a file: its parent) |
| `Esc`, backdrop click | cancel (null) |
| `…` button | native dialog (`doc:pick`) from the prefix dir; its answer is the pick (cancel → null) |
| row click | as Enter on that row |

- Close: walk stopped, `refocus()`. Cmd+Q while open: nothing (as for any dialog).

## Context menu (`menu.ts`) and dialog (`dialog.ts`)

- Menu targets: tile title bar, shelf item, tab; a selected shelf item: group menu (`Unshelve N tiles`, `Move N to tab ▸`, `Close N tiles`; `showListMenu`: an entry with `sub` swaps the menu for its entries, here the other tabs as `N · title` + `New tab`). Items: `Rename…`, `Set icon…`, `Reset title & icon` (if custom), `Close` (tiles: `requestCloseTile`).
- Rename / icon swap the menu for an input: Enter applies (empty = automatic), Escape closes.
- Menu closes on outside pointerdown, Escape, or its tile closing. Clamped into the window. `refocus()` on close if it held focus.
- `infoDialog(title, message)`: modal OK; Enter / Escape / backdrop close, then `refocus()`.
- `confirmDialog({cls, title, body, confirm, cancel?, focus?, arm?})` → bool. Enter presses the focused button; Escape / backdrop = false. Default Cancel focused (Enter cancels: links out, downloads, pastes). `focus: 'confirm'` (close, quit, leave page): Enter confirms. `arm` ms: confirm disabled meanwhile (the dialog holds focus).
- `choiceDialog({cls, title, body, choices})` → the chosen value. First choice focused (the safe one); Escape / backdrop = first.

## Closing (`close.ts`)

- User closes (`requestCloseTile`: cmd+W, title-bar ×, menu Close; `requestCloseTab`: tab ×, cmd+shift+W): immediate unless something would be lost. One question at a time.
- Tile: busy terminal (`TERMINALS.md` "Busy") → `.dialog.close-busy` "Close <title>?" "<command> is running." (unknown: "A process is running."), Close / Cancel. Then a browser page's beforeunload (`BROWSER.md`).
- Tab: busy tiles (any location) → "Close tab <name>?" "Currently running:" + `title — command` list, Close tab / Cancel. Then each browser page's beforeunload. Then `closeTab` (`TABS.md`).
- Shift+click on a × (title bar, tab; `force`): no questions, neither busy nor beforeunload. Mouse only (not the keys, not menu Close).
- Scripted (`tie close`, shell exit): `closeTile`, never asks.

## OS drops (`paste.ts` → `Surface.drop`)

- Native drag-and-drop from other apps (Finder, browsers). Tie's own drags are pointer-based (above).
- On a terminal: files → shell-quoted paths + space; else first `text/uri-list` link, else `text/plain`. Activates the tile, then the guarded paste.
- Files anywhere else on the board or shelf (incl. content tiles): opened in their kind (by extension or content, `VIEWERS.md`), placed like a template dropped there (`placementAt`); outside board and shelf: beside the active tile. Folder, missing, too large → modal with the reason (`files.ts`).
- Text anywhere else: nothing. Never navigates (`SECURITY.md`).
- While an OS drag is over the window (`body.os-drag`): content frames ignore the pointer, so drops over them land in the UI. A drag entering straight over a frame goes to the frame (viewers refuse drops).

## Scenarios

`layout-drop`, `layout-bars-size`, `templates`, `keys`, `keys-swap`, `keys-bindings`, `sec-keys`, `sec-keys-capture`, `settings-bindings`, `settings-layout`, `settings-layout-drag`, `picker`, `picker-partial`, `menu`, `close-busy`, `quit`, `sec-drop`.
