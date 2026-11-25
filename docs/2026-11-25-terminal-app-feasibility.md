# Topic

Feasibility of rebuilding Tie as a terminal application: a multiplexer running inside a host terminal, drawing non-text content through terminal graphics protocols (kitty's first).

Research only. Nothing built, nothing measured. Sources were read by research agents, not re-checked by hand; rows marked (unverified) are recall or conflicting sources.

# Pending

Nothing. Parked 2026-11-25.

- Reason to reopen: reach. Most people will not adopt an experimental terminal, but would try an experimental multiplexer inside their own. Small reason today: Tie is home-brewed, few users.
- If reopened, spikes first (each answers one unknown no source answers):
  1. Frame rate and latency: Electron offscreen rendering → kitty graphics over shared memory, 1500x1000 region, in kitty and Ghostty. Decides the browser question.
  2. Input: tile drag with pixel mouse (mode 1016), which `cmd` chords reach the app, trackpad scroll feel in a streamed page.
  3. Floats over images: clipping and z-order with a float crossing an image tile.

# Settled

Author's answers (2026-11-25):

- Motive: exploration. Standing doubt since the start: should Tie be a multiplexer. Electron was chosen for the shelf (hard in a terminal app) and the browser tile (Chromium built in).
- Host terminal: fine to require one.
- Browser tile: not essential, important. Without it, a hit.
- Shape: a sibling, if anything, until proven equivalent.

Verdict after the answers:

- The two original objections today: shelf no longer a blocker (cells + mouse drag); browser possible, degraded, and only with a Chromium sidecar.
- Equivalence is not reachable: zoom and typography per tile, trackpad feel, accessibility, OS drops. A sibling stays a sibling.
- The Electron choice still holds for the main app.
- Open value of a sibling: SSH, detach / reattach, host terminal's own rendering.

Verdict (medium confidence):

- Technically feasible, on kitty and Ghostty, local machine.
- Not a migration: a rewrite of the renderer and the harness. `src/core` and the CLI / socket survive.
- Electron (or another Chromium) stays as a hidden sidecar while html and browser kinds exist.
- Terminals, text, hex, image, markdown-as-cells: feasible with known techniques.
- Browser and html at today's fidelity: the doubtful part. Input, not pixels, is the limit.
- Recommendation: do not migrate. Parked (see Pending).

## Feature map

| Tie feature | As a terminal app | Verdict |
|---|---|---|
| Terminal tiles | VT emulator in the middle (libghostty-vt); every child feature parsed and re-emitted (keyboard protocol, mouse modes, OSC 8, OSC 52, children's own graphics) | Feasible, large; the "multiplexer tax" |
| Slot tree, tabs, shelf, bars | Cells; `core/layout.ts`, `bars.ts` reusable | Feasible; sizes quantized to cells |
| Floats | Text over text fine; over images: clip placements or use Unicode placeholders | Feasible (Zellij 0.45 ships it) |
| Tile drags, resize | Mouse reporting with motion; pixel coordinates in kitty, Ghostty, iTerm2, foot | Feasible |
| OS file drops | kitty only (OSC 72); elsewhere a pasted path | Degraded |
| Key bindings | Host terminal takes `cmd` chords first | Degraded: other modifiers or host config |
| Text, hex viewers | Cells | Feasible, simpler than today |
| Image viewer | Native kitty image | Feasible, good |
| Markdown | A: cells + inline images (selectable; typography work lost; big headings kitty only). B: rasterized by the sidecar (keeps the pipeline; no selection, find) | Feasible, each with a loss |
| Mermaid | Raster only | Feasible (presenterm: about 2 s per diagram via `mmdc`) |
| html kind | Offscreen Chromium frames + forwarded input | Doubtful fidelity |
| Browser kind | Same; trackpad, IME, selection weak | Doubtful fidelity |
| Menus, dialogs, settings panel | Redrawn in cells | Feasible, all rewritten |
| Themes, fonts, spacing tokens | Host terminal owns fonts and cell size | Mostly lost |
| Per-tile zoom, markdown scale | One font size for the whole terminal (OSC 66 in kitty only) | Lost; matters for readability |
| Accessibility | Grid characters only, no roles; text in images unreadable | Lost |
| `tie` CLI, socket, caller rule | Unchanged | Kept |
| Harness (Playwright over CDP, scenarios) | New harness: pty-driven, screen snapshots | Lost, rebuilt |

## Security model

- Kept: content sandbox, CSP, `tie-content`, policy table (they live in the sidecar).
- Gone: the UI realm as a web page (no DOM UI to protect).
- New: Tie becomes a terminal emulator between children and host. Every child escape sequence parsed, sanitized, re-emitted; child graphics reach the host's image decoders.
- Every `sec-*` scenario re-proved on a new harness.
- awrit's maintainer archived it citing rising security issues (see Research).

## Gains

- Runs over SSH (inline image data only; small or dirty regions).
- Detach / reattach becomes natural.
- Lives inside the user's terminal: its fonts, its rendering (block glyph issue gone).
- No window chrome code.

## Alternatives by motive

- Remote use: keep the app; remote ptys or `tie` CLI over SSH.
- Electron weight: native shell on libghostty (cmux's route).
- Inside the terminal: second frontend, terminals + text + image + markdown-as-cells only.

# Research

## Protocols

- Kitty graphics (kitty 0.51.1, 2026-11-23): only protocol with image ids, z-index, cropping, placeholders. Spec: https://sw.kovidgoyal.net/kitty/graphics-protocol/
  - Data: inline base64 (works remotely); file, temp file, shared memory (local only).
  - Placements: many per image, source rect, pixel offset inside a cell, size in cells.
  - Z-index: negative draws under text. Relative placements (0.31).
  - Unicode placeholders (0.28): image drawn by printing cells; survives hosts that move text; overlap and horizontal scroll may fail.
  - Animation: partial-rect frames, blend or replace.
  - Quota in kitty: 320 MB per buffer, oldest evicted.
  - Streaming 1500x1000 at 60 fps: no benchmark found. Raw RGBA = 360 MB/s; only shared memory makes it plausible. mpv has a kitty output with shared memory.
- Sixel, iTerm2 (OSC 1337): no ids, no z-order, no deletion. Fallback for static images only.
- Siblings:
  - Keyboard protocol: kitty, Ghostty, WezTerm, foot, Alacritty, iTerm2, Rio (unverified).
  - Pixel mouse (1016): foot verified; kitty, Ghostty, iTerm2 (unverified).
  - Pointer shapes (OSC 22): kitty, Ghostty.
  - Text sizing (OSC 66): kitty, foot render; Ghostty parses only.
  - Rich clipboard (OSC 5522): kitty, Ghostty 1.4.
  - Drag and drop (OSC 72): kitty 0.47 only.
  - Synchronized output (2026): near universal (unverified).

## Host support, macOS

| Terminal | Kitty graphics | Notes |
|---|---|---|
| kitty 0.51 | full | reference; also drops, text sizing |
| Ghostty 1.4 | full, animation new | https://ghostty.org/docs/install/release-notes/1-4-0 |
| iTerm2 3.6 | partial, improving | shared memory since 3.6.1 |
| WezTerm | partial (unverified) | last stable 2024-02 |
| Rio | yes, placeholders 0.3.11 | |
| xterm.js (VS Code, Tie's own tiles) | partial beta; no placeholders, no animation | Tie-in-Tie would degrade |
| Alacritty, Apple Terminal | none | |

Per-terminal feature tables disagree with each other. Check targets directly with kitty's `e=` query.

## Hard limits vs a GUI window

- No proportional fonts, no sub-cell text position.
- Text inside images: no selection, find, screen reader.
- Scrolling in cell steps (images can offset by pixels, text cannot).
- Text has no translucency.
- One window per instance; host takes `cmd` chords.
- HiDPI scale inferred, not reported (unverified).

## Prior art

- Web in a terminal:
  - zenbu-labs/terminal-browser: Electron offscreen rendering, changed regions as kitty patches, runs as a split pane, socket pane API. Needed an OS-level Swift helper for smooth scroll and trackpad. Active. No fps numbers. https://github.com/zenbu-labs/terminal-browser
  - awrit: Chromium through kitty graphics. Archived 2026-04-25 (time, security issues). https://github.com/chase/awrit
  - Carbonyl: Chromium fork into cells. Dormant since 2024-07. Independent test: about 5 fps, 400% CPU. https://github.com/fathyb/carbonyl
  - zydra.sh: desktop compositor over SSH. Kitty graphics, terminals as real text over aligned graphics, per-cell diff, client-side image cache, RGB over RGBA (25% less bandwidth), lower resolution while scrolling. No numbers; overlap and input not covered. https://zydra.sh/articles/ssh-is-a-gui-framework/
- Documents:
  - mdfried: big headings as images or OSC 66; images cut into row slices to scroll. https://docs.rs/crate/mdfried/0.22.1/source/README.md
  - presenterm: mermaid, typst, LaTeX as images, rendered async.
- Multiplexers:
  - Zellij 0.45 (2026-08): kitty graphics per pane; survives resize, scrollback, floating panes. https://zellij.dev/news/nested-sessions-kitty-graphics-new-ui/
  - tmux: native kitty graphics on master (Oct 2026), not in a release; second source says none as of 3.7c (consistent: unreleased). `image-kitty.c` about 1.3k lines; about 15 regression suites named after the hard parts: placements, layers, overlap, persistence, region scroll, nesting, resize.
- Building blocks:
  - libghostty-vt 1.0 (2026-11): stable C ABI. Rust crate pre-1.0.
  - ratatui + ratatui-image; OpenTUI (Zig core, TypeScript); notcurses.
  - Stacks: Rust (ratatui + libghostty-vt) or TypeScript (OpenTUI + libghostty-vt; keeps `src/core`).
- Same concept, other direction:
  - cmux: Swift + libghostty, terminals + scriptable browser pane, CLI + socket. Closest product to Tie; went native. https://github.com/manaflow-ai/cmux
  - Wave Terminal: Electron + Go, blocks.

## Source worth reading

- tmux master: `image-kitty.c`, `regress/image-kitty-*.sh`.
- Zellij: per-pane placement tracking, floating panes.
- terminal-browser: patch pipeline, Swift input helper.
- mdfried: sliced images, headings.
