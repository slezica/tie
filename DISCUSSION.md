# Topic

Move the shelf UI into the bottom bar; retire the right sidebar. "Shelf" becomes the concept (where shelved tiles live: `S.shelf`, `location() === 'shelved'`, `--shelved`), not an element.

Requested:

1. Templates + shelf items in the bottom bar, right gravity.
2. Tabs (left) and shelf (right) grow inward.
3. Shelf always wins space.
4. Tabs overflow → scrollable; overflow indicator at the right end; divider at the tabs/shelf meeting point only when overflowing.
5. Bottom bar a bit taller.
6. Right sidebar removed.
7. Docs + code: "shelf" ≠ sidebar.

# Pending

1. Full e2e green (67 scenarios; `settings` fixed for the bottom toolbar). Phases 1–4 committed.
2. Polish pass done (ghost slot, "+" hint slot, hidden drag source, pointer label hidden over the strip); full e2e green after it (67/67).
3. Tune after use: toolbar height 40, title strip 28, slot 28, tab floor 140.

# Settled

1. "Shelf" = the concept (where shelved tiles live) and the strip that shows them. Task includes a sweep: no wording or code assuming it is a right sidebar; the shelf is *located in* the toolbar, not identical to a layout region.
2. One **toolbar** = `[brand][tabs →][space][← shelf][templates]`. Setting `toolbar: top|bottom` (was `tabBar`), default `bottom`. Top: toolbar in the top strip after the traffic lights; bottom: top strip = traffic lights only (0 when borderless).
3. Shelf always wins space; tabs keep a floor (one tab + `+`); past that the shelf scrolls.
4. Templates anchored at the right edge, outside `#shelf` (sibling `#templates`). Drop zone to shelve = shelf strip only.
5. Items and templates icon-only (title on tooltip). `shelfStyle` setting dropped; `--shelf-w*`, `.shelf-compact` go.
6. Reveal: next to its item, horizontally centered, clamped into the board: above the item (toolbar bottom) or below (toolbar top); peak points at the item. Size 30% × 50% of board.
7. Tabs overflow: horizontal scroll (wheel → horizontal), current tab scrolled into view on switch, fade indicator at the right end, divider only while overflowing. Auto-scroll while dragging a tab: deferred (PENDING.md).
8. Toolbar height 40px, tune after. Toolbar bottom + not borderless: top strip at system title bar height (28px).
10. Clean break: setting `toolbar: top|bottom`, `shelfStyle` gone. Terms: toolbar holds the tab list, the shelf, the template list.
11. Approach A (CSS flex). Record: `docs/2026-10-25-shelf-in-toolbar.md`.
9. `#brand` (instance name when not `default`): left of the tabs, in the toolbar. Deliberately visible.

# Polish

After the core lands:

1. Drop onto the shelf: replace the insert line with a ghost of the item's icon at its landing spot (wysiwyg).
2. While a tile is dragged: an item-like "+" slot with dashed border at the shelf's left edge, signalling the drop; dragging over it swaps it for the ghost.

# Proposal

Approaches for the toolbar layout:

- **A. CSS flex, JS only for state classes** (recommended). `#toolbar` flex row: `#brand`, `#tabs` (`flex: 1 1 0; min-width: <floor>; overflow-x: auto`), `#shelf` (`flex: 0 1 auto; max-width: calc(100% - floor - templates); overflow-x: auto`), `#templates` (`flex: none`). Browser resolves "shelf wins". JS: after `renderTabs` and on resize, toggle `.overflow` on `#tabs` (`scrollWidth > clientWidth`) → fade + divider; `scrollIntoView` current tab. Pros: no measuring, resize-safe, little code. Cons: floor expressed in CSS vars; scrollbars hidden via CSS.
- **B. JS-measured widths**: `render()` measures the window, assigns px widths to tabs and shelf, decides overflow. Pros: single geometry source (`readGeometry` style), exact. Cons: layout thrash on every render, duplicates flex.

Reveal zone: `inRevealZone` → inside the bounding box of item ∪ reveal (orientation-agnostic; equals today's item ∪ reveal ∪ band for the horizontal case). Tests updated for both orientations.

Phases:

1. **Toolbar + geometry.** `#toolbar` in `index.html` (brand, tabs, shelf, templates); `appearance.ts` moves it top/bottom; sidebar CSS removed; `boardRect()` full width, `shelfRect()` = strip in the toolbar; `#empty-hint` inset; items/templates icon-only; `drag.ts` insert index by horizontal midpoints, vertical insert line; settings: `toolbar` replaces `tabBar`, `shelfStyle` removed (panel, main sanitize, docs). Harness: `dropOnShelf`, `shelfItem`, `window-layout.mjs`, `shelf.mjs`, `sec-drop.mjs`. Reveal keeps working at a temporary position.
2. **Reveal.** Position above/below the item, clamp into board, peak orientation (`#peak` clip-path per side), `inRevealZone` bbox + tests, `shelf-reveal.mjs` paths rewritten for the new geometry.
3. **Tabs overflow.** Scroll, wheel mapping, floor, `.overflow` fade + divider, current tab into view; shelf scroll past its max. Scenario: many tabs → overflow class, floor width, shelf intact; many shelved → shelf scrolls, tabs at floor.
4. **Sweep + docs.** All "shelf" mentions in docs/code/CLI help: concept vs location. `SHELF.md` (restructure: concept, toolbar strip, reveal), `LAYOUT.md` geometry, `TABS.md` (toolbar), `SETTINGS.md`, `INPUT.md`, `CLI.md`, `bin/tie` help, `AGENTS.md`, `PENDING.md` (auto-scroll drag, polish items, notifications wording). Record `docs/2026-10-25-shelf-in-toolbar.md`.
5. **Polish** (section above), separate pass.

# Research

Current state (code read 2026-10-25):

- Sidebar = `#shelf` (`index.html`), CSS `#shelf` column, `--shelf-w` 68px / `--shelf-w-compact` 40px; `.template` / `.item` 54px tall, column layout (icon over label).
- Geometry: `boardRect()` subtracts `SHELF_W + GAP` on the right (`state.ts:160`); `shelfRect()`; `#empty-hint` inset mirrors it (`style.css:830`).
- Reveal: left of the sidebar, centered on item's vertical midpoint, `#peak` ">" on the reveal's right edge (`render.ts` shelf loop). Hover zone: item ∪ reveal ∪ horizontal band (`core/layout.ts inRevealZone`, tested).
- Drop onto sidebar: `inside(shelfRect())`, insertion index by item vertical midpoint, `#shelf-line` horizontal 2px (`drag.ts:67-85`).
- Tabs: `#tabs` lives in `#top`, moved into `#bottom` by `appearance.ts` when `tabBar: bottom`; both bars `-webkit-app-region: drag`, `.tab` / `#tab-add` no-drag. `#tabs` has `min-width: 0`, no overflow handling: tabs just shrink (`max-width: 200px`, ellipsis).
- Settings: `tabBar`, `shelfStyle`, `borderless` (`main/settings.ts`, `renderer/settings.ts`, `appearance.ts`, `docs/SETTINGS.md`). `borderless + tabs bottom` → `--top-h: 0`.
- Harness: `dev/helpers.mjs` `shelfItem`, `dropOnShelf` (uses `#shelf` box, below items), `hoverShelf`; scenarios `shelf.mjs`, `shelf-reveal.mjs` (moves "down the shelf column"), `window-layout.mjs` (asserts `#shelf` width shrinks when compact), `tabs.mjs`, `sec-drop.mjs`, `markdown-open.mjs`.
- "shelf" references: ~230 across src/docs/dev. Concept uses (keep): `S.shelf`, `Space.shelf`, `location 'shelved'`, placement `{type:'shelf'}`, `tie open --shelved`, `tie list` `shelf` field, `.tile.shelved`, "shelving". Element uses (rename): `#shelf`, `shelfRect`, `SHELF_W`, `--shelf-w*`, `.shelf-compact`, `shelfStyle`, `#shelf-line`, `#shelf .sep`, docs "right-hand column", `bin/tie` "shelf at the right edge", CSS comment "Wave's right widget bar".
- Docs touched: `SHELF.md` (layout, reveal position/zone), `LAYOUT.md` (geometry formulas, `--shelf-w`), `TABS.md` (tab bar), `SETTINGS.md`, `INPUT.md` (drop table), `AGENTS.md` (model, files), `CLI.md` wording, `bin/tie` help.
- `PENDING.md` items near this: drop tile onto a tab to move it (bar now hosts both: natural follow-up); notifications "top-right next to shelf" (position wording to revisit).
