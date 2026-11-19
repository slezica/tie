# Engine

What Tie assumes about Chromium, Electron, its libraries and macOS. On a dependency upgrade: re-check the rows of that dependency whose evidence isn't `scenario`.

## Pinned

| Dependency | Version | Pinned in |
|---|---|---|
| Electron | 44.10.0 (Chromium 152.0.7977.169, Node v24.22.1) | `package.json` (exact); Chromium / Node: Electron `DEPS` at `v44.10.0` |
| `@xterm/xterm` + `@xterm/addon-fit` | 6.0.0 + 0.11.0 | `package.json` |
| `node-pty` | 1.1.0 + `patches/node-pty+1.1.0.patch` | `package.json`, `patch-package` |
| `tie-peer` (`native/peer`) | local; libproc, `getsockopt` | `package.json` (`file:`) |
| markdown-it (+ deflist 4.0.0, emoji 3.1.0, footnote 4.0.0) | 15.0.2 | `package.json` |
| DOMPurify | 3.4.17 | `package.json` |
| morphdom | 2.7.8 | `package.json` |
| highlight.js | 11.12.0 | `package.json` |
| `@mermaid-js/tiny` | 12.2.0 | `package.json` |
| Playwright | 1.63.0 | `package.json` |
| macOS | arm64; checked on 26.6 | — |

## Upgrade checklist

1. Electron: `tie-dev electron-check`. Bump with `npm install --save-exact <pkg>@X`.
2. node-pty: rename the patch to the new version; `postinstall` must apply it (a hunk that no longer applies fails the install).
3. `tie-dev typecheck`, `test --unit`, full `test --e2e`, `check-package`, `check-install`.
4. Walk this guide's rows for the upgraded dependency whose evidence isn't `scenario`: re-read the cited file at the new tag.
5. Update "Pinned" and the cited tags.

Evidence: `scenario` (the named check fails if the assumption breaks), `source` (file read at the pinned tag), `docs`, `by hand` (observed, not asserted), `none`. Several: strongest first.

Security rows with their own guard and test live in `SECURITY.md` "Guards"; here only the engine side.

## Chromium (152.0.7977.169)

| Assumption | Used by | Evidence | If false | Re-check on |
|---|---|---|---|---|
| A key-down blocked in `before-input-event` loses its key-up and char: neither the page nor `before-input-event` sees them (Escape key-up excepted) | `decideKey` capture mode passes bare modifiers (`INPUT.md` "Capture fields") | source: `content/browser/renderer_host/render_widget_host_impl.cc` `suppress_events_until_keydown_` (Electron emits `before-input-event` from `PreHandleKeyboardEvent`, after that check) | The pass-through becomes unneeded; nothing breaks | Electron major |
| Frames can't focus themselves without transient activation: runtime feature `BlockingFocusWithoutUserActivation` (status `experimental`: on only via `--enable-blink-features`) + permissions policy `focus-without-user-activation 'none'`. Still allowed: a user-gesture trigger, an initiator with transient activation, focus already inside the initiator | `frame.ts` `allow`, `main/index.ts` switch; gesture rule (`SECURITY.md`) | scenario `sec-focus` (mutation: feature off → red); source `third_party/blink/renderer/core/dom/document.cc` (focus check), `platform/runtime_enabled_features.json5` | security: a frame takes focus, passes the gesture rule, takes the keyboard. A renamed / removed feature is ignored silently by the switch | Electron major |
| Autofocus never fires in a cross-origin subframe (nor in a sandboxed frame without `allow-scripts`) | no guard of ours (`TILES.md`): an html page's `autofocus` attribute needs no script | source: `third_party/blink/renderer/core/dom/element.cc` ("Blocked autofocusing … cross-origin subframe") | security: an html page takes focus at load (keyboard off the terminal) | Electron major |
| After a layout, Blink sends a synthetic mouse move at the last pointer position (only while the window is active; not during drags, pointer lock, hidden cursor): an element appearing under a still pointer gets `pointerenter` | shelf: a new item under the pointer is revealed (`SHELF.md`); `shelf.mjs` moves the pointer away first | source: `third_party/blink/renderer/core/input/mouse_event_manager.cc` `RecomputeMouseHoverStateIfNeeded`; by hand (`shelf.mjs` comment) | Cosmetic: reveal waits for the next move | Electron major |
| Redirects to `file:`, `about:`, `data:`, `blob:`, `filesystem:`, WebUI are refused before any navigation throttle (`will-redirect`). `tie:`, `mailto:`, custom schemes: also refused before it (observed), mechanism not traced | `guardGuest` / `guard()` `will-redirect`: no harness path reaches them (`SECURITY.md`) | source: `content/public/common/url_utils.cc` `IsSafeRedirectTarget`, `content/browser/loader/navigation_url_loader_impl.cc`; by hand (`sec-browser-nav`: tried `file:`, `tie:`, `mailto:`, custom, `data:`, `about:`, `javascript:`, `chrome:`) | Our guard becomes reachable (still refuses); the scenario could then assert its log | Electron major |
| Each content frame runs in its own process (opaque viewer frames, html token origins) | `killContent`, watchdog, isolation (`TILES.md`) | scenario `sec-content-escape` (`outOfProcess`), `content-watchdog` (separate pids) | security: a frame sharing the UI's process; a hung frame freezes the UI | Electron major |
| Sandbox flags hold: no `allow-popups` → `window.open` returns null; no top navigation, forms, modals, downloads | policy rows, `frame.ts` | scenario `sec-content-escape` (mutations: `+ allow-popups`, `+ allow-top-navigation` → red) | security | Electron major |
| Proxy rule `<-loopback>` removes the implicit loopback bypass; WebRTC `disable_non_proxied_udp` keeps it off direct UDP; no enforced CSP directive covers WebRTC | `noNetwork`, `noWebRtcUdp` | scenario `sec-html` (STUN / TURN probes, red first), `sec-browser-session` (`resolveProxy`); docs `net/docs/proxy.md` | security: html pages reach loopback / the network | Electron major |
| Page visibility is per top-level page: a frame hidden by CSS (shelved tile) still reports `visibilityState === 'visible'` | change marks fade (`marks.ts` `visible()`); `MARKDOWN.md` "Limitations" | docs: WHATWG HTML "page visibility" (the top-level traversable's state) | Limitation gone: marks wait while shelved | Electron major |
| `unresponsive` comes from an input-event ack timeout (plus unload timeouts): a busy page with no input pending never fires it | guest hang → error (`BROWSER.md`); no harness test (`SECURITY.md` row "Guest crash") | source: `render_widget_host_impl.cc` `OnInputEventAckTimeout` → `RendererIsUnresponsive` | — (explains the missing test) | Electron major |
| A frame paused in DevTools runs no tasks: no `pong`, so > 5 s paused = hung, frame killed | watchdog (`TILES.md`) | none | Dev only | — |
| `beforeunload` prompts only after a user activation | `BROWSER.md` "Leaving a page" | none (harness can't cover it: `BROWSER.md`) | More prompts, same dialog | Electron major |
| Zoom levels are per origin (HostZoomMap): another tile on the same site would share it | browser zoom re-applied on every `did-navigate` | docs: Electron `web-contents.md` `setZoomFactor` note | Re-apply becomes a no-op | Electron major |
| `<meta charset>` is found only in the first 1024 bytes (prescan) | html: header charset from `htmlCharset` (bootstrap may push the meta past it) | docs: WHATWG HTML "prescan a byte stream to determine its encoding" | — | — |
| Media elements seek by range requests; `tie-content` answers 200 with `Content-Length`, no `Range` | `VIEWERS.md` "Limitations" | none | Seeking works | — |
| Layout coordinates: `LayoutUnit` = int32 with 6 fractional bits (≈ 33.5 M px max) | hex viewer `MAX_PX` 16 M | source: `third_party/blink/renderer/platform/geometry/layout_unit.h` | Rows past the limit unreachable | Electron major |
| Over a window drag region (`-webkit-app-region: drag`) macOS owns the pointer: Chromium reports leaving the document | shelf reveal zone check (`SHELF.md`) | by hand | Reveal dismissal simpler | Electron major |
| On macOS a modifier's own key-up may still report its flag held | `captured()` (`core/keymap.ts`) | by hand | — | Electron major |

## Electron (44.10.0)

| Assumption | Used by | Evidence | If false | Re-check on |
|---|---|---|---|---|
| Every permission is granted unless a handler denies | `harden` (`session-created`: request, check, device handlers) | scenario `sec-permissions`, `sec-browser-session`; docs `docs/tutorial/security.md` | — (we deny anyway) | Electron major |
| `before-input-event` fires for key-down and key-up before the page and menu accelerators; `preventDefault` blocks both; synthetic DOM events never reach it | `main/keys.ts`, `decideKey` | scenario `sec-keys`, `keys`; docs `web-contents.md`; source `shell/browser/api/electron_api_web_contents.cc` `PreHandleKeyboardEvent` | security: content sees / swallows shortcuts | Electron major |
| A guest's keys reach only its own `before-input-event` | `watchKeys` per guest | scenario `browser` (mutation: not attached → red) | Shortcuts dead in guests | Electron major |
| `MessagePort` `close` event: Chromium ships it as `test` only; Electron enables it in every renderer | watchdog crash detection (`frame.ts` `onclose`) | scenario `content-watchdog` (crash → "Viewer crashed"); source `shell/renderer/renderer_client_base.cc` `RenderThreadStarted`, Chromium `runtime_enabled_features.json5`, `core/messaging/message_port.cc` | Crashed frames show no error; documents' navigations misread | Electron major (Chromium may ship or drop it) |
| No popup blocker: `CanCreateWindow` lets a webContents open unless its prefs set `disablePopups` (a `<webview>` without `allowpopups`). `attachGuest` rebuilds prefs without it, so every `window.open` (gesture or not) reaches `setWindowOpenHandler` | guest popups → link-out confirm (`BROWSER.md`) | scenario `sec-browser-popups` (gesture-less popup: the dialog); source `shell/browser/electron_browser_client.cc` `CanCreateWindow`, `lib/browser/guest-view-manager.ts` (`disablePopups: !params.allowpopups`) | Popups return null silently (safe; scenario red) | Electron major |
| `will-frame-navigate` covers main frame and subframes, not loads started by `loadURL` / `src` / history | `guard()`, `guardGuest` (+ `did-start-navigation` stop) | scenario `sec-navigate`, `sec-content-nav`, `sec-browser-nav` (mutation → `file:///etc/hosts` loaded) | security | Electron major |
| `<webview>` is set up only in main frames: content frames can't create guests | `attachGuest` embedder check never reached (`SECURITY.md`) | scenario `sec-browser-nav` (outcome: no guest from a frame); layer by hand | Our `fromUi` check refuses (second layer) | Electron major |
| Protocol handlers are per session: `tie:` / `tie-content:` exist on the UI session only | browser partition (`BROWSER.md` "Partition") | docs `docs/api/protocol.md`; scenario `sec-browser-nav` (outcome; our navigation guard refuses first) | security (second layer) | Electron major |
| A partition without `persist:` is in memory | `UI_PARTITION` (`sec-storage`) | scenario `sec-storage`; docs `session.md` | security: content storage on disk | Electron major |
| `select-client-certificate`: default sends the first certificate in the store | `harden` prevents | docs `app.md` | — | Electron major |
| `select-bluetooth-device`: a listener that doesn't prevent → first device picked; no listener → every request cancelled | `noDeviceChoosers` prevents + cancels | docs `web-contents.md` | — (`SECURITY.md` row "Device choosers" and the `main/guest.ts` comment say "default picks the first": only with a listener) | Electron major |
| `webContents.close({waitForBeforeUnload: true})` on a guest destroys it even when the page holds the unload (docs say it isn't closed) | `unloadGuest` loads `about:blank` instead | by hand | Simpler close path possible | Electron major / minor |
| `stop()` inside `did-start-navigation` crashes Electron | `guardGuest` defers it | by hand | — | Electron major |
| `setBackgroundColor` on a guest hangs the attach in a real window | `renderer/guest.ts` (not used) | by hand | — | Electron major |
| No pinch zoom for `<webview>` guests (`setVisualZoomLevelLimits` no-op, no gesture events) | `BROWSER.md` "Limitations" | by hand | Feature possible | Electron major |
| `forcefullyCrashRenderer` on a hung guest also kills same-site guests sharing its process | `BROWSER.md` | by hand | — | Electron major |
| SIGTERM / SIGINT → graceful quit (`before-quit`), Node never sees them; a second signal exits | quit flow (`ARCHITECTURE.md` "Quit") | source `shell/browser/electron_browser_main_parts_posix.cc` | Signals kill Tie without the question | Electron major |
| `file://` pages get extra privileges unless fuse `grantFileProtocolExtraPrivileges` is off | UI on `tie://app/`; fuse off in packages | docs `docs/tutorial/fuses.md`; `tie-dev check-package` | security | Electron major |
| Fuses | `electron-builder.yml` | `SECURITY.md` "Fuses"; `tie-dev check-package` | security | Electron major |

## xterm.js (6.0.0) + fit addon (0.11.0)

| Assumption | Used by | Evidence | If false | Re-check on |
|---|---|---|---|---|
| DOM renderer width cache measures with integer `offsetWidth / 32`; private shape `_core._renderService._renderer.value._widthCache` (prototype `_measure`, `_measureElements`), `handleCharSizeChanged` | `fixWidthCache` (`TERMINALS.md` "Size") | scenario `terminal-fit`; source `src/browser/renderer/dom/WidthCache.ts`. Upstream master: canvas `measureText` (6.1.0 betas) | Shape changed: fix skipped (debug line), last column cut | xterm any; drop on ≥ 6.1 |
| Linkifier caches the last hovered line (`_core.linkifier._activeLine`, `_currentLink`) even after its text changed | `fixLinkCache` | scenario `sec-links` (stale link case); source `src/browser/Linkifier.ts` `_handleHover`. Upstream master: unchanged (still needed on 6.1) | security: hover / cmd-click act on a link no longer on screen | xterm any |
| Printable keydowns are cancelled except A-Z (`CoreBrowserTerminal.ts` "HACK: Process A-Z", left to `keypress`) | press-and-hold off (`TERMINALS.md` "Keys") | source `src/browser/CoreBrowserTerminal.ts` `_keyDown` | Accent picker fix maybe unneeded | xterm any |
| Fit addon: private `_core._renderService.dimensions`; available width = parent's computed `width` (border box: `box-sizing: border-box`) − `.xterm` padding − 14 px scrollbar (`DEFAULT_SCROLL_BAR_WIDTH`, unless `scrollback: 0`) | `fitTerm`, `.xterm` padding rule | scenario `terminal-fit`; source `addon-fit/src/FitAddon.ts`, `src/browser/shared/Constants.ts` | Wrong grid, cut rows | xterm / fit any |
| `letterSpacing` is rounded in device px (`device.char.width + Math.round(letterSpacing)`) | char width setting (`SETTINGS.md` "Fonts") | source `src/browser/renderer/dom/DomRenderer.ts` | Char width steps off | xterm any |

## node-pty (1.1.0)

| Assumption | Used by | Evidence | If false | Re-check on |
|---|---|---|---|---|
| The macOS spawn path is `pty_posix_spawn` in `src/unix/pty.cc` with a local `posix_spawnattr_t attrs` | `patches/node-pty+1.1.0.patch` (disclaim) | scenario `sec-disclaim`; `patch-package` fails on a changed hunk | security: terminal children prompt as Tie | node-pty any |
| `kill()` sends SIGHUP to the shell pid only; the shell hangs up its jobs; the kernel hangs up the session when the master closes at exit | close, `killAll` (SIGKILL after 1.5 s) | scenario `close-busy` (busy command killed with its tab), `quit` (HUP-trapping tile: only `killAll` ends it); source `lib/unixTerminal.js` | Leaked processes | node-pty any, macOS |
| Callbacks into a torn-down JS env (quit with live ptys), or a throw inside a callback, abort the process | `killAll` before exit; never throw in callbacks | by hand (`2026-10-09-electron-crash-on-quit.md`) | — | node-pty any, Electron major |
| `spawn-helper` and the native module must be real files (unpacked from asar) | `electron-builder.yml` | by hand (`PACKAGING.md` "Bundle") | Terminals fail in packages | node-pty any |

## Markdown pipeline (markdown-it 15.0.2, DOMPurify 3.4.17, morphdom 2.7.8)

| Assumption | Used by | Evidence | If false | Re-check on |
|---|---|---|---|---|
| `html: false` turns off `html_block` and `html_inline`: raw HTML stays text | `viewers/markdown.ts` | scenario `sec-markdown` (raw HTML, front matter, footnotes as text); source `dist/markdown-it.cjs.js` | security (DOMPurify still behind it) | markdown-it any (plugins too) |
| `validateLink` refuses `javascript:`, `vbscript:`, `file:`, `data:` (except `data:image/(gif\|png\|jpeg\|webp)`) | links, images | source `dist/markdown-it.cjs.js` `BAD_PROTO_RE` | DOMPurify's URI rule behind it | markdown-it any |
| DOMPurify default drops scripts and handlers; `SANITIZE_NAMED_PROPS` prefixes ids / names `user-content-`; `ALLOWED_URI_REGEXP` binds URIs, except `data:` on `DATA_URI_TAGS` (`img` …), which stays | `sanitize`, `sanitizeSvg` | scenario `sec-markdown` ("DOMPurify active", prefix), `markdown`; source `src/purify.ts`. `data:` images: the viewer's placeholder rule + CSP `img-src` own token | security: markup from a document in the viewer realm | DOMPurify any |
| morphdom parses only a string target; given an element it moves / copies nodes, never parses | `live.ts` (`SECURITY` comment) | source `src/morphdom.js` | security: only if `live.ts` ever passed strings | morphdom any |

## Mermaid (`@mermaid-js/tiny` 12.2.0)

| Assumption | Used by | Evidence | If false | Re-check on |
|---|---|---|---|---|
| `secure` keys of the site config, and any `__` key, are deleted from `%%{init}%%` directives; `securityLevel: 'strict'`, `htmlLabels: false` hold | `viewers/mermaid.ts` | scenario `sec-mermaid` (init overrides refused, config asserted); source `dist/mermaid.tiny.js` (minified: `sanitizeDirective`) | security (output DOMPurify behind it) | Mermaid any |
| Base theme `dropShadow` defaults to `rgba(185,185,185,1)`; `themeVariables.dropShadow` would override it | "neo" shadows gray (`MARKDOWN.md` "Limitations") | source `dist/mermaid.tiny.js` (base theme `calculate`) | — | Mermaid any |
| Copied as is to `out/viewers/markdown-mermaid.js`, global `mermaid` | `viewerFile`, `mermaid.ts` | scenario `markdown-mermaid`; `check-package` (diagram served) | Diagrams fail | Mermaid any |

## macOS

| Assumption | Used by | Evidence | If false | Re-check on |
|---|---|---|---|---|
| `responsibility_spawnattrs_setdisclaim(&attrs, 1)` (private libSystem) makes the child its own TCC responsible process; same call as Chromium | node-pty patch (`TERMINALS.md` "Spawn") | scenario `sec-disclaim` (red first); source Chromium `base/process/launch_mac.cc` | security: children's grants are Tie's | macOS major |
| Which app a real TCC prompt then names | `HARNESS.md` "macOS permission prompts" | none (`PENDING.md` 37) | — | macOS major |
| Other terminals disclaim too | `TERMINALS.md` "Spawn" (rationale only) | none: not in Ghostty `src/termio/Exec.zig` or WezTerm `pty/src/unix.rs` (main); iTerm2: a setting "Disclaim ownership of children" (web search, not source) | — | — |
| Socket peer: `LOCAL_PEERPID`, `LOCAL_PEERCRED` on the fd; Node's private `net.Socket._handle.fd` exposes it (absent: every caller external, fail-closed) | `socket.ts`, `native/peer` | scenario `sec-socket`, `sec-socket-external` (terminal allowed) | Tile callers refused (fail-closed) | macOS major, Electron major (Node) |
| `proc_listchildpids` returns a count of pids (libproc divides `proc_listpids` bytes), direct children only (`PROC_PPID_ONLY`); `proc_pidinfo` `PROC_PIDTBSDINFO` gives the ppid | busy terminals, lineage | scenario `close-busy`, `sec-busy`, `sec-socket`; source xnu `libsyscall/wrappers/libproc/libproc.c` (main) | Busy misread; lineage broken | macOS major |
| Shell plugins that keep a child (async prompt workers) make a shell always busy | `TERMINALS.md` "Busy" | none | — | — |
| `-ApplePersistenceIgnoreState YES` skips the "reopen windows?" prompt that blocks launch after a crash | `tie-dev start`, fresh instances | by hand (`2026-10-09-electron-crash-on-quit.md`) | Harness launches hang after crashes | macOS major |
| `ApplePressAndHoldEnabled` in the registration domain turns the accent picker off; the app domain beats it | `main/index.ts` | scenario `keys` (registration only); picker by hand | Held keys show the picker | macOS major |
| An ad-hoc signature is a new identity per build: Keychain "Tie Safe Storage" asks again; TCC grants stop matching; `use-mock-keychain` avoids the Keychain | `PACKAGING.md` "Signing", `HARNESS.md` | by hand | — | macOS major |
| Alt composes characters (`Alt+D` → `∂`); `input.code` names the physical key | chords (`INPUT.md`) | scenario `settings-bindings` (Alt+A seen as `KeyA`) | Alt chords misnamed | macOS, Electron major |
| FSEvents misses changes right after a watch starts | backstop poll (`MARKDOWN.md` "Watching") | by hand | — | macOS major |
| A read under a TCC-protected folder can block until the prompt is answered (holds a libuv thread) | picker walk fences (`main/walk.ts`) | by hand (`2026-10-30-file-picker.md` "Research") | — | macOS major |

## Harness (Playwright 1.63.0, CDP)

| Assumption | Used by | Evidence | If false | Re-check on |
|---|---|---|---|---|
| `evaluate` runs with a user gesture (`Runtime.callFunctionOn` `userGesture: true`) | gesture-less checks from page timers (`sec-focus`, popups) | source `playwright-core/lib/coreBundle.js` | Gesture-dependent checks need rethinking | Playwright any |
| `sendInputEvent` keys pass `before-input-event`; CDP keys skip it | `h.press` / `keyDown` / `keyUp` vs `ctx.page.keyboard` | scenario `keys`, `sec-keys` (positive control) | Shortcut scenarios fail | Electron, Playwright |
| Offscreen rendering never routes input into content frames | `hiddenWindow` scenarios | by hand | — | Electron major |
| Playwright auto-attaches to `<webview>` guests and answers their dialogs (crash) | `browser-unload` no-op `dialog` listener | by hand | — | Playwright any |
| CDP `Page.crash` on a frame's own target kills that renderer | `content-watchdog` | scenario `content-watchdog` | — | Playwright, Electron |

## Worth a probe scenario

Rows above with evidence `source` / `docs` / `none` that a cheap scenario could make self-checking.

- Key-up drop: bound chord via `h.press`; a UI `keyup` listener (capture) records nothing for its key.
- Autofocus: html page with `<input autofocus>`; focus stays on the terminal (`h.focused`), the page's input is not `activeElement`.
- Hover after layout (`hiddenWindow`): pointer parked on the strip's left slot, `tie add --shelved`; the new item is revealed.
- Redirect layer: guest redirect to `tie:` / `mailto:`; assert the failure is Chromium's (no `blocked guest redirect` log, guest URL unchanged); flips when our guard becomes reachable.
- Page visibility: shelved markdown tile; its frame's `document.visibilityState` is `'visible'`.
- `unresponsive`: guest busy loop + `h.guestKey` (input pending) → "Page stopped responding" (closes the hang gap in `SECURITY.md`).
- DevTools pause: CDP `Debugger.pause` on a viewer frame's target → "Viewer stopped responding" after ~5 s.
- `beforeunload` activation: guest page installs the handler from its own timer, no click; close asks nothing.
- Media range: html page with an `<audio>` / `<video>`; set `currentTime` past the buffer, check `seeked` and `seekable`.
- `waitForBeforeUnload` on a guest: dev method closing a held guest with it; asserts it is destroyed (red when Electron honours the docs).
- xterm A-Z: capture listener on xterm's textarea; `Shift+W` keydown not `defaultPrevented`, `w` prevented.
- morphdom: unit test (jsdom): `place()` with markup in text nodes never creates elements.
- Mermaid shadow: `look: neo` diagram; the filter color is the default gray (flips if Tie passes `dropShadow`).
