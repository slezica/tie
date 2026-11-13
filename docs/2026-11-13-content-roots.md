# Content roots: the context tile's cwd

Record, 2026-11-13. Guide: `DIRECTORIES.md`.

# Topic

A content tile's frame root (what it may read, `TILES.md`) was the shown file's folder (principle 5, record `2026-10-30`). Markdown images `../img.png` never loaded; links a folder up needed a confirm (PENDING 9, 22).

# Settled

1. Principle: the user controls the risk. A wide cwd (`~`) is their choice; Tie doesn't narrow it.
2. Root = the context tile's cwd when it contains the file, else the file's folder. Every pathway (the tile's cwd is set on every one), every content kind (html included: static, no network; display-only exposure).
3. Navigation (links, back / forward, reload): the current root stays while the target is inside it; outside: rule 2 again for the target (cwd, else its folder).
4. Root `/` (cwd `/`, or a file directly in `/`): a dialog before the frame opens. "Stop" (default: nothing opens; an open tile shows an error, a navigation stays put), "Use file directory" (the file's folder; `/` itself: same as Stop), "Open anyway". Also on navigation into a `/` root.
5. `tie add --root D` for every content kind (was: probe only). Must contain the file (else `tie` errors). Explicit roots skip rule 2, not the `/` dialog.
6. The viewer gets the document's path within the root (`src`); relative links and images resolve against it.

# Plan

1. `core/roots.ts`: `rootFor(cwd, path, current?)` + tests.
2. `fileview.ts`, `kinds/html.ts`: root from the rule; `src` within root; `/` dialog; `--root`.
3. `bin/tie`, `driver.ts`: `--root` for content kinds.
4. Viewers: resolve against `src` (markdown images / links; html: the document URL already).
5. Scenario `root-cwd`; adjust `cwd-links`, `markdown-links`, `sec-content-nav`, `html-static`, `sec-html` where they assert the old rule.
6. Docs: `DIRECTORIES.md`, `MARKDOWN.md`, `VIEWERS.md`, `SECURITY.md`, `CLI.md`, `PENDING.md` (9, 22 closed), `AGENTS.md`.
