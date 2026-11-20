# Pending

## Interface

1. Html dynamic pages: not supported (static only, decision 2026-10-21; option B of the security review). Revisit if real use needs sandboxed JS with no network; the alternative is a local server + browser tile.
2. Settings panel review: five pages (Appearance, Bindings, Terminal, Files, Security); structure, naming and scopes deserve a pass before more settings land.
3. Done 2026-11-18: key bindings editable in the settings panel (`SETTINGS.md` "Bindings page", record `2026-11-16-configurable-bindings.md`).
40. Bindings on non-US layouts: untested (key names come from Electron's `input.key`: letters, `+` as its own key, dead keys). Not pressing.
4. Exit dialog checkbox: restore tabs + layout on next launch. Variants and trade-offs to analyze first (terminal state, content tiles, scrollback).
5. Review feature, binding and menu discoverability.
42. Icon set for tabs: a default glyph per tab (none today unless the user sets one). Needed for icon-only tabs in narrow vertical bars (`2026-11-19-configurable-toolbars.md` D4).

## Alerts

6. Logs in the UI: comfortable access to the instance log (at least the always-on `[security]` lines), filter by tag, follow mode. Today: `tie-dev logs -f` / the file under `~/.config/tie/log/`.

7. New system: notifications floating in a corner of the board, by the toolbar. Title, body, x to close, swipe to close.
    - Ephemeral for now. Later maybe history.
    - First use: explain blocked actions the user may not understand (refused link scheme, denied permission, blocked navigation).

## Tiles

9. Done 2026-11-13: root = the context tile's cwd when it holds the file (`DIRECTORIES.md` 5, record `2026-11-13-content-roots.md`).
10. Markdown: scroll lost on back/forward to a file under another root (the frame reloads with a new token → top; same root: kept). A viewer reload already restores the last reported scroll (`scrolled`). Left: a per-path scroll map in the host (`fileview.ts`).
11. Markdown: outline, search (`MARKDOWN.md`: none by design so far).
12. Terminal block/box chars show row gaps (QR codes): DOM renderer uses font glyphs. Undecided whether to fix now; options in `2026-10-24-terminal-block-glyphs.md`.
39. Terminal images: sixel / iTerm inline images (`qr -render sixel`, `imgcat`) not rendered (no decoder). Needs `@xterm/addon-image` (0.9.0 stable, 0.10 beta); its worker + canvas need checking against the renderer choice (12) and `SECURITY.md` (payload caps). Independent of the glyph fix.

## CLI

14. `tie` resolution relies on PATH. macOS `path_helper` (login shells) moves Tie's `bin/` behind system dirs, so another `tie` earlier on PATH (e.g. the installed app's, from rc files) would win in a dev instance's shells (same socket, older CLI). Trusted for now; if it bites: `TIE_BIN` (absolute path of the matching CLI) + every `tie` re-execs `TIE_BIN` when it isn't it.

## Markdown

15. Change marks fade while the tile is shelved (the frame's `visibilityState` stays visible). Host should tell the viewer it's hidden.
16. Math: Temml researched (2026-10-15), ready if wanted.

## Security

17. `runAsNode` fuse on: CLI launcher runs Tie as Node. Signed binary usable as generic Node (Wave CVE-2025-12843 class). Fix: `Tie --cli` mode in main, then fuse off.
18. Opt-ins to revisit, each scoped and guarded: remote images per tile, `file://` links in terminals (open in Tie's viewer), OSC 52 write-only, raw HTML in markdown, popups for the browser tile (OAuth: today they go to the system browser, after the link-out confirm).
19. Per-tile capabilities (shell without pty power): terminals as `<webview>`s with their own preload, not `nodeIntegrationInSubFrames`.
20. OS drag entering straight over a content frame goes to the frame (it can read dropped files; no way out but `openLink`). Mitigated: `body.os-drag` shield once the drag is over the shell; viewers refuse drops.
21. Gesture rule = frame focused, not a fresh user activation: once the user clicked into a frame, script in it may post gesture verbs until focus leaves (scripts can't focus the frame by themselves: Blink policy, `SECURITY.md`; they may re-focus it within Chromium's transient activation window after a click). Today no untrusted script runs in a content frame (viewers are Tie's; html pages static, `SECURITY.md` "Html static"); matters again with html dynamic pages (1). Option: transient activation on the UI side too (main can't see input routed into out-of-process frames; a trusted signal would need the viewer or a different mechanism).
22. Done 2026-11-13: roots = the context cwd (html too), `--root` for file tiles, `/` asks (record `2026-11-13-content-roots.md`).
23. Sandbox as a Tie feature (to discuss): Tie launches agents / commands in a sandbox (seatbelt profile, container) and brokers the socket; then per-tile tokens, ownership scoping and prompts (never / once / always) become the broker's policy rather than theatre. Research first: microsoft/mxc, `sandbox-exec` profiles as Claude Code and Codex use them, Apple Containerization, what agents expect.
24. Html: persistent storage per file (opt-in; today in memory, per open), range requests (media seeking), subfolder watch.

## Browser

25. Favicon as the tile icon (needs a fetch on the browser partition, never the shell's).
26. Search from the location bar (today: http(s) and bare hosts only).
27. `mailto:` and other OS handlers (today refused): confirm → system handler?
28. Find in page, devtools for a guest.
29. Hung page: today error + renderer killed (same-site guests too). Option: "wait / close" like Chrome.
30. Per-tile profiles / private mode (one shared `persist:browser` today).

## Harness

31. Guards without a scenario: guest `window.focus()` not moving the UI's focus (probed by hand only); device choosers: Bluetooth, USB / HID / serial, client certificates (no device in the harness).

32. Flake: `markdown-links` "b.md in the same tile" and `markdown-nav` "plain Down": under full-suite load the first click into a freshly loaded out-of-process frame is sometimes lost (no DOM event in the frame, no request). Standalone 6/6 green. Mitigation: `h.clickIn` moves the pointer first and repeats the click once if the frame didn't take focus. Root cause (OOPIF surface not yet hit-testable?) unconfirmed.

## Directories

34. Done 2026-11-01: `docs/DIRECTORIES.md`, record `2026-10-30-working-directories.md` (cwd on every tile, inherited from the context tile).
35. TCC prompts (2026-10-30): every `tie-dev install` changes Tie.app's cdhash, invalidating its TCC records; the next `sec-browser-session` (mic) and picker walks into protected folders prompt again, and prompts can hide behind windows. Options: a stable signing identity (Developer ID or a self-signed certificate in the keychain: same code requirement across builds), or the harness launching from a plain terminal so prompts land on the dev Electron.app. HARNESS.md "macOS permission prompts". May no longer apply to harness runs from a Tie terminal (37).

## Layout

38. Shelf reveal (hover preview of a shelved tile) resizable, like a float (edge / corner handles), size remembered per tile; today fixed at 30% × 50% of the board (`revealSize()`, `SHELF.md`).

36. Zoom (tile expansion): animate the expansion. Evaluate: activating a squashed bar moves the zoom there (accordion) instead of unzooming (today only its zoom button does, `LAYOUT.md` "Zoom").

41. Closing a tile: if all its siblings have the same size along the split, share the freed space equally among them (never resized = the user means equal sizes). Today the freed space goes to the donor (the sibling it split from) when there is one, else to all siblings in proportion (`core/layout.ts` `remove`).

## Docs

37. Verify documentation claims against behaviour, periodically (agent pass over the guides, each claim checked in code / harness). Known suspect: TCC attribution of instances launched from a Tie terminal (`HARNESS.md` "macOS permission prompts"): shells spawn disclaimed, the responsible process is the shell (`sec-disclaim`); which app a real prompt names needs a real prompt to check.
