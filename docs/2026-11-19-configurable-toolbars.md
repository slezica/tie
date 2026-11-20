# Configurable toolbars

Status: design settled 2026-11-20. Phase 1 in progress.

# Topic

- Before: one toolbar, top or bottom (`toolbar` setting), holding brand, tabs, shelf, templates in a fixed order.
- Goal: four bars (top, bottom, left, right). The user places Tabs, Shelf and Templates in any bar, at either end, in any order.
- Placement is edited in an "Edit layout" mode, by drag, without modifier keys. Bar sizes are changed in normal use, by dragging the bar's edge.

# Settled

"(user)": decided by the user. "(agent)": decided by the agent under "full autonomy for the rest"; open to revision.

## Model

- S1. Four bars: `top`, `bottom`, `left`, `right`. (user)
- S2. Three components: `tabs`, `shelf`, `templates`. Each is in exactly one bar. (user)
- S3. Gravity has two values: `start`, `end`. Each bar has a `start` list and an `end` list; order matters. (user)
- S4. A bar with no component is hidden (takes no space). (user)
- S5. Brand (instance name) is not a component. It always sits just before the tabs: left of them in a horizontal bar, above them in a vertical one. (user)
- S6. Templates move separately from the shelf. (user)
- S7. The `toolbar: top | bottom` setting is removed, migrated to the layout. (user)

## Geometry

- S8. Bars switch direction with flexbox; components lay out their children along the bar. (user)
- S9. Corners: top / bottom bars span the full width; left / right fit between them. (user)
- S10. The system title strip (traffic lights) holds no Tie UI, ever. Tie's bars are inside the window, below it. Borderless window: no strip. (user, 2026-11-20: "tired of making exceptions")
  - Consequence: a top bar no longer shares the strip; windows with traffic lights and a top bar get 28 px taller chrome than before.
  - The 84 px traffic-light padding and `trafficLightPosition` tuning for the toolbar go away.
- S11. Bars remain window drag regions on their empty space, components `no-drag`, as today. (agent: least change; a borderless window needs something to drag.)
- S12. Two growing components in one bar: tabs take the free space and scroll; shelf shrinks after the tabs reach their floor; templates never shrink. As today, along the bar's axis. (user)

## Vertical bars

- S13. Tabs: title only, truncated with an ellipsis. No icon unless the user set one (as today). (user; icon set → `PENDING.md`)
- S14. Shelf, by bar width: (user)
  - Narrow: icons, one per row, scaled up with the width, up to 1.5x the default size.
  - Wider than 1.5x needs: icons back to the default size, each with the tile title beside it (a list).
  - Never a grid: items do not stack sideways.
- S15. Templates: one per row; same scaling rule as shelf icons, titles (labels) in the wide form. (agent)
- S16. A reveal opens beside its item, toward the board; peak points sideways. (user)
- S17. Shelf overflow, both directions: as tabs. Scroll, fades at the cut ends, auto-scroll while dragging. (user)
- S18. Wheel: horizontal lists map vertical wheel delta to sideways scroll (as tabs today, now shelf too); vertical lists scroll natively. (agent)

## Horizontal bars, resized

- S19. Thicker bar: content (tabs text, icons) scales with the thickness, up to 1.5x, where the bar's size limit is (S21). (agent)

## Bar sizes

- S20. Resized in normal use by dragging the bar's board-side edge, as tile borders. Not in edit mode. (user)
- S21. Limits: vertical bars up to 30% of the window width; horizontal bars up to 1.5x the default thickness (60 px), the point where scaling stops. (user, 2026-11-20; was 20% of the window height, which left empty space)
- S22. Minimums: vertical 48 px (one icon slot plus padding; about 3 letters and an ellipsis of a tab title); horizontal 32 px. Defaults: horizontal 40 px (today's), vertical 160 px. (agent; numbers to tune)
- S23. Double-click on the edge: back to the default size. (agent)
- S24. Sizes are UI state, not settings: stored in `<stateDir>/<instance>.ui.json` (0600), written when a resize ends, read at start, clamped. (agent)
  - Reason: a resize happens outside the settings panel. The settings file is written only by Save / Recreate (`SETTINGS.md` "File"), and a write there would meet the "changed on disk" logic.
  - Rejected: sizes in `bars` in the settings file, written on drag end.
  - Consequence: the panel's layout Reset does not touch sizes.

## Tile drops on bars

- S25. Over Tabs: on a tab → move there; `+` or the component's empty space → new tab. Over Shelf: shelve at the slot. Over Templates: nothing. (user: as today)
- S26. Empty bar space: goes to the nearest drop-taking component (tabs or shelf) in that bar, along the bar's axis. Tabs → new tab; shelf → shelve at the near end. A bar holding only templates: nothing. (user: "fling to drop" kept; agent: generalization of today's midpoint rule)
- S27. OS file drops: shelf yes, tabs never, as today. (user)

## Edit layout mode

- S28. Settings panel row "Layout": title, a summary line below it ("Current: Tabs bottom, Shelf bottom, Templates bottom"), buttons `Reset` and `Modify`. (user)
  - `Reset`: the draft layout becomes the default. `Modify`: enters the mode.
- S29. The layout is one more value in the panel's changeset (was P1). (user)
  - The mode never writes the file. `Done`: back to the panel, layout in the draft, previewed live. `Cancel` / Escape: back, layout as when the mode opened.
  - The panel's Save persists it; the panel's Cancel reverts it, as for theme or font.
  - Rejected: "Edit layout" disabled while the panel has changes, with its own Save. Reason: a second write path, and no real difference from any other field.
  - Known cost: one more step for a layout-only change; `Done` may be mistaken for saved.
- S30. In the mode: the panel hides; the board is dimmed (like dialog backdrops) and takes no input; bars stay interactive. (user)
- S31. All four bars are indicated, existing or potential. (user)
- S32. A floating box in the center holds `Cancel` and `Done`. It is not a dialog and does not look like one. (user)
- S33. Components are dragged without a modifier key. (user)
- S34. Drag to an edge with no bar: a bar preview appears there. (user)
- S35. Gravity follows the cursor along the bar: past the midpoint toward one end, the preview moves (animated) to that end. (user)
- S36. Components in the same bar and gravity can be reordered. (user)
- S37. Labels "Tabs", "Shelf", "Templates": only in the mode, floating outside the layout (they push nothing). (user)
- S38. Preview look: abstract accent-tinted box at the landing place, as tile drop previews; the dragged component dims in place. To iterate by feel. (agent)

## Persistence

- S39. Settings shape: (agent)
  ```json
  "bars": {
    "top":    { "start": [], "end": [] },
    "bottom": { "start": ["tabs"], "end": ["shelf", "templates"] },
    "left":   { "start": [], "end": [] },
    "right":  { "start": [], "end": [] }
  }
  ```
  - That is also the default (today's look).
  - Invalid (a component missing or twice, unknown name, wrong shape): the whole layout falls back to the default.
- S40. Migration: a file with `toolbar: "top"` and no `bars` → the default layout on the top bar. `toolbar` is ignored otherwise and dropped at the next Save. (agent)

## Dropped ideas

- D1. Cmd+hover / Cmd+drag in normal use. Reason: Cmd is held for every shortcut, the highlight would flicker; a permanent gesture for a rare action.
- D2. Shelf multi-select moving from Cmd to Shift. No longer needed: Cmd+click stays (`2026-11-17-shelf-multi-select.md`).
- D3. Resize only in edit mode (agent's pick; the user chose normal use, S20).
- D4. Default tab glyph / first letter for vertical tabs. Deferred to the icon set (`PENDING.md`).

# Pending

- None blocking. To watch while building:
  - W2. Drag regions on side bars and the reveal (`shelf.ts` pointerleave note): manual check, the offscreen harness cannot test it.
  - W3. S24 (sizes in a state file): the first persisted UI state outside settings.

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

## Phase 0: read and close questions (done)

## Phase 1: model and rendering (no editor, no resize)

- 1a. Core + horizontal:
  1. `core/`: bars type, default, `sanitize`, migration of `toolbar` (S39, S40). Unit tests.
  2. DOM: title strip (system only, S10) + four bar containers; components mounted per layout; brand with tabs.
  3. Geometry: board insets on four sides (`state.ts`), CSS vars.
  4. Tile drops per component and nearest-component rule (S25 to S27).
  5. Panel: `#set-toolbar` select removed (layout by file until phase 2).
  6. Scenarios: `layout-geometry`, `tabs-drops` rewritten; any top / bottom arrangement works.
- 1b. Vertical:
  1. Tabs: axis-generic drag, reorder, overflow, drop target, wheel (B2 to B4).
  2. Shelf + templates: vertical strip, slots, reveal side and peak (B1), overflow as tabs in both directions (S17).
  3. Scenarios: tabs / shelf / templates in left and right bars; `tabs-overflow` covers both axes.

## Phase 2: edit mode

1. Panel row (S28), layout in the draft, Save state.
2. Mode: dim layer, floating box, bar indicators, labels.
3. Component drag: bar previews, gravity by midpoint, reorder, animation.
4. Scenarios: drag to each bar, gravity, reorder, cancel, reset, panel Save / Cancel.

## Phase 3: size

1. Edge drag in normal use, clamps, double-click reset (S20 to S23).
2. State file (S24).
3. Scaling rules (S14, S15, S19).
4. Scenarios.

## After each phase

- Guides: `TABS.md`, `SHELF.md`, `LAYOUT.md`, `SETTINGS.md`, `INPUT.md`, `AGENTS.md`.
- `RELEASES.md` entry.
