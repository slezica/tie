# Configurable toolbars

Status: brainstorming. Nothing implemented.

# Topic

- Today: one toolbar, top or bottom (`toolbar` setting), holding brand, tabs, shelf, templates in a fixed order.
- Goal: four bars (top, bottom, left, right). The user places Tabs, Shelf and Templates in any bar, at either end, in any order.
- Placement is edited in an "Edit layout" mode, by drag, without modifier keys.

# Settled

## Model

- S1. Four bars: `top`, `bottom`, `left`, `right`.
- S2. Three components: `tabs`, `shelf`, `templates`. Each is in exactly one bar.
- S3. Gravity has two values: `start`, `end`. Each bar has a `start` list and an `end` list (order matters).
- S4. A bar with no component is hidden.
- S5. Brand (instance name) is not a component. It always sits just before the tabs.
- S6. Templates move separately from the shelf.
- S7. The `toolbar: top | bottom` setting goes away, migrated to the new layout.

## Vertical bars

- S8. Bars switch direction with flexbox; components lay out their children along the bar.
- S9. Vertical tab list: icon plus truncated title.
- S10. Vertical shelf: a reveal opens beside its item, toward the board.

## Edit layout mode

- S11. Entered from the settings panel ("Edit layout"). The panel hides.
- S12. The board is dimmed (like dialog backdrops). Bars stay interactive.
- S13. All four bars are indicated, existing or potential.
- S14. A floating box in the center holds the buttons. It is not a dialog and does not look like one.
- S15. Components are dragged without a modifier key.
- S16. Drag to an edge with no bar: a bar preview appears there.
- S17. Gravity follows the cursor along the bar: past the midpoint toward one end, the preview moves (animated) to that end.
- S18. Components in the same bar and gravity can be reordered.
- S19. A reset to the default layout exists.
- S20. The layout is one more value in the panel's changeset (decided 2026-11-20, was P1).
  - The mode never writes the file. `Done`: back to the panel, layout in the draft, previewed live. `Cancel`: back, layout as when the mode opened.
  - The panel's Save persists it; the panel's Cancel reverts it, as for theme or font.
  - Rejected: "Edit layout" disabled while the panel has changes, with its own Save. Reason: a second write path, and no real difference from any other field.
  - Known cost: one more step for a layout-only change; `Done` may be mistaken for saved.

## Dropped ideas

- D1. Cmd+hover / Cmd+drag in normal use. Reason: Cmd is held for every shortcut, the highlight would flicker; a permanent gesture for a rare action.
- D2. Shelf multi-select moving from Cmd to Shift. No longer needed: Cmd+click stays (`2026-11-17-shelf-multi-select.md`).

# Pending

Each has my pick first. Uncertain ones are marked.

## Edit mode

- P2. Buttons in the floating box: `Cancel`, `Defaults`, `Done` (pick). `Defaults` changes the mode's draft only.
- P3. Panel row for the value: "Layout" + `Edit…` button, with a short summary ("Tabs bottom, Shelf right") (pick), or the button alone.
- P4. Preview look: abstract accent-tinted box, as tile drop previews (pick), or a ghost of the component.
- P5. Escape in the mode = Cancel (back to the panel)? (pick: yes.)

## Labels

- P6. "Tabs", "Shelf", "Templates" labels above components.
  - a. Only in edit mode; an empty shelf keeps a faint placeholder in normal use (pick).
  - b. Always visible; bars get taller.
  - c. Always on vertical bars, edit mode only on horizontal.

## Size

- P7. Bars resizable, content scales. What scales on vertical bars? (uncertain)
  - a. Horizontal: thickness scales content. Vertical: width gives room for titles, icons only below a threshold, no scaling (pick).
  - b. One separate "toolbar scale" setting; width only on vertical bars.
- P8. Resize only in edit mode (pick), or always.
- P9. Clamps: 28 to 64 px thick, 120 to 320 px wide (pick; numbers to tune).

## Geometry

- P10. Corners: top / bottom span the full width, left / right fit between them (pick).
- P11. Window with traffic lights (not borderless): a top bar shares the title strip as today; a left bar starts below it (pick).
- P12. Two growing components in one bar: tabs take the free space and scroll, shelf capped, as today (pick).

## Tile drops on bars

- P13. Over Tabs = new tab / move to tab; over Shelf = shelve; empty bar space = nothing (pick). Today: left of the bar midpoint = new tab, right = shelf.
- P14. Over Templates = nothing (pick).

## From the survey

- P17. Default tab glyph for vertical tabs (B6): a generic tab icon when none is set (pick), or title only.
- P18. Tabs in a narrow vertical bar (icons only): tabs without a custom icon all look the same. Accept, or show the first letter of the title (pick: first letter).
- P19. Shelf overflow in a vertical bar: native wheel scroll only, as today (pick), or add fades and drag auto-scroll like tabs.
- P20. Traffic lights with a resized top bar: re-centre them to the bar (pick), or leave fixed.
- P21. OS file drops on Tabs: still never (pick).

## Persistence

- P15. Settings shape (pick):
  ```json
  "bars": {
    "top":    { "size": 40,  "start": [], "end": [] },
    "bottom": { "size": 40,  "start": ["tabs"], "end": ["shelf", "templates"] },
    "left":   { "size": 200, "start": [], "end": [] },
    "right":  { "size": 200, "start": [], "end": [] }
  }
  ```
  - Invalid (component missing or twice, unknown name): whole layout falls back to the default, as `sanitize` does for other fields.
- P16. Migration: `toolbar: "top"` in an old file → default layout on the top bar. The old key is dropped at the next Save.

# Research

Code survey done 2026-11-19 (read-only). Line numbers as of commit `4db92b7`.

## Single bar / top-bottom only

- `index.html:17-25`: static `#top`, `#bottom`; one `#toolbar` with fixed order.
- `appearance.ts:105-109`: moves `#toolbar` between the two; class `toolbar-bottom`.
- `core/settings.ts:17,27,43`, `preload/index.ts:13`, `settings.ts` (`#set-toolbar` select): the `toolbar` setting. Unit test asserts `'left'` → `'bottom'`.
- `state.ts:16-17,40-41,172-177`: only `TOP` / `BOTTOM`; `boardRect` ignores left / right.
- `style.css:27-34,62-92`: `--top-h` / `--bottom-h`; `#top` has the 84 px traffic-light padding.
- `render.ts:98-131`: reveal direction from geometry (`below = sr.y < b.y`); peak has up / down shapes only (`style.css:831-840`).
- `main/index.ts:182-184`: `trafficLightPosition {x:12, y:10}`, centred for a 40 px bar. A resized top bar misaligns them (Electron can move them: `setWindowButtonPosition`).

## Horizontal only

- `tabs.ts`:
  - `dragTab` (131-172): start threshold and reorder on `clientX`.
  - `edgeScroll` (181-225): `scrollLeft` / `clientWidth`.
  - `showTab`, `syncOverflow` (289-307): `offsetLeft`, classes `more-left` / `more-right`.
  - `tabDropAt` (312-325): nearest tab by x.
  - Wheel handler (343-348): vertical delta → `scrollLeft`, with `preventDefault`.
- `drag.ts:89-104`: shelf hit area built from `#toolbar` midpoint and `#tab-add.right`; slot index from x and `scrollLeft`.
- `style.css`: `#tabs`, `#tab-list` (mask `to right`), `.tab` (`max-width`), `#tab-add`, `#shelf` (`overflow-x`), `#shelf::before` hint width, `#templates` left divider.

## Already direction-neutral

- `core/layout.ts:194-217` `inRevealZone` / `gapBetween` (tests cover only the stacked case).
- `revealSize`, float clamps, board `compute`, shelf item reconcile and ghosts, `renderTabs`, `applyDrop` / `dropGroup` / `dropOnTab`, menus (open at the pointer).

## Overflow today

- Tabs: `overflow-x: auto`, hidden scrollbar, fades, keep-current-in-view, wheel, drag auto-scroll.
- Shelf: scrolls only. No fades, no wheel mapping, no drag auto-scroll.
- Contest: tabs `flex: 1` with floor `--tabs-min` (140 px); shelf shrinks after the tabs reach it; templates never shrink.

## Tile drops today (`drag.ts` `computeTarget`)

1. Shelf: strip plus the gap right of the bar midpoint → shelve at slot.
2. Tabs: on a tab → move there; `+` or empty space after it → new tab.
3. Brand, templates: no drop.
4. OS file drops: shelf yes, tabs never.

## Window drag region

- `#top` / `#bottom` are `-webkit-app-region: drag`; components are `no-drag`.
- Over a drag region macOS owns the pointer; the page gets `pointerleave` (`shelf.ts:39-47`). The reveal keeps open through the zone check.
- For side bars: same mechanism works (`inRevealZone` handles side-by-side). Needs a manual check: the offscreen harness cannot exercise drag regions.
- For edit mode: bar indicators and previews must be `no-drag`, or they get no pointer events.

## Found by the survey: breaks silently if not handled

- B1. Reveal with a left / right shelf is treated as "bottom": lands far from the item.
- B2. Vertical tab list: every drop goes to the first tab (x distance 0 for all).
- B3. Vertical tab list: the wheel handler blocks native scrolling.
- B4. Vertical tab list: tab reorder drag never starts (x-only threshold).
- B5. Tabs and shelf in different bars: shelf hit area computed from `#tab-add` goes wrong.
- B6. Tabs have an icon only when the user set one. S9 ("icon plus title") needs a default tab glyph.

## Scenarios affected

- Rewritten: `layout-geometry` (entirely top / bottom), `tabs-overflow` (entirely horizontal), `tabs-drops` (midpoint rule).
- Adjusted (x-based points): `tabs`, `content-input`, `shelf`, `shelf-reveal`, `shelf-select*`, `cwd-templates`, `sec-drop`, `viewer-open`; helper `h.shelve`.
- Fixed "away" points such as (60, 300) would hit a left bar: take them from `list.board`.
- `boardRect` change reaches every `layout-*` scenario.

# Plan

## Phase 0: read and close questions

1. Done: code survey (Research).
2. Close Pending items with the user.
3. Update this record: Settled, final plan.

## Phase 1: model and rendering (no editor)

1. `core/`: bar layout type, default, `sanitize`, migration of `toolbar`. Unit tests.
2. DOM: four bar containers; components mounted per layout; brand with tabs.
3. Geometry: board insets on four sides.
4. Vertical variants: tab list, shelf strip + reveal side, templates, overflow.
5. Tile drops per component (P13).
6. Scenarios: layouts set through the settings file; tabs / shelf / templates in each bar.

## Phase 2: edit mode

1. Entry from the panel, dim layer, floating box, bar indicators, labels.
2. Component drag: bar previews, gravity by midpoint, reorder, animation.
3. Cancel / Defaults / Done; layout in the panel draft, Save state.
4. Scenarios: drag to each bar, gravity, reorder, cancel, reset, panel Save / Cancel.

## Phase 3: size

1. Resize handles in edit mode, clamps.
2. Scaling rule (P7).
3. Scenarios.

## After each phase

- Guides: `TABS.md`, `SHELF.md`, `LAYOUT.md`, `SETTINGS.md`, `INPUT.md`, `AGENTS.md`.
- `RELEASES.md` entry.
