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

## Batch 3 (2026-10-21)

- Rename: the UI renderer is "UI", not "shell" (`uiIpc`, `UI_URL`, `UI_PARTITION` = `tie-ui`, `isUiSender`, `uiUrl`; docs, scenarios). "Shell" means login shell only.
- Html static only (option B): scripts never run (CSP nonce = bootstrap only; no workers); `htmlScripts` setting and the pill toggle removed; a red, non-interactive "Scripts blocked" tag when a page had scripts (bootstrap counts `script-src` violations → `blocked` verb). Dynamic pages: local server + browser tile. `html-static`.
- Downloads: every one asks (`.dialog.save-download`: name, size, site; Save disabled 600 ms); `will-download` refuses, UI asks, Save allows the URL once and the guest downloads again. Input-window rule removed. `sec-browser`.
- Fact-check of the explainer (Opus agent): 9 wrong, 11 imprecise claims, fixed; guards without scenarios listed in PENDING.
- Decided: `TIE_TOKEN` per tile is identity/scoping plumbing, not security (any process of the user can read a shell's env); deferred until a scoping feature needs it.

## Batch 4 (2026-10-21, later): fact-check items as design changes

- Security log always on; values that aren't Tie's marked `<untrusted>…</untrusted>` and escaped (`core/log.ts`); harness `appLog` plain / `rawLog` raw. `sec-log`.
- Socket caller identity by kernel lineage (`native/peer`, `core/callers.ts`); `allowExternalControl` default off; Security settings page. `sec-socket`, `sec-socket-external`. Harness and package smoke use a mock keychain (the Keychain prompt was Electron's cookie-encryption key, once per ad-hoc build).
- Browser popups: through the link-out confirm, no input timer. Electron has no popup blocker: gesture-less `window.open` gets the dialog too (one at a time).
- Html page navigating away: error at once naming the target; no reload retries.
- Links to files outside the document's folder (markdown, html): confirm with the full path first.
- Principle restated by the user: simple and predictable until proven bothersome in practice; no timing heuristics.

## Flagged, kept (decisions for the user; details in the report)

- Socket = full power for any process that can reach it (sandboxed agents inherit `TIE_SOCKET`). Decision 2026-10-19: known, not Tie's to solve; revisit only if Tie itself sandboxes agents (PENDING).
- Html root = the page's folder, recursively (home / repo root exposes the subtree; exit only via a confirmed link).
- Gesture rule = focused, not just clicked (scripts may post verbs while focused; refocus within Chromium's transient activation window).
- `runAsNode` fuse (packaged), CDP port in dev builds, impersonable titles, one shared browser profile.

# Pending

- Options per flagged item: see the report's "Open by design" and `docs/PENDING.md` (Security, Browser).
- Markdown/text file views: add the html tile's routing (confirm for the web, one new tile per second) as defense in depth against a viewer XSS.
