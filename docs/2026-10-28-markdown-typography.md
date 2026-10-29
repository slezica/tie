# Markdown typography and code colors

Restyle of the markdown viewer: prose typography after a reference stylesheet, code tokens after the author's editor.

## Method

- `dev/samples/markdown.md`: every syntax the viewer renders (headings, inline, lists, definition lists, quotes, tables, code in 12 languages, images, rules, diagrams, nesting).
- Showcase (scratch, not in the repo): the sample rendered in headless Chromium with 15 stylesheets at one 860 px column, cropped per section (headings, inline, lists, quotes, tables, code), composed 3 per row, opened on the shelf as image tiles. Candidates: Tie (current, WIP), GitHub markdown CSS, VS Code preview, typrose (Tailwind prose), Typora Night / GitHub / Pixyll / Newsprint, water.css, sakura, new.css, matcha, Pico, Modest.
- Finding: the fault was base size, not spacing rules. Prose ran at the terminal's 12 px; every reference sits at 14–18 px with 1.5–1.6 line height, and em margins shrink with it.
- Hot loop for iterating: `tie-dev run --hot` + `tie-dev sample`; viewer edits rebuild and the tile reloads with its scroll (`HARNESS.md` "Hot").

## Settled

1. Pico CSS v2 (classless) as the reference: one root font-size knob; type sizes in em, layout spacing in rem (`--space` = 1rem), so the knob scales everything.
2. Root = tile font × `--scale` (1.15): 12 → 13.8 px. Line height 1.5. Headings h1 2em … h6 1em with Pico's per-level line heights; a heading after a block gets Pico's top space (3 … 1.5 units).
3. Body padding: 0.75rem top, 2rem sides (was 1rem; widened 2026-10-28, `2026-10-28-tile-management.md`), 2rem bottom.
4. Lists: square bullets, a quarter unit between items. Definition lists (Pico leaves them unstyled): terms bold, half a unit between terms, a quarter between a term's definitions.
5. Code token colors per theme (`Theme.code`, `SETTINGS.md`): tie-dark after the author's Neovim (onedark.nvim `dark` + treesitter + overrides; verified headless). Token rules split where nvim differs: regexp ≠ string, symbol ≠ number, section ≠ title, built-in ≠ type, variable ≠ property, link ≠ meta. Themes without `code` keep the ANSI mapping.
6. Plain code text stays the tile's fg (not nvim's dimmer `#abb2bf`).
7. Lists (2026-10-28): markers flush with the text's left edge, numbers left-aligned ("1." and "10." start on one line), item text one fixed indent in (`--indent` 2em: fits "10." with a gap), wrapped lines hang under the first. Technique: `list-style: none`, `li` relative + `padding-left: var(--indent)`, `li::before` absolute at left 0: `counter(list-item) '.'` (tabular nums; honors `start` / `value`, restarts per list), or a 0.35em square (currentColor, centered on the first line, 0.1em in: optical). Task boxes take the marker's place (absolute, `li.task::before` none). Nested lists indent from the parent's text edge. 3+ digit numbers overflow the indent into the text gap (accepted: rare).

## Variables

Every size and space in `src/viewers/markdown.html` is a custom property on `:root` (2026-10-28): a theme or scale tweak is one edit. em = follows the text; rem (via `--space`) = follows the root, scaled by `--scale`.

- `--scale` 1.15: root font-size over the tile font (`--size`).
- `--leading` 1.5: line height of prose and code blocks; also centers bullets and task boxes on the first line.
- `--space` 1rem: rhythm unit; every rem value below derives from it.
- `--gap` 1 unit: below every block and heading; above a quote.
- `--gap-group` ½ unit: between paragraphs in a list item; between definition terms.
- `--gap-tight` ¼ unit: list items, nested lists, definitions and their paragraphs, footnote paragraphs, diagram error line.
- `--gap-footnotes` 2 units: above the footnotes rule.
- `--pad-top` ¾, `--pad-side` 2, `--pad-bottom` 2 units: body padding.
- `--h1`…`--h6` 2, 1.75, 1.5, 1.25, 1.125, 1: heading size factor (em).
- `--h1-leading`…`--h6-leading` 1.125 … 1.25 (+0.025 per level): heading line heights (Pico).
- `--heading-space` 1.5: top space after a block, in units per em of heading size (h1 3 … h6 1.5 units).
- `--small` 0.875em: footnotes section, diagram error, blocked image.
- `--sup` 0.75em, `--sup-raise` 0.5em: footnote ref size and lift.
- `--indent` 2em: list item text from the marker edge.
- `--bullet` 0.35em, `--bullet-nudge` 0.1em: square bullet side, optical inset.
- `--dd-indent` 1 unit: definition from its term.
- `--box` 0.9em, `--box-check` 0.75em, `--box-gap` 0.5em, `--box-radius` 0.125rem: task box side, ✓ glyph, gap when inline, corner.
- `--code-size` 0.875em: mono relative to prose.
- `--code-pad` 0.125em 0.375em, `--code-pill-leading` 1.4: inline code pill.
- `--code-leading` = `--leading`: code blocks; separate so prose leading can change without them.
- `--chip-pad` 0 0.4em: blocked image placeholder.
- `--inset` 1 unit: padding inside quotes and code blocks.
- `--cell-pad` ½ unit 1 unit: table cells.
- `--hairline` 1px: rules, cell borders, task box, dashed frames (front matter, blocked image).
- `--head-rule` 0.1875rem: under a table's header row.
- `--quote-bar` 0.25rem: blockquote left bar.
- `--radius` 0.25rem: code, code blocks, blocked image.
- Not here: change marks (px, `marks.ts`), base colors (`runtime.ts`), code token colors (`highlight.ts`).

## Open

- `.hljs-params` colors a whole parameter list; nvim colors identifiers only (highlight.js can't split it).
- `built_in` (console, Math, parseInt) has three colors in nvim; cyan chosen.
- A `tie-dev showcase` command (sample + reference stylesheets → per-section PNGs) if styles get another pass.
