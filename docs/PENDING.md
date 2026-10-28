# Pending

## Interface

1. Html dynamic pages: not supported (static only, decision 2026-10-21; option B of the security review). Revisit if real use needs sandboxed JS with no network; the alternative is a local server + browser tile.
2. Settings panel review: three pages now (Appearance, Terminal, Content); structure, naming and scopes deserve a pass before more settings land.
3. Keymap settings: override default shortcuts (`DEFAULT_KEYMAP` in `src/core/keymap.ts`) from the settings panel.
4. Tab list: auto-scroll while dragging a tab, or a tile over the tabs, near its edges (deferred 2026-10-25, `2026-10-25-shelf-in-toolbar.md`; tile drops onto tabs 2026-10-28).
5. Exit dialog checkbox: restore tabs + layout on next launch. Variants and trade-offs to analyze first (terminal state, content tiles, scrollback).
6. Review feature, binding and menu discoverability.

## Alerts

7. Logs in the UI: comfortable access to the instance log (at least the always-on `[security]` lines), filter by tag, follow mode. Today: `tie-dev logs -f` / the file under `~/.config/tie/log/`.

8. New system: notifications floating in a corner of the board, by the toolbar. Title, body, x to close, swipe to close.
    - Ephemeral for now. Later maybe history.
    - First use: explain blocked actions the user may not understand (refused link scheme, denied permission, blocked navigation).

## Tiles

9. Kinds add custom title-bar buttons (first use: back/forward, maybe reload, beside hotkeys).
10. Markdown: images outside the file's folder (`../img.png`) never load (root = the file's directory). Option: root = repo / nearest common ancestor.
11. Markdown: scroll memory lost across a frame reload (back/forward between directories → top). Partly done 2026-10-28: the viewer reports its scroll (`scrolled`), the host restores it after a viewer reload. Left: a per-path map in the host so back/forward across directories restores too.
12. Markdown: link target shown on hover (like terminal links), outline, search.
13. Terminal block/box chars show row gaps (QR codes): DOM renderer uses font glyphs. Undecided whether to fix now; options in `2026-10-24-terminal-block-glyphs.md`. Sixel (`@xterm/addon-image`) separate.

## Install

14. Staged install (auto-updater pattern, 2026-10-28): `tie-dev install --next` stages `/Applications/Tie.app.next` (packaging done while Tie runs); Tie's quit path, seeing a staged bundle beside its own, spawns a detached script that waits for the process to exit, moves the old bundle aside, moves the staged one into place and relaunches. Replacing or moving the bundle while running is unsafe (lazy `app.asar` reads, helpers spawned from the bundle path).

## CLI

15. `tie move`: to another tab (`--tab`), swap with another tile (`--swap`); today only the mouse and keys do these (2026-10-28).
16. `tie` resolution relies on PATH. macOS `path_helper` (login shells) moves Tie's `bin/` behind system dirs, so another `tie` earlier on PATH (e.g. the installed app's, from rc files) would win in a dev instance's shells (same socket, older CLI). Trusted for now; if it bites: `TIE_BIN` (absolute path of the matching CLI) + every `tie` re-execs `TIE_BIN` when it isn't it.

## Markdown

17. Change marks fade while the tile is shelved (frame reports itself visible). Host should tell the viewer it's hidden.
18. Math: Temml researched (2026-10-15), ready if wanted.

## Security

19. `runAsNode` fuse on: CLI launcher runs Tie as Node. Signed binary usable as generic Node (Wave CVE-2025-12843 class). Fix: `Tie --cli` mode in main, then fuse off.
20. Opt-ins to revisit, each scoped and guarded: remote images per tile, `file://` links in terminals (open in Tie's viewer), OSC 52 write-only, raw HTML in markdown, popups for the browser tile (OAuth: today they go to the system browser).
21. Per-tile capabilities (shell without pty power): terminals as `<webview>`s with their own preload, not `nodeIntegrationInSubFrames`.
22. OS drag entering straight over a content frame goes to the frame (it can read dropped files; no way out but `openLink`). Mitigated: `body.os-drag` shield once the drag is over the shell; viewers refuse drops.
23. Gesture rule = frame focused, not a fresh user activation: once the user clicked into a frame, script in it may post gesture verbs until focus leaves (scripts can't focus the frame by themselves since 2026-10-17: Blink policy, `TILES.md`; they may re-focus it within Chromium's transient activation window after a click). Html pages do run scripts: mitigated by routing (confirm for the web with an armed Open button, one new tile per second). Option: transient activation on the UI side too (main can't see input routed into out-of-process frames; a trusted signal would need the viewer or a different mechanism).
24. Html root = the file's folder, recursively: a page opened from `~` or a repo root can read that whole subtree (dotfiles, `.env`); the only way out is a link the user opens (dialog shows the site and flags long links). Html is static since 2026-10-21 (no scripts: the page can't read anything), so this is about markdown images and the html document's own markup only. To discuss: html root stays the file's dir (wider = more exposure; `--root` would be agent-set); markdown root = caller's cwd when it contains the file (images `../img.png`), else the file's dir; `--root` for `tie open`.
25. Sandbox as a Tie feature (to discuss): Tie launches agents / commands in a sandbox (seatbelt profile, container) and brokers the socket; then per-tile tokens, ownership scoping and prompts (never / once / always) become the broker's policy rather than theatre. Research first: microsoft/mxc, `sandbox-exec` profiles as Claude Code and Codex use them, Apple Containerization, what agents expect.
26. Html: persistent storage per file (opt-in; today in memory, per open), range requests (media seeking), subfolder watch.

## Browser

27. Favicon as the tile icon (needs a fetch on the browser partition, never the shell's).
28. Search from the location bar (today: http(s) and bare hosts only).
29. `mailto:` and other OS handlers (today refused): confirm → system handler?
30. Find in page, zoom, devtools for a guest.
31. Hung page: today error + renderer killed (same-site guests too). Option: "wait / close" like Chrome.
32. Per-tile profiles / private mode (one shared `persist:browser` today).

## Harness

33. Guards without a scenario (fact-check 2026-10-21): frame message flood cap (1000/s), content frames can't download (`noDownloads` + no `allow-downloads`), html new-tile throttle (1/s), `confirmExternal` off path, guest `window.focus()` not moving the UI's focus (probed by hand only), Bluetooth / client-cert / device denials (no device in the harness).

34. Flake: `markdown-links` "b.md in the same tile" and `markdown-keys` "plain Down": under full-suite load the first click into a freshly loaded out-of-process frame is sometimes lost (no DOM event in the frame, no request). Standalone 6/6 green. Mitigation 2026-10-21: `h.clickIn` moves the pointer first and repeats the click once if the frame didn't take focus. Root cause (OOPIF surface not yet hit-testable?) unconfirmed.
35. Flake (1 in a full e2e run, 2026-10-17; 5/5 standalone green): `html` "cmd+R: reloaded, scroll kept" right after a sibling change that fired two live reloads (fs events) 300 ms apart. Suspected: the cmd+R reload hit the second page before its scroll restore. Not reproduced with back-to-back reloads; not fixed.
