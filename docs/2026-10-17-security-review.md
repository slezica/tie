# 2026-10-17 Security review

Full pass over Tie's security seams: code read (main, core, preload, frame host, kinds, viewers, packaging), Electron defaults checked, harness probes for focus and input routing. Rich report with every issue (where, threat model, exploit, impact, why it stays): `docs/2026-10-17-security-report.html` (open it in Tie: `tie open docs/2026-10-17-security-report.html`).

# Settled

## Fixed

- Focus grab: content frames could `window.focus()` themselves and pass the gesture rule (dialog with no click; keyboard taken from a terminal). Fix: Blink permissions policy `focus-without-user-activation 'none'` on every content iframe + `BlockingFocusWithoutUserActivation` enabled in main. `sec-focus`.
  - Rejected: a shell-side guard fed by main's `input-event`. Main only observes input to the main frame; clicks routed into out-of-process frames never reach it (Electron 44 source: observers attach to the primary main frame's widget only). Such a guard rejected real clicks.
  - Harness lesson: Playwright `evaluate` carries a user gesture (CDP `userGesture`); gesture-less script behaviour must come from the page's own timers.
- Content protocol read every root file whole into main (no cap): streamed now; html documents of a root refused above the kind's cap. `sec-html`.
- Browser guests: Web Bluetooth chooser cancelled (Electron picked the first device); client certificates refused (Electron sent the first one); downloads only within 10 s of real input in that guest. `sec-browser`, unit.
- State dir 0700, sockets / info / logs / settings 0600 (older files fixed up at start); socket request lines capped at 1 MB. `sec-state`.
- External-open dialog: Open disabled 600 ms (click-through), site address in bold, long links (> 200 chars after the origin) called out. `sec-focus`.
- Frame message flood: > 1000/s dropped unparsed.

## Batch 2 (2026-10-20): deceptive tiles

- Reframed with the user: processes in shells (agents) are a known concern, not Tie's to solve. Content tiles that look passive but aren't are the concern.
- Html tiles open static by default (`htmlScripts` setting): document CSP `script-src 'nonce-<response>'` (bootstrap only); title-bar pill "Scripts: off/on" reloads under a new token; remembered per file for the session. `html-scripts`.
- Every link out goes through one confirm (`renderer/external.ts`, setting `confirmExternal`): html, markdown, terminal cmd-click. `sec-links`, `markdown-links`, `sec-markdown`.
- `title` verb removed: html tiles are titled by file name.
- Link strip (`Host.hint`): hovered link's real target bottom-left of the tile, shell-drawn; terminal, viewers (`hover` verb), browser guests.
- Rejected: wider html root via cwd / `--root` (wider = more exposure, agent-set). Markdown root widening: to discuss (PENDING).

## Flagged, kept (decisions for the user; details in the report)

- Socket = full power for any process that can reach it (sandboxed agents inherit `TIE_SOCKET`). Decision 2026-10-19: known, not Tie's to solve; revisit only if Tie itself sandboxes agents (PENDING).
- Html root = the page's folder, recursively (home / repo root exposes the subtree; exit only via a confirmed link).
- Gesture rule = focused, not just clicked (scripts may post verbs while focused; refocus within Chromium's transient activation window).
- Downloads after one click: up to 10 s of silent saves.
- `runAsNode` fuse (packaged), CDP port in dev builds, impersonable titles, one shared browser profile.

# Pending

- Options per flagged item: see the report's "Open by design" and `docs/PENDING.md` (Security, Browser).
- Markdown/text file views: add the html tile's routing (confirm for the web, one new tile per second) as defense in depth against a viewer XSS.
