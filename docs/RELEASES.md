# Releases

Notes per release: what changed for the user, and what still needs a manual check. Newest first. Cut with `tie-dev release --version X.Y.Z` (`PACKAGING.md`).

## 0.9.0 (2026-11-22)

- Bars resize by dragging their board-side edge (double-click: default size). Horizontal 32 to 60 px, content scales; vertical 48 px to 30% of the window. Sizes kept in `<instance>.ui.json`.
- Tabs: Close in the tab menu; middle-click closes.
- Toolbars: four bars (top, bottom, left, right); tabs, shelf and templates each in any bar, at either end, in any order. Edited in Settings → Appearance → Layout → Modify (drag components to any edge); `toolbar` is migrated.
- Title strip (traffic lights) holds no Tie UI: a top bar sits below it.
- Vertical bars: tab list with titles, shelf and templates as lists (icons only when narrow), reveals open sideways.
- Shelf overflow: fades and auto-scroll while dragging, as tabs.
- Empty board: the bars' edges drawn as a tile's border would.
- Edit layout mode: bars resize there too (Cancel / Escape restore the sizes, Done keeps them); labels always inside their component, shrunk or truncated when it is small.
- Side bars: first and last components level with the board's top and bottom edges. Shelf / tab list no longer jitter while auto-scrolling in a drag.
- Narrow side bars: icons at the default size from 48 px; an empty shelf there is one slot with a muted "+".
- Empty shelf in a top / bottom bar: the muted dashed "+" shown at rest too (accent during a drag).
- Side bars: against a top / bottom bar the end item keeps a 2 px gap to the divider (was touching it).
- Tabs in a side bar: the bar is at least 65 px wide (5 letters of a title). In the edit layout mode, dragging the tabs over a narrower side bar widens it (animated); dropped there, it keeps that width.
- UI stylesheet read as UTF-8 (was windows-1252; only comments were affected).

### Pending manual testing (toolbars)

- Verified 2026-11-22 (user): traffic lights in the title strip; side bars drag the window on empty space.
- Shelf reveal from a side bar stays open while the pointer crosses the bar.
- Edit layout mode: bars do not drag the window; preview animation and gravity flip feel right.
- Bar edges: resize cursor shows, no window drag from the edge, double-click resets; same in the edit layout mode.
- Edit layout mode: the side bar growing under the dragged tabs looks smooth in a real window (harness offscreen frames are sparse).

### Other

- Settings panel: Save disabled when nothing differs from the active settings.
- Settings panel: About page (versions, instance, settings and log paths).
- Settings panel: `~` path on the status line (full path in its tooltip).

## 0.8.1 (2026-11-19)

Supersedes 0.8.0 (same day, tagged, never installed): adds the pty fix below.

Changes since 0.7.0:

- Key bindings: configurable (Settings → Bindings; capture fields, conflicts, Alt-only chords allowed).
- Settings file: read at start only, never reloaded or written by itself. Edited on disk: banner in the panel (`Ignore` / `Reload`). Unparseable at start: dialog (`Close` / `Recreate with defaults`, with a `.bak`). Save sets the file to 0600.
- Shelf: multi-select (cmd+click), group close / unshelve / move / drag.
- Terminal: a link no longer on screen can't be hovered or opened (stale link cache); bad pty calls no longer raise an exception dialog.
- Links out: the dialog shows the site from the parsed URL and warns about a user name before the site address. Download names and page titles: bidi and control characters removed.
- CLI: `tie state` answers in dev builds only.
- Uncaught errors in the main process are logged (`[error]`, with the stack).
- Electron 44.11.5.

Pending manual testing:

- A saved Alt chord (e.g. `Alt+A`) runs in a terminal and in a markdown tile.
- Uncaught-error dialog in a visible instance (only the harness path, without dialog, was run).
- Non-US keyboard layouts (`PENDING.md` 40).

Known, not fixed:

- `ioctl EBADF` on a pty resize was seen in harness runs and is now caught, but its trigger was not reproduced.
- Guest hang (`unresponsive`) has no test (`ENGINE.md`).

