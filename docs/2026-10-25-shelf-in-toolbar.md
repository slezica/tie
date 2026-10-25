# Shelf in the toolbar

Move the shelf out of the right sidebar into a single toolbar with the tabs; remove the sidebar.

## Idea

- One **toolbar** per window, top or bottom (setting `toolbar`, default `bottom`): `[brand][tab list →][space][← shelf][template list]`.
- The **shelf** is a concept (where shelved tiles live: `S.shelf`, `location() === 'shelved'`, `--shelved`) and the strip that shows them. It is *located in* the toolbar; nothing assumes a sidebar or a fixed layout region.
- Items and templates are icon-only (title in tooltip). The reveal opens next to the item: above it (toolbar bottom) or below (toolbar top), horizontally centered, clamped into the board.
- Shelf always wins space. Tabs keep a floor (one tab + `+`), scroll horizontally past it with a fade and a divider where they meet the shelf; the shelf scrolls past its own max.

## Rationale

- Board gets the full window width; the sidebar's 68 px column mostly held empty space.
- Tabs and parked tiles are both "things not on the board": one strip for both.
- Icon-only items match the tab bar's height; labels live in the reveal's title bar.

## Settled

1. Element and code keep the name "shelf" (`#shelf`, `shelfRect()`); docs, code and CLI help lose every sidebar / right-column phrasing.
2. Setting `toolbar: top | bottom` replaces `tabBar`; `shelfStyle` removed (clean break, unknown keys ignored).
3. Toolbar height 40 px (`--toolbar-h`). Toolbar at bottom, window not borderless: top strip at the system title bar height (28 px, traffic lights only). Borderless: no top strip.
4. Order: templates anchored at the right edge, outside `#shelf` (sibling `#templates`); shelf items grow leftward.
5. Drop zone to shelve: the shelf strip only. Insert index by item horizontal midpoints; vertical insert line.
6. Reveal size stays 30% × 50% of board; `inRevealZone` becomes the bounding box of item ∪ reveal (orientation-agnostic).
7. Layout by CSS flex; JS only toggles the overflow state and scrolls the current tab into view.
8. Deferred: auto-scroll of the tab list while dragging a tab near its edges.

## Plan

1. **Toolbar + geometry**: `#toolbar` (brand, tabs, shelf, templates), moved top/bottom by `appearance.ts`; sidebar CSS gone; `boardRect()` full width; `shelfRect()` from the strip's DOM box; `#empty-hint`; icon-only items; drop by x; settings (`toolbar`, no `shelfStyle`); harness helpers and scenarios.
2. **Reveal**: above / below the item, peak orientation, `inRevealZone` bbox + tests, `shelf-reveal` scenario.
3. **Tabs overflow**: scroll, wheel → horizontal, floor, fade + divider, current into view; shelf scroll past max. Scenario.
4. **Sweep + docs**: every "shelf" mention (concept vs location); `SHELF.md`, `LAYOUT.md`, `TABS.md`, `SETTINGS.md`, `INPUT.md`, `CLI.md`, `bin/tie`, `AGENTS.md`, `PENDING.md`.
5. **Polish** (separate): wysiwyg icon ghost at the landing spot instead of the insert line; dashed "+" slot at the shelf's left edge while a tile is dragged.
