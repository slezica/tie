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
3. Body padding smaller than Pico's: 0.75rem top, 1rem sides, 2rem bottom.
4. Lists: square bullets, a quarter unit between items. Definition lists (Pico leaves them unstyled): terms bold, half a unit between terms, a quarter between a term's definitions.
5. Code token colors per theme (`Theme.code`, `SETTINGS.md`): tie-dark after the author's Neovim (onedark.nvim `dark` + treesitter + overrides; verified headless). Token rules split where nvim differs: regexp ≠ string, symbol ≠ number, section ≠ title, built-in ≠ type, variable ≠ property, link ≠ meta. Themes without `code` keep the ANSI mapping.
6. Plain code text stays the tile's fg (not nvim's dimmer `#abb2bf`).

## Open

- `.hljs-params` colors a whole parameter list; nvim colors identifiers only (highlight.js can't split it).
- `built_in` (console, Math, parseInt) has three colors in nvim; cyan chosen.
- A `tie-dev showcase` command (sample + reference stylesheets → per-section PNGs) if styles get another pass.
