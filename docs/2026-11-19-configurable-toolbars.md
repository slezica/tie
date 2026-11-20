# Configurable toolbars

Status: implemented 2026-11-20 (phases 1 to 3). Not released. Open: manual checks (`RELEASES.md`), feel iteration.

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
  - W3. S24 (sizes in a state file): the first persisted UI state outside settings. Built (phase 3): `main/uistate.ts`.
  - W4. Bar edges in a visible window: `no-drag` carved out of the bars' drag regions, cursors, the lit edge. Manual check (offscreen: no drag regions).

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

## Phase 1a, as built (2026-11-20)

- Custom properties keep `calc()` unresolved in `getComputedStyle`: `readGeometry` reads the parts (`--strip-h`, `--bar-<side>`) and adds them. `--top-h` etc. stay for CSS only.
- Bar = `[.group.start][.bar-space][.group.end]`; groups `display: contents`. Rejected: `margin-left: auto` on the end group's first child: the brand is first there with tabs at the end, and `display: none` when the instance is `default`.
- `#tabs` content-sized (`flex: 0 1000000 auto`, floor `calc-size(max-content, min(size, --tabs-min))`), not `flex: 1`. A plain `min-width: --tabs-min` left a gap between the brand and short tabs at a bar's end (screenshot check). With `flex: 1` the tabs would push the components after them in their group to the far end: gravity breaks. Choice: S12 read as "the tab list gives way first", the free space is `.bar-space`. Shelf width change during a tabs overflow: sub-pixel (`tabs-overflow` checks < 1 px).
- Brand: bar space for drops (nearest: the tabs → new tab). Was no drop. Choice: no special case.
- Drop rule: the component's span along the bar's axis only (cross axis ignored, as before: the bar's height).
- Shelf drop from bar space: before the strip → slot 0, after → end. S26 "near end" read this way.
- Templates divider: `.after-shelf` / `.before-shelf`, only when adjacent in one group. `#tabs.overflow` divider dropped when the tabs are last in an end group.
- Panel: preview applies `{...saved, ...draft()}`, so the active layout stays; `dirty()` never sees `bars`. `validateSettings` reports an invalid `bars` (field `bars`) for a future panel save.
- Layout changes in scenarios: settings file edited + panel Reload (`h.setBars`), the real path until phase 2.
- `trafficLightPosition` y 10 → 7 (buttons 14 px, centred in 28). Unverified: offscreen windows draw no traffic lights. Manual check.
- Pre-existing failure fixed on the way: `sec-state` clicked a disabled Save (since `4db92b7`).

Horizontal-only code left for 1b (line numbers as of the 1a commits; all done in 1b, below):

- `tabs.ts:134-172` `dragTab`: threshold and reorder on x (B4).
- `tabs.ts:186-226` `edgeScroll`: `scrollLeft` / x only.
- `tabs.ts:290-308` `showTab`, `syncOverflow`: `offsetLeft`, `more-left` / `more-right`.
- `tabs.ts:313` `tabDropAt(x)`: nearest tab by x (B2: in a vertical bar, the first tab).
- `tabs.ts:345` wheel: skipped in a vertical bar (native scroll, B3 avoided); no fades there yet.
- `drag.ts:103` shelf slot from x and `scrollLeft`.
- `render.ts:104-124` reveal: left / right bars placed as bottom (B1); peak up / down only.
- `style.css:181` `#tab-list` mask `to right` (off in vertical bars); `style.css:978` `#shelf::before` hint sized for a row.
- Vertical bar CSS is basic: tabs stretched full width, `+` full width, shelf / templates centred columns.

## Phase 1b, as built (2026-11-20)

- `renderer/overflow.ts`: one axis-generic module for the tab list and the shelf strip: `syncFades`, `showChild`, `sideWheel`, `edgeScroll` (+ `edgeHolding`). Axis per call (`verticalComponent`), read once per drag. Rejected: a copy per list.
- Fade classes `.more-start` / `.more-end`; mask direction `--fade-dir`. Rules keyed `#tab-list.more-*` / `#shelf.more-*`: a bare `.more-*` class loses to the lists' `#id` rule (bug found by a screenshot; scenarios now check the mask depth).
- `startDrag` runs two edge scrollers (tab list, shelf). Cross-axis zone: the component's bar (was `#tabs`; same in a horizontal bar).
- Shelf drop pitch measured from a shown item (`offsetWidth` / `offsetHeight` + `--slot-gap`): works for scaled items. `SLOT` dropped from `state.ts`.
- Forms (S14, S15) in CSS only: `.bar.v` is a size container (`container: bar / inline-size`); `@container bar (width <= 54px)` = narrow. 54 is literal (1.5 × `--slot` + 2 × `--pad`): queries can't read variables. `--item` = `clamp(--slot, 100cqi - 2 × --pad, 1.5 × --slot)`; icons scale by `--item × 16 / 28` (no typed arithmetic needed). Phase 3 only changes the bar's width.
  - Choice: the list form starts right past the narrow form's widest (55 px: a title of ~15 px). S14 read literally; tune in phase 3.
  - Harness: `h.setBarSize(px)` overrides `--vbar` on the root.
- Vertical tabs: close button only on hover (choice: the title keeps its room in a narrow bar; horizontal unchanged: also on the current tab). Tab and brand text start 8 px in (was 12 horizontally).
- Reveal (S16): x against the board edge by the bar, y centred on the item and clamped; peak `.left` / `.right` (`clip-path`), level with the item, clamped to the reveal's edge.
- Templates: no click-to-spawn exists (drag only, as horizontal); not added.
- Unit tests: `inRevealZone` for left and right bars (item at the bar's top with the reveal clamped below it; item level with the reveal's middle).
- Scenario lesson: Playwright `mouse.move(x, y, options)` takes `x`, `y` from `options` too: spreading `h.boxOf` results (`{x, y, box}`) as arguments moved the pointer to the box's corner (flaky drags). `HARNESS.md` "Scenarios".

Still horizontal-only or open after 1b:

- Thickness scaling of horizontal bars (S19), resize (S20 to S23): phase 3.
- Keep-in-view for the shelf (a new item appended out of view stays there): none, as before.
- W2 (drag regions on side bars and the reveal): manual check still pending.

## Phase 2, as built (2026-11-20)

- Files: `renderer/layoutedit.ts` (the mode), panel row in `settings.ts`, pure parts in `core/bars.ts` (`sameBars`, `moveComponent`, `barsSummary`, `barRects`, `barZones`, `barAt`, `gravityAt`, `indexAt`; unit tests).
- Summary text: per bar in use, `Bottom: Tabs, Shelf, Templates`; `Top: Tabs · Left: Shelf, Templates`. Choice: grouped by bar (shorter than S28's "Tabs bottom, Shelf bottom, Templates bottom" once components share a bar); no gravity shown.
- Changeset: `draft()` carries `bars`; preview applies it (the 1a rule "preview keeps the active layout" is gone); `dirty()` compares it with `sameBars`.
- Input blocking: one transparent root over the window below the title strip (z 6500) takes every pointer event; components are drag handles drawn over it (`.le-comp`). Rejected: capture-phase listeners stopping clicks per component (hover reveals, wheels, menus each need a case).
- Keys: a window capture listener blocks every key outside the box (a tile focused by `refocus()` after a dialog gets nothing); Escape: drag, else mode; Tab trapped between the box's buttons. Shortcuts: suspended as with the panel open (`modalOpen` also counts `#layout-edit`).
- Zones: potential bars drawn as zones that never overlap (`barZones`): a potential side bar between the top / bottom zones, a potential top / bottom between existing side bars. The targeted absent bar shows its real future rect (S9). Hit test = the zones.
- Preview box: rough size. Length = its length in its current bar; into the other orientation capped at 30% of the bar (45% same orientation). Placed after the previous component (start) or before the next (end); may overlap the components it lands between (they don't move during the drag). 140 ms transition.
- Labels: accent pills on the board side of the bar, centred on the component, clamped inside the four zones (over the board only: a label never covers a bar or a potential zone), side bar labels clear the top / bottom label bands, swept apart along the bar.
- Dim: `--bg` 60% (the dialog backdrop's). Terminals are mostly `--bg`: they barely show behind it.
- Banner / Reload in the mode: the panel is hidden, so Reload can't be pressed; the banner updates and shows on return. Choice: no special handling.
- Menu toggle (`cmd+,`) in the mode: the mode's Cancel (`abortLayoutEdit`, from the panel's `remove()`), then the panel's Cancel (reverts to the saved layout). Same for a Reload rebuild.
- Persistence check: the file and `settings.get()` after Save (no restart in the scenario: the file is what a restart reads).
- Not verified offscreen (manual): bars and the root not acting as window drag regions during the mode (W2 family); the title strip still dragging the window.

## Phase 3, as built (2026-11-20)

- Files: `core/barsize.ts` (limits, clamp, scale, forms, file parse; unit tests), `main/uistate.ts` (the file), `renderer/barsize.ts` (sizes, CSS, edges). `barRects` / `barZones` take a size per bar.
- Sizes per bar (S21, S22): top / bottom 32..60 (40); left / right 48..30% of the window width (160), static cap 1200 for stored values. Whole px.
- Window narrowed (S21): a side bar wider than 30% is shown clamped; the stored size stays and returns with the window. Choice: as the brief suggested; nothing found wrong with it.
- Edge (S20): `.bar-edge` per bar, 6 px: 4 inside the bar, 2 over the board. z 1500 (above floats and a zoomed float; below reveals and menus). Top / bottom edges win at corners (z 1501, full width). `no-drag`, after the bars in the DOM (Electron subtracts later no-drag regions). Hidden in the edit mode. Live: render at each move, as a border drag (terminals refit only when their grid changes; no debounce there either).
- Double-click (S23): the default. Dev socket `bar-size` sets a size as a resize's end (harness).
- File (S24): written at a resize's end only, only on change; main cleans the payload (`cleanSizes`) and logs dropped fields `[security]`; not an object: refused. Read at start with the same cleaning, per field; problems logged `[app]`, never a dialog. The renderer gets the sizes before the first render (`ui:get`).
- Scale (S19): one unitless `--k` per bar, set by JS (`barScale`); CSS multiplies (`calc(Npx * var(--k))`). Rejected: CSS typed division (`100% / 40px`): not relied on in this Chromium.
  - Below 40: shrink to a floor of 0.875x (reached at 35 px): icons 14 px, slot 24.5. Rejected: 0.8x at 32 (icons 12.8 px: too small to read).
  - Text never below its default (`--kt` = max(1, `--k`)): 12 px tab text in a 32 px bar. Choice: legibility first; only paddings and icons shrink.
- Forms by width (S14, S15): `.narrow` set by JS under `LIST_MIN` = 100 px. The container query and its 54 literal are gone (the threshold lives in `core/barsize.ts`; `100cqi` still sizes `--item`).
  - Narrow scales 48 → 54 px (36 → 42 px icons), then a dead band to 99 px: 1.5x icons, centred.
  - List from 100 px: titles show ~6 letters ("~/pro…"). Judged by screenshots at 48, 54, 64, 72, 80, 84, 96, 99, 100, 110, 120, 160, 240: at 72 to 96 a list title would show 1 to 4 letters.
- Narrow tabs: no close button on hover (`.narrow`); padding 4 px. At 48 px: 2 or 3 letters + ellipsis ("no…" for node_modules; 3 letters need ~33 px, the row gives 28). Choice: keep `--pad` margins (rows aligned with the icons below) over S22's "about 3 letters". Added: Close in the tab menu and middle-click close (neither existed).
- Harness: `ctx.restart()` (same instance, files kept), scenario `uiState` seed, `h.setBarSize(ctx, bar, px)` (dev socket), `h.resizeBar`, `h.barEdge`, `h.barSizes`, `tie state` `barSizes`. `launch()` refuses `dev` / `default`; fresh instances remove their UI state file at launch and stop.
- Scenarios: `layout-bars-size` (edges on four sides, live insets, clamps, window resize, double-click, corners, edit mode, layout Reset, file at drag end only, 0600, restart), `layout-bars-scale` (32 / 40 / 50 / 60 bottom and top: heights, text, glyphs, centring; slot drop, reveal, overflow at 60; side forms across widths; narrow tabs; mixed layout), `layout-bars-state` (garbage, mixed bad values, wrong shape, unreadable, failed write), `sec-state` (payload, file). `shelf-vertical` on the new helper.
- Not verified offscreen (manual, W4): edges as no-drag islands in the bars' drag regions; the resize cursor over them in a real window.

## Scenarios affected

- Rewritten: `layout-geometry` (entirely top / bottom), `tabs-overflow` (entirely horizontal), `tabs-drops` (midpoint rule).
- Adjusted (x-based points): `tabs`, `content-input`, `shelf`, `shelf-reveal`, `shelf-select*`, `cwd-templates`, `sec-drop`, `viewer-open`; helper `h.shelve`.
- Fixed "away" points such as (60, 300) would hit a left bar: take them from `list.board`.
- `boardRect` change reaches every `layout-*` scenario.

# Plan

## Phase 0: read and close questions (done)

## Phase 1: model and rendering (no editor, no resize)

- 1a. Core + horizontal (done):
  1. Done. `core/bars.ts`: bars type, default, validity, `cleanBars`, `migrateToolbar` (S39, S40), lookups, `dropComponent`. Unit tests.
  2. Done. DOM: `#titlebar` (system only, S10) + four bar containers; components mounted per layout (`renderer/bars.ts` `applyBars`); brand with tabs.
  3. Done. Geometry: board insets on four sides (`state.ts`), CSS vars.
  4. Done. Tile drops per component and nearest-component rule (`barDropAt`; S25 to S27).
  5. Done. Panel: `#set-toolbar` select removed (layout by file + Reload until phase 2).
  6. Done. Scenarios: `layout-geometry`, `tabs-drops` rewritten; helper `h.setBars`.
- 1b. Vertical (done):
  1. Done. Tabs: axis-generic drag, reorder, overflow, drop target, wheel (B2 to B4).
  2. Done. Shelf + templates: vertical strip, slots, reveal side and peak (B1), overflow as tabs in both directions (S17); forms by bar width (S14, S15).
  3. Done. Scenarios: `tabs-vertical`, `shelf-vertical`, `shelf-overflow` (both axes); `tabs-overflow` covers both axes; `layout-geometry` mixed layout + reveal per bar.

## Phase 2: edit mode (done)

1. Done. Panel row (S28), layout in the draft, Save state.
2. Done. Mode: dim layer, floating box, bar indicators, labels.
3. Done. Component drag: bar previews, gravity by midpoint, reorder, animation.
4. Done. Scenarios: `settings-layout` (row, mode, blocked input, Done / Cancel / Escape, Save, Reset, panel Cancel, menu toggle, resize), `settings-layout-drag` (each component to each bar, gravity, reorder, previews, emptied bar, light theme).

## Phase 3: size (done)

1. Done. Edge drag in normal use, clamps, double-click reset (S20 to S23).
2. Done. State file (S24).
3. Done. Scaling rules (S14, S15, S19).
4. Done. Scenarios: `layout-bars-size`, `layout-bars-scale`, `layout-bars-state`, `sec-state`.

## After each phase

- Guides: `TABS.md`, `SHELF.md`, `LAYOUT.md`, `SETTINGS.md`, `INPUT.md`, `AGENTS.md`.
- `RELEASES.md` entry.
