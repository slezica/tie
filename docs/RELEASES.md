# Releases

Notes per release: what changed for the user, and what still needs a manual check. Newest first. Cut with `tie-dev release --version X.Y.Z` (`PACKAGING.md`).

## Unreleased

- Electron 45.4.1 (Chromium 156, Node 24.22.3). No behaviour change in Tie.
- Bar edges: no longer light up on hover in normal use (the resize cursor shows); lit while dragged. The edit layout mode keeps the hover highlight.
- Empty shelf in a top / bottom bar: one slot wide (was three).
- Edit layout mode: the other components make room for the dragged one's preview (was overlapping at a bar's far end, before the first or between two); the preview shows the drop's result.
- Bars: every bar goes down to 40 px (top / bottom were 32, sides 48). Sizes stored below 40 grow to 40.
- Side bars: shelf and template icons the same size as in a top / bottom bar of the same thickness (1x at 40 px, 1.5x from 60 px).
- Tabs in a side bar: no larger minimum (was 65 px); the bar goes down to 40 px, showing a letter or two of each title. The edit layout mode no longer widens a bar under the dragged tabs.
- Edit layout mode: the drag box shows off the bars too, following the pointer; it snaps into a bar's slot (animated) and back out. Released off the bars, it returns to the component's place (nothing changes).
- Dev builds: the quit question reads "Quit Tie (dev)?".

Manual testing:

- Verified 2026-11-24 (user): a real session on Electron 45 (terminals, browser tiles, drags, pinch / scroll feel).
- Bar edges in a visible window: no lit line on hover, lit while dragging; lit on hover in the edit layout mode.
- Edit layout mode: the others sliding aside during a drag (feel of the 140 ms shift); a reorder in a component's own list (its content and label hide).
- Edit layout mode, drag box: following the pointer over the board (no lag), snap into a bar and out (140 ms), the return animation after a release off the bars; Escape mid-drag (box gone at once).
- 40 px bars in a real window: side bar with shelf / templates (icons match a 40 px bottom bar), side bar holding the tabs (rows, brand, `+`, ellipsis; "S…" edit mode label on a one-item shelf).

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
- Verified 2026-11-24 (user): shelf reveal from a side bar stays open while the pointer crosses the bar; edit layout mode: bars do not drag the window, preview animation and gravity flip, side bar growing under the dragged tabs; bar edges: resize cursor, no window drag, double-click resets (edit layout mode too); the "Other" list below.
- Found in that pass, fixed (see Unreleased): empty shelf placeholder width; side bar minimum vs top / bottom; edit mode drop at a bar's far end (previews overlap) and no preview off the bars; bar edge lit on hover in normal mode.

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

- Verified 2026-11-24 (user): a saved Alt chord runs in a terminal and in a markdown tile; uncaught-error dialog in a visible instance.
- Non-US keyboard layouts (`PENDING.md` 40).

Known, not fixed:

- `ioctl EBADF` on a pty resize was seen in harness runs and is now caught, but its trigger was not reproduced.
- Guest hang (`unresponsive`) has no test (`ENGINE.md`).

