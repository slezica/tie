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

## Dropped ideas

- D1. Cmd+hover / Cmd+drag in normal use. Reason: Cmd is held for every shortcut, the highlight would flicker; a permanent gesture for a rare action.
- D2. Shelf multi-select moving from Cmd to Shift. No longer needed: Cmd+click stays (`2026-11-17-shelf-multi-select.md`).

# Pending

Each has my pick first. Uncertain ones are marked.

## Edit mode

- P1. Unsaved panel edits when entering the mode.
  - a. "Edit layout" disabled while the panel has changes (pick).
  - b. Layout joins the panel draft: the mode ends with Done / Discard, back to the panel, one Save.
- P2. Buttons in the floating box: `Discard`, `Defaults`, `Save` (pick). `Defaults` changes the draft only.
- P3. The mode's Save writes the settings file (explicit action, so the file rule in `SETTINGS.md` holds). Confirm.
- P4. Preview look: abstract accent-tinted box, as tile drop previews (pick), or a ghost of the component.
- P5. Leaving the mode by Escape = Discard? (pick: yes.)

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

Survey only; the detailed read is step 0 of the plan.

- Flexbox covers the layout. Code that does not follow automatically:
  - About 30 reads of `x` / `width` / `scrollLeft` in `tabs.ts`, `shelf.ts` (overflow fades `more-left` / `more-right`, tab reorder, drop positions).
  - `render.ts`: reveal placement uses a `below` flag (top / bottom only).
  - `drag.ts`: tile drop on the bar uses the bar midpoint rule (P13).
  - `state.ts`: geometry has `TOP` / `BOTTOM` only; needs left / right insets for the board.
  - `appearance.ts`: moves `#toolbar` between `#top` and `#bottom`; class `toolbar-bottom`.
- Already direction-neutral: `inRevealZone` / `gapBetween` (`core/layout.ts`) handle side-by-side rects.
- Toolbar is a window drag region (`-webkit-app-region`); see the note in `shelf.ts`. To check for side bars.
- Scenarios touching the toolbar: `tabs*`, `shelf*`, `templates`, `settings` (toolbar select), `layout-*` (geometry). To list in step 0.

# Plan

## Phase 0: read and close questions

1. Read `tabs.ts`, `shelf.ts`, `drag.ts`, `render.ts`, `state.ts` geometry, toolbar CSS. List every horizontal assumption.
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
3. Discard / Defaults / Save.
4. Scenarios: drag to each bar, gravity, reorder, discard, reset.

## Phase 3: size

1. Resize handles in edit mode, clamps.
2. Scaling rule (P7).
3. Scenarios.

## After each phase

- Guides: `TABS.md`, `SHELF.md`, `LAYOUT.md`, `SETTINGS.md`, `INPUT.md`, `AGENTS.md`.
- `RELEASES.md` entry.
