# Topic

"Content did not load" on files opened by agents (`tie add <file>`), while the same command typed by the user works.

# Settled

- Cause: viewers sent `ready` only after two `requestAnimationFrame`; Chromium runs no rAF in a frame that isn't painting; host fails the tile with no `ready` in 5 s (`frame.ts` `READY_MS`).
- Fix (option 2 below): `ready` on two rAFs or a 250 ms timer, whichever first, sent once. `viewers/runtime.ts` (`READY_FALLBACK_MS`), `viewers/html-bootstrap.ts`.
- Scenario `content-hidden`: tile hidden at frame `load` (image, markdown, html) still gets ready, no error past 5 s. Fails without the fix.
- `content-paint` (no white first paint) still passes.

# Pending

- Hidden / covered window case: assumed, never reproduced. Watch whether the error repeats in real use.
- If it repeats: see "If it repeats".

# Research

- Agent's command (from its transcript): `tie add out/station-kit/side_by_side.png --title "…"`. Nothing special.
- Harness, before the fix:

| Case | Result |
|---|---|
| Tile opened, tab switched before the handshake ends (tile `display: none`) | error after 5 s |
| Tile hidden at frame `load` (scenario) | error after 5 s |
| Opened `--shelved` (`visibility: hidden`) | loads |
| Opened into a background tab (`display: none` from creation) | loads |
| Window hidden, covered, minimized, other macOS Space | not tested |

- Why "not tested": harness instances run with `backgroundThrottling` off (`main/index.ts`), the real app with it on. A temporary knob to turn it on was not run.
- Guess for the reported case: user in another app while the agent runs `tie add`; window not painting; no rAF. Fits "works when I do it". Unconfirmed.
- Timers in a hidden window: throttled to about one per second, so the 250 ms fallback may land near 1 s. Still under 5 s.

# Options considered

1. Host pauses its ready timer while the window or tile isn't painting. Keeps the paint guarantee; two conditions to track, a miss = same bug.
2. Viewer timer fallback. Chosen: smallest, no state. Risk: a tile shown exactly when the fallback fires may flash white once (no painted frame yet); not observed.
3. Both.

# If it repeats

- First: `TIE_DEBUG=content,security` on the instance, reproduce, read `~/.config/tie/log/<instance>.log`; note whether the window was visible and which tab the caller's terminal was in.
- Harness knob `TIE_THROTTLE=1` (`backgroundThrottling` on in a harness instance, with `hiddenWindow`): one line in `main/index.ts`; then a scenario for the hidden-window case.
- Then option 1 as a second layer: `READY_MS` counts only while `document.visibilityState === 'visible'` and the tile is displayed.
- Other suspects if the handshake is not it: frame `load` never firing (`tie:init` never posted), viewer process start slower than 5 s under load.
