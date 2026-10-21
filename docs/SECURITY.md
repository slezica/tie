# Security

Onboarding explainer (processes, realms, doors per tile, layers, threats, stories): `docs/EXECUTION-AND-SECURITY.html`.

## Threat model

- UI renderer holds `window.tie` (spawns ptys): any script there = RCE as the user.
- Untrusted input: terminal output (OSC 8 links, titles), pasted and dropped data (incl. file names), content tiles (markdown, text, image, hex, html): any script inside their frame; browser tiles: any web site (its own webContents, `BROWSER.md`). Html pages are shown static (decision 2026-10-21: their scripts never run; only Tie's bootstrap does, by nonce); still local (no network) and isolated (own origin, no UI access, no other tile).
- The `tie` socket: reachable only by the user's own processes, which can already run code. Kept to them: the state dir is 0700 and the socket 0600 (other local accounts never reach it). Whoever is let in has the user's full power (`tie open terminal --cmd`). Callers are identified by the kernel (peer pid + uid, then process lineage): one running in a Tie terminal acts as that tile (`TIE_TILE` is not trusted); others (scripts, other apps, sandboxed agents inheriting `TIE_SOCKET` outside Tie) only with `allowExternalControl` (default off). Not a boundary between processes in the same terminal.

## Rules

- Only our code runs in the UI. Content never shares its JS realm.
- Every guard has an e2e scenario `sec-*` (red first). Guards get lost in refactors otherwise.
- Security-relevant code carries a `// SECURITY:` comment saying what matters about it.
- New IPC: `ipc.on` / `ipc.handle` (`uiIpc`), never `ipcMain` directly.
- Opening URLs: only `openExternal` in `src/main/security.ts`.
- Pure checks in `src/core/security.ts`, `src/core/content.ts`, `src/core/callers.ts` (main), `src/core/paste.ts`, `src/core/requests.ts`, `src/core/links.ts`, `src/core/kinds.ts` (renderer + main), unit-tested.
- Content kinds only through the frame host (`TILES.md`): the baseline is not per kind. What differs per kind (page, sandbox, CSP, nav rule, assets, payload, size cap, bootstrap) lives in one table: `src/core/policy.ts` (`TILES.md` "Policy table"), every row pinned by `policy.test.ts`.
- Never add `tie-content:` to the UI's `script-src`; never post to frames by name or `'*'` except the handshake to the exact `contentWindow`.
- `allow-same-origin`: document kinds only (html), on their own `tie-content://<token>` origin, never the UI's (a same-origin frame could lift its sandbox). Viewer kinds: opaque.
- The UI window runs on an in-memory session (`UI_PARTITION`): content storage never reaches disk. It has no network (`noNetwork`): Tie's pages are all custom-scheme. The browser kind has its own partition (`persist:browser`, network, none of Tie's protocols).
- Browser guests: only through `attachGuest` (prefs rebuilt, attributes dropped) and `guardGuest`; URL rules only in `core/guest.ts`.

## Guards

| Guard | Where | Test |
|---|---|---|
| Navigation (all frames), redirects: only UI reloads pass; subframes only via the content nav lock | `security.ts` `guard()` | `sec-navigate`, `sec-content-nav` |
| Content frame nav lock: the kind's nav rule (`viewer-exact`: exact viewer URL) of a registered token, child of the UI, one frame per token | `content.ts` `contentFrameAllowed`, `@core/content` `navAllowed` | `sec-content-nav`, unit |
| Content frames: sandbox from the policy table (viewer rows `allow-scripts` only: opaque origin, no storage; html `+ allow-same-origin` on its token), own process, no `window.tie`, no top nav/popups | `@core/policy`, `frame.ts` | `sec-content-escape`, `sec-html`, unit |
| Html document CSP: only `'self'` (+ `data:`/`blob:` for styles, images, fonts, media; `blob:` workers), inline/eval scripts, `connect-src 'self'`, no frames/objects/forms/`<base>`, nothing remote; on every file of the token | `@core/policy` `documentCsp`, `content.ts` | `sec-html` (a CSP violation per vector; mutation `connect-src *` → red), unit (exact) |
| UI session in memory (`session.fromPartition('tie-ui')`): content storage (html localStorage, IndexedDB, Cache Storage) never on disk; protocols, permissions, no-network on it | `security.ts` `UI_PARTITION`, `index.ts` | `sec-storage` (red first: IndexedDB marker found in the profile) |
| UI session without network: proxy to a closed local port (loopback included), WebRTC without non-proxied UDP. Covers what no CSP does (WebRTC STUN/TURN) | `security.ts` `noNetwork`, `noWebRtcUdp` | `sec-html` (red first: STUN + TURN reached local probes; mutation → red) |
| Html nav lock `within-root`: `.html`/`.htm` of its own root, not `/_tie/`, not other tokens; away → frame-src refuses, main reports, the tile reloads; loops → error | `@core/content` `navAllowed`, `content.ts` `initContent`, `frame.ts` | `sec-html` (mutations: `/_tie/` allowed → red; loop guard removed → red), unit |
| Html static: the document CSP allows scripts only by the per-response nonce, which only Tie's bootstrap carries (no inline, handlers, files, modules, workers); the page's own scripts never run, a red "Scripts blocked" tag (bootstrap counts CSP violations → `blocked` verb) says so | `@core/policy` `documentCsp(nonce)`, `content.ts`, `kinds/html.ts` `pill` | `html-static`, `sec-html`, unit (exact CSP) |
| Html requests: bootstrap port invisible to the page (capture, first, stopped); `followLink` routed as hostile: web only through the confirm (below), other files beside (one per second), other schemes refused; no `allow-popups`, `window.open` → request; the page's `<title>` never names the tile (no `title` verb) | `html-bootstrap.ts`, `kinds/html.ts` | `sec-html` (mutations: port visible → red; confirm skipped → red), `html`, `html-scripts` |
| Links out: every path to the system browser (file views, html pages, terminal cmd-click) goes through one confirm dialog (setting `confirmExternal`, on): full URL, site in bold, long links flagged, Cancel focused, Open disabled 600 ms, one at a time; then main's `openExternal` (http(s) only) | `renderer/external.ts` | `sec-links`, `markdown-links`, `sec-markdown`, `sec-html`, `sec-focus` |
| Link strip: the hovered link's real target shown bottom-left of the tile by the UI (`Host.hint`); content can't draw the real one | `tile.ts`, `hover` verb, `update-target-url` | `sec-links`, `markdown-links`, `html-scripts` |
| `tie-content` `supportFetchAPI` (html fetches its folder); never `corsEnabled`: other tokens unreadable; opaque viewer frames can't fetch (no CORS + CSP) | `security.ts` `harden` | `sec-html` (mutation: probe same-origin + connect-src → red; either alone → green: two layers) |
| `tie-content://`: privileges `standard`+`secure`+`supportFetchAPI`; token → root; root files inside the real root; root itself, other viewer files, unknown tokens refused | `content.ts`, `@core/content` | `sec-content-protocol`, `sec-html`, unit |
| Content CSP: nothing by default, viewer scripts by per-response nonce, images from own token only; `nosniff` | `@core/policy` `contentCsp`, `serveContent` | `sec-content-escape`, unit (exact strings) |
| Markdown frame CSP: as above, but `style-src 'unsafe-inline'` (Mermaid SVG: `<style>`, style attributes). No nonce beside it (CSP3 would ignore `'unsafe-inline'`). Inline CSS only restyles the tile; no stylesheet hosts; url()s bound by img-src / font-src; scripts nonce-only | policy row `styles: 'inline'` | `markdown-mermaid` (no violations), `sec-mermaid`, unit |
| Mermaid: lazy asset (markdown tokens only), strict, SVG-text labels, limits, `secure` keys (no `%%{init}%%` overrides), output re-sanitized (SVG profile, no `<image>`/`foreignObject`/`use`) | `viewers/mermaid.ts`, `viewerFile` | `sec-mermaid`, `sec-content-protocol`, unit |
| Content watchdog: hung frame (no pong 5 s) → error, frame removed, its process killed if exclusive; crashed (port closed) → error; never reloads | `frame.ts`, `@core/watchdog`, `content.ts` `killContent` | `content-watchdog`, unit |
| Content requests: port only, typed verbs, strict shape; main re-validates (openLink: http(s)) | `frame.ts`, `@core/requests` | `sec-content-escape`, unit |
| Gesture rule: link opens (`openLink`, `followLink`) only while the frame is focused (or focused within 150 ms: focus lags a click's request across processes) | `frame.ts`, `needsGesture` | `sec-content-escape`, `sec-markdown`, `sec-html` (mutation → red) |
| Frames can't focus themselves: Blink refuses `window.focus()` / `el.focus()` from a content frame without transient user activation (permissions policy `focus-without-user-activation 'none'` on every content iframe + `BlockingFocusWithoutUserActivation` enabled in main). Without it a page's script on load passed the gesture rule (dialog with no click) and took the keyboard from a terminal | `frame.ts` `allow`, `main/index.ts` `app.commandLine` | `sec-focus` (red first; mutation: feature off → red) |
| Frame message flood: > 1000 messages / s from one frame dropped unparsed | `frame.ts` `FLOOD_MAX` | — |
| Markdown render: raw HTML escaped (`html: false`; also in footnotes, front matter), DOMPurify on the final HTML (after every plugin), remote / out-of-folder images never requested (placeholder) | `viewers/markdown.ts` | `sec-markdown` |
| Viewer runtime: handshake only from `parent`, one port; link clicks never navigate (requests from the click handler only); drops / middle clicks refused; live diff never parses strings | `viewers/runtime.ts`, `live.ts` | `sec-markdown`, `markdown-links` |
| File view links: anchors, http(s) (→ `openExternal`), paths (files of the tile's kind open; main re-checks the file); other schemes refused | `@core/links` `classifyLink`, `fileview.ts` | `sec-markdown`, `markdown-links`, unit |
| Content tiles read-only: no request verb writes (write-shaped messages are unknown verbs, dropped); no doc write IPC or bridge method; task boxes display-only | `@core/requests`, `main/docs.ts`, `preload`, `viewers/markdown.ts` | `sec-markdown`, unit |
| Text render: escaped text only (no markup from the file), control characters and bidi overrides made visible (never interpreted) | `viewers/text.ts` | `sec-viewers` (mutation: unescaped → red; controls raw → red) |
| Images (SVG included) only as `<img>` from the tile's token: no scripts, handlers or external loads (image context; CSP `img-src` own token) | `viewers/image.ts`, policy row | `sec-viewers` (probe untouched) |
| Hex: bytes rendered from fixed tables (hex, escaped ASCII): no byte is markup | `viewers/hex.ts` | `hex` |
| Opening files: main checks absolute, existing regular file, kind (extension, else sniff: text / hex), requested kind allowed (`canOpenAs`), size cap (policy row) before any read; reads capped again | `main/docs.ts` `fileViewer`, `@core/kinds` | `markdown-open`, `sec-viewers` (mutation: cap check removed → red), unit |
| OS drags: content frames ignore the pointer while one is over the window (drops land in the UI) | `renderer/main.ts`, `style.css` | — (offscreen harness: drags never reach frames) |
| Shortcuts in main: real keys only, blocked before any page (content can't swallow, fake or see them); Esc and editing combos pass | `main/keys.ts`, `@core/keymap` | `sec-keys`, unit |
| `window.open`: always denied (child windows inherit preload) | `guard()` | `sec-navigate` |
| `<webview>` attach: UI page only; prefs rebuilt from nothing (no preload, no Node, sandbox, isolation, no nested webviews, web security, partition `persist:browser`); every attribute but `src` dropped; `src` http(s) / `about:blank` only | `main/guest.ts` `attachGuest`, `@core/guest` `guestSrc` | `sec-browser` (mutations: prefs kept → `persist:evil` partition; partition forced but prefs kept → `preload` gave the guest `window.tie`; bad src allowed → red; content frames can't create `<webview>`: no tag outside the UI's main frame) |
| Guest navigation: main frame http(s) (+ `about:blank`), subframes also `about:`/`data:`/`blob:`; redirects same rule; never `file:`, `tie:`, `tie-content:`, `chrome:`, `mailto:`... | `guardGuest` (`will-frame-navigate`, `will-redirect`), `@core/guest` `guestNavAllowed` | `sec-browser` (mutation: guard off → red; Tie's schemes still fail: no handlers on the partition, second layer), unit |
| Guest loads started by the UI (`src`, `loadURL`, back/forward; no `will-frame-navigate`): refused URL → stopped | `guardGuest` (`did-start-navigation`, deferred `stop()`) | `sec-browser` (mutation → `file:///etc/hosts` loaded) |
| Location bar / CLI URLs: http(s) only, bare host → `https://`, no search | `@core/guest` `locationUrl`, `renderer/guest.ts`, `driver.ts` | `browser`, unit |
| Guest popups: never a window; http(s) → system browser only within 1 s of real input (main `input-event`) in that guest; else blocked + logged | `guardGuest` (`setWindowOpenHandler`), `@core/guest` `popupVerdict` | `sec-browser` (mutation: always external → red), unit |
| Downloads: every one asks (dialog in the UI: sanitized name, size, site; Save disabled 600 ms; one at a time); `will-download` refuses, the UI asks, Save allows that URL once (`allowDownload`) and the guest downloads it again; `~/Downloads` (harness: `TIE_DOWNLOADS`), sanitized unique name, never opened; the UI session refuses downloads | `initBrowserSession`, `allowDownload`, `noDownloads`, `@core/guest` `downloadName`, `uniqueName` | `sec-browser` (Cancel saves nothing, script-started downloads ask too; mutation: site's name as is → overwrite → red), unit |
| Device choosers: Web Bluetooth chooser cancelled (Electron's default picks the first device found); USB / HID / serial denied (device permission handler); client certificates never sent (Electron's default sends the first in the keychain) | `guest.ts` `noDeviceChoosers`, `harden()` | — (no device in the harness) |
| Content protocol memory: root files streamed (never read whole into main: a page naming a multi-GB file of its folder costs a stream); html documents of a root read whole only up to the kind's cap | `content.ts` `serveContent`, `streamFile` | `sec-html` (document over the cap → refused; large asset streams) |
| State dir private: `~/.config/tie` 0700, sockets / info / logs / settings 0600 (fixed up at start for older files); socket request lines capped at 1 MB | `env.ts` `PRIVATE`, `socket.ts` | `sec-state` |
| Socket callers: peer pid + uid from the kernel (`LOCAL_PEERPID`, `LOCAL_PEERCRED`), ancestors walked (≤ 64 hops) to a tile's pty; other uid / unknown peer → refused + dropped; same uid, no pty ancestor → external: refused unless `allowExternalControl`; tile callers: `params.caller` forced to the lineage's tile (a different claim logged `caller spoof`). Every method, dev ones too | `socket.ts`, `native/peer`, `@core/callers` `callerTile`, `pty.ts` `tiles` | `sec-socket` (spoofed `TIE_TILE`), `sec-socket-external` (setting off: harness refused, terminal allowed), `settings` (switch applies at once), unit (uid mismatch: unit only, the harness runs as the user) |
| Browser partition: permissions denied (as every session), network direct, UI session still dead-proxied | `harden()`, `noNetwork` (UI session only) | `sec-browser` (mutations: permissions granted → red; dead proxy on the partition → red) |
| Guest shortcuts: matched in each guest's own `before-input-event`, blocked before the page | `main/keys.ts` `watchKeys` | `browser` (mutation: not attached → red) |
| Guest crash → tile error, guest removed, UI and other tiles fine. Hang (`unresponsive`) → error + renderer killed (not observed in the harness: no `unresponsive` within 60 s of a busy loop) | `renderer/guest.ts`, `guardGuest` | `sec-browser` (mutation: crash ignored → red) |
| ptys killed on committed navigation only (`did-navigate`) | `main/index.ts` | `sec-navigate` |
| Permissions: all denied, every session | `harden()` | `sec-permissions` |
| Terminal links: hover shows the URL in the link strip, cmd-click only, http(s) only, confirm | `kinds/terminal.ts` `linkHandler`, `external.ts` | `sec-links` |
| Native drops: never navigate; on a terminal, quoted paths / text via guarded paste; files elsewhere → their viewer (main checks); text elsewhere: nothing | `renderer/main.ts`, `paste.ts`, `files.ts`, `kinds/terminal.ts` | `sec-drop`, `markdown-open` |
| Paste: confirm control characters and would-run newlines (settings, default on) | `paste.ts`, `@core/paste` | `sec-paste`, `sec-paste-off`, unit |
| IPC: UI main frame of UI window only | `uiIpc`, `isUiSender` | unit |
| UI on `tie://app/` (not `file://`), traversal-safe | `serveShell`, `resolveInside` | `sec-protocol`, unit |
| UI CSP: scripts from app only; frames only `tie-content:`; no objects, workers, forms, `<base>`. Inline styles allowed (xterm needs them) | `renderer/index.html` | `sec-csp`, `sec-content-nav` |
| Fuses (below) | `electron-builder.yml` | `check-package` |

## Fuses

- On: `runAsNode` (CLI launcher needs it), cookie encryption, asar integrity, only-load-from-asar.
- Off: `NODE_OPTIONS`, `--inspect`, file-protocol extra privileges.
- Checked after every `tie-dev package` (`dev/package-check.mjs`): fails = package removed.

## Harness

- `probe(ctx)`: local http page reporting hits and whether it got `window.tie`. `assertUntouched(what)`.
- Probe kind (dev builds): `tie open probe [--cwd root]`, `h.probeFrame(ctx, id)` = Playwright frame inside it (the attacker's seat). `h.frames(ctx)` / `tie-dev frames`: frame tree, out-of-process.
- `ctx.appLog()`: run's app log; `[security]` lines record every block/refusal.
- Socket: the harness is an external caller. `launch()` seeds `allowExternalControl: true` (scenario `settings` override it).
- Harness instances (`TIE_BACKGROUND`) log `external open <url>` instead of opening, and never show the file picker (dev socket `pick` answers it).
- Markdown: `h.contentFrame(ctx, id)` = the viewer's frame; `window.markdown.port` lets a scenario post requests as the frame (write-shaped messages, gesture-less links).
- Keys: `h.press` / `keyDown` / `keyUp` go through main (`sendInputEvent`); CDP keys skip `before-input-event`. Playwright's `evaluate` runs with a user gesture (CDP `userGesture`): it can't show what a page's own script may do without one (focus, popups); use the page's own timers for that (`sec-focus`).
- Limits: no harness path sends a key that is both routed into a focused frame and seen by `before-input-event`; `sec-keys` covers each half (frame really focused via `hiddenWindow`; main handles keys whatever the focus). Real-hardware check: manual.
- Limits: offscreen + CDP can't reach the native navigate-on-drop path; `sec-drop` asserts the mechanism (drags claimed).
- Browser: `h.guestPage` = the guest's realm (what a site can do); `h.guestKey` / `h.guestClick` = input through main (gesture + shortcuts); dev socket `guest` (`list`, `crash`, `proxy`). Downloads go to `TIE_DOWNLOADS` (dev builds; every harness instance), never `~/Downloads`.
- Html: `h.htmlFrame(ctx, id)` = the page's realm (what page scripts can do); `tie list --json` `page`. CSP violations observed in the page (`securitypolicyviolation`), so the CSP layer is tested even though the network kill-switch would also stop requests.
