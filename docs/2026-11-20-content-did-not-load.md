# Topic

"Content did not load" on files opened by agents (`tie add <file>`), while the same command typed by the user works.

# Settled

- Cause: viewers sent `ready` only after two `requestAnimationFrame`; Chromium runs no rAF in a frame that isn't painting; host fails the tile with no `ready` in 5 s (`frame.ts` `READY_MS`).
- Reported case: agent runs `tie add` while the user is in another app; window hidden, no rAF. Reproduced in the harness (same error text).
- Fix (option 2 below): `ready` on two rAFs or a 250 ms timer, whichever first, sent once. `viewers/runtime.ts` (`READY_FALLBACK_MS`), `viewers/html-bootstrap.ts`.
- Scenarios, both red without the timer, green with it (image, markdown, html):
  - `content-hidden-window`: files opened while the window is hidden and throttled.
  - `content-hidden`: tile hidden at frame `load`, visible window.
- Harness additions: `TIE_THROTTLE=1` (throttling on), dev socket `window-hide` / `window-state`, `h.hideWindow`, `ctx.detach()` / `ctx.attach()` (`HARNESS.md`).
- `content-paint` (no white first paint) still passes.

# Pending

- Real use: watch whether the error repeats (installed app needs `tie-dev install`).
- Covered (not hidden) window, minimized, other macOS Space: not tested separately; assumed the same as hidden.

# Research

- Agent's command (from its transcript): `tie add out/station-kit/side_by_side.png --title "…"`. Nothing special.
- Harness, before the fix:

| Case | Result |
|---|---|
| Window hidden and throttled, file opened | error after 5 s |
| Tile opened, tab switched before the handshake ends (tile `display: none`) | error after 5 s |
| Tile hidden at frame `load` (scenario) | error after 5 s |
| Opened `--shelved` (`visibility: hidden`) | loads |
| Opened into a background tab (`display: none` from creation) | loads |

- Hiding a harness window, findings:
  - A never-shown window (`show: false`) counts as visible: 60 fps, even with `backgroundThrottling` on and `paintWhenInitiallyHidden: false`.
  - Shown once (opacity 0, inactive), then hidden 300 ms later: page `hidden`, 0 frames. Hidden in the same turn as shown: no effect.
  - Playwright attached: page stays `visible` at 60 fps whatever the window does. Turning off `Emulation.setFocusEmulationEnabled` from another session: no effect. Detached: hidden. So the scenario detaches, works over the socket, attaches to look.
- Timers in a hidden window: throttled to about one per second, so the 250 ms fallback may land near 1 s. Still under 5 s.

# Options considered

1. Host pauses its ready timer while the window or tile isn't painting. Keeps the paint guarantee; two conditions to track, a miss = same bug.
2. Viewer timer fallback. Chosen: smallest, no state. Risk: a tile shown exactly when the fallback fires may flash white once (no painted frame yet); not observed.
3. Both.

# If it repeats

- First: `TIE_DEBUG=content,security` on the instance, reproduce, read `~/.config/tie/log/<instance>.log`; note whether the window was visible and which tab the caller's terminal was in.
- Then option 1 as a second layer: `READY_MS` counts only while `document.visibilityState === 'visible'` and the tile is displayed.
- Other suspects if the handshake is not it: frame `load` never firing (`tie:init` never posted), viewer process start slower than 5 s under load, a window hidden for long (Chromium's intensive timer throttling after 5 min; should not apply to a first timer).
