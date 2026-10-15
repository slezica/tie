# Security research: content isolation and Electron hardening

Merged record of five source-level studies. Basis for `docs/SECURITY.md` (Track A) and content-tile isolation (Track B).

# Methodology

## Trigger

- Plan: add content tiles (markdown, html files, agent HTML, web pages).
- Problem: shell renderer holds `window.tie`, which spawns ptys. Any foreign script in that realm = RCE as the user.
- Question: how do comparable Electron apps isolate content, and how have they failed?

## Setup

- Date: 2026-10-14.
- Five agents in parallel, one subject each:
  - Wave Terminal.
  - VS Code: webviews, markdown preview, integrated browser.
  - Joplin desktop: note viewer.
  - Hyper + Tabby (+ xterm.js).
  - Electron itself + app postmortems (Signal, Element, Mattermost, Discord, Slack, Teams, Obsidian, Typora, MarkText, Zettlr, Logseq, ...).
- Raw per-agent reports merged here, then discarded: revisits redo the research for current state.

## Evidence rule

- Conclusions come from source code. Docs and blogs only as pointers.
- Every claim cites `path:line` at a pinned commit, or a fix commit.
- Doc-, blog- or advisory-only claims tagged unverified (`[docs]`, `[adv]`, `[blog]`, `[unverified]`, `[inferred]`).
- Rule re-asserted to all agents mid-run.
- Nothing built or run from cloned repos. Attack paths inferred from code unless stated.
- One exception: terminals agent ran Node's `URL` parser to confirm `ssh://` hostname/username parsing.

## Pinned sources

| Subject | Repo @ commit | Notes |
|---|---|---|
| Wave | `wavetermdev/waveterm` @ `9f1c9670` (2026-10-05) | v0.14.5, Electron ^41.1.0 |
| VS Code | `microsoft/vscode` @ `a4d6dc1` (2026-10-14) | |
| Joplin | `laurent22/joplin` @ `057596c23` (2026-10-14) | app-desktop 3.7.21, Electron 42.3.0. Fix diffs read |
| Hyper | `vercel/hyper` `canary` @ `30ec0a2` (2026-08-21, v4.0.0-canary.5); `master` @ `20a4ecf9` (3.x) | |
| Tabby | `Eugeny/tabby` @ `467ce8e` (2026-10-06) | after v1.0.238 |
| xterm.js | tags `5.3.0` (Hyper), `6.0.0` (Tabby, Tie) | full history for CVEs |
| Electron | `3c27377` (2026-10-14) | electron report: branch `44-x-y`; terminals report: `main` |
| Chromium | `152.0.7977.158` | Electron 44 DEPS |
| Postmortems | fix commits linked per app | most advisory-only; `[diff]` where fix diff read |

## Claims explicitly unverified (need runtime tests or source)

Runtime (Tie harness candidates):
- Sandboxed `allow-scripts` iframe runs out-of-process (OOPIF). Source says yes, not run.
- `before-input-event` on shell webContents fires for keys focused in an OOPIF. Source says yes, not run.
- `srcdoc` iframe inherits parent CSP. Spec behaviour, not run.
- Shell pointer capture keeps moves while crossing an iframe / webview / WebContentsView.
- OS drag entering directly over an iframe: can the shell still claim it.
- Opaque-origin iframe fetching its own custom-protocol resources (CORS effect).
- Untrusted content can swallow non-reserved macOS menu accelerators by `preventDefault`.
- `file:` openExternal launching `.app` on current macOS.

Wave (all inferred, none tested, none reported):
- Web block → backend RPC via session-wide authkey header. Also depends on `webRequest` covering WS handshakes `[docs]` and Chromium Local Network Access `[unverified]`.
- Paste XSS via `innerHTML` on HTML-only clipboard.
- `stream-file` HTML executing on backend origin.
- Web-block permissions granted via entitlements.
- VDOM `dangerouslySetInnerHTML` passthrough; practical reachability unknown.
- Streamdown sanitizer defaults not checked.

VS Code:
- Hashed-origin self-check as the CVE-2021-43908 fix `[inference]`.
- Preview message `e.source` check spoofable `[inference]`.
- Ammar Askar interim fix mapping to current code `[unverified]`.
- Remedio 2026-09 `command:` DocumentLink trust bypass `[unverified in source]`.
- "Few hundred lines" minimum for Tie `[estimate]`.

Joplin:
- Impact of `contentScriptExecuteCommand` per command.
- Messages leaking via `postMessage('*')` after iframe navigation.
- CVE-2026-49449 NTLM leak, CVE-2026-22810 `[adv]`.
- Fix-commit links for CVE-2022-35131, CVE-2025-25187, `1a195e23d` `[inferred]`.
- CVE-2024-53268: advisory says fixed in 3.0.3; code shows allowlist only in `56ce951f3` (2026-09).

Terminals:
- Hyper OSC 8 opening in a Node-less Electron window `[inferred]`.
- Hyper paste and drop injections `[inferred]`.
- Hyper `ssh://` RCE `[inferred]` (URL parsing checked with Node).
- Which apps shipped xterm CVE-2019-0542 versions `[unverified]`.
- Electron's "fuse CVEs are not Electron CVEs" statement `[blog]`.

Electron/postmortems:
- Most postmortems `[adv]`. Slack contextIsolation state, Element GHSA-9r5h fix mapping, Obsidian CVE-2026-104078 (disputed by NVD) `[unverified]`.
- `fs.realpath` before containment check: standard practice, not verified as needed.
- Browser-tile framing failures per site (`X-Frame-Options`, cookies).

# Findings by subject

## Wave Terminal

### Model and history
- No written threat model. `SECURITY.md` = report email only.
- No GHSA advisories. One CVE: CVE-2025-12843 (fuses, TCC bypass, v0.12.2, Fluid Attacks).
  - No fuses at HEAD (no `@electron/fuses`, no `electronFuses` in `electron-builder.config.cjs`). Likely still open.
  - Entitlements: camera, mic, contacts, calendar, location, photos "so CLI apps can request" (`build/entitlements.mac.plist`). Raises TCC-bypass value.
- Implied model: shell trusted; markdown/files semi-trusted (sanitized, privileged realm); web pages untrusted (`<webview>`, shared session).
- Security fix commits: `e527e2ab` authkey header; `7648eaf7` stop logging authkey; `ccf344d1` path traversal; `2157df85` pointer-events off during drag; `fb412546` tsunami iframes → webviews. None for XSS, CSP, navigation.

### Architecture
- Main spawns Go backend `wavesrv`. `AuthKey = crypto.randomUUID()` (`emain/authkey.ts:9`).
- One `WebContentsView` per tab, cache 10 + hot spare (`emain/emain-tabview.ts:118-173,237-393`). Prefs `{preload, webviewTag: true}` only (`:138-143`).
- No CSP anywhere (`frontend/index.html:1-19`, grep).
- Shell preload `window.api` (`emain/preload.ts:7-76`): `getAuthKey`, `getEnv(any)` (`emain-ipc.ts:279-281`), `openExternal`, `openNativePath`, `quicklook`, `downloadFile`, `captureScreenshot`, `clearWebviewStorage(anyWcId)` (`:383-394`), `nativePaste`, key/focus helpers.
- Guest preload (`emain/preload-webview.ts:1-39`): no `contextBridge`. Image context menu, mouse back/forward (`isTrusted` checked).
- `wavesrv`: HTTP+WS on `127.0.0.1:<random>` (`cmd/server/main-server.go:590,595`; `pkg/web/web.go:421-429`). Unix socket 0700 + JWT for `wsh` (`web.go:438`, `pkg/wshutil/wshutil.go:250-251`).
  - `/wave/stream-local-file` serves any path with its own MIME type (`web.go:303`).
- Auth: main injects `X-AuthKey` by URL match via `onBeforeSendHeaders` (`authkey.ts:15-23`) on `defaultSession` (`emain.ts:401`) and tab sessions (`emain-tabview.ts:356`).
  - OPTIONS bypasses auth (`web.go:405-409`).
  - WS `CheckOrigin` always true (`pkg/web/ws.go:64`); every WS = trusted router (`ws.go:232`) = full RPC incl. `ControllerInputCommand` (types into terminals, `term-model.ts:511`).
  - Dev only: CORS reflects any Origin with credentials (`web.go:472-490`).

### Content rendering
- Markdown in **shell realm**, no iframe (`frontend/app/element/markdown.tsx`).
  - `react-markdown` + `rehype-raw` (raw HTML on) → `rehype-sanitize` GitHub schema + additions (`:415-447`, `:421-444`).
  - Mermaid `securityLevel: "strict"`, shell realm (`:31-38,70-121`).
  - Links → `openLink` → web block or `openExternal` (`global.ts:536-547`).
  - Remote `http(s)` images load from shell: IP/tracking leak (`markdown-util.ts:157-160`). Relative → `stream-file` (`:161-172`).
  - Task checkboxes not interactive.
  - AI chat: `streamdown` + Shiki via `dangerouslySetInnerHTML` (`streamdown.tsx:98-104,305-326`).
- File preview (`preview-model.tsx:502-551`): HTML shown as **source** in Monaco; SVG via `<img>` (scripts inert, `preview-streaming.tsx:86-88`); PDF in `pdfview` iframe.
- Web blocks: `<webview ... allowpopups partition>` (`webview.tsx:1110-1122`). Default partition = `defaultSession` (`:856-858`), shared with shell + authkey.
  - `window.open` denied in main, forwarded → new web block (`emain-tabview.ts:317-325`). Bug: dispatches to first `#webview`, not source (`emain/preload.ts:79-82`).
- Terminal: OSC 8 **no scheme filter** → `openExternal`; main doesn't filter either (`emain-ipc.ts:196-208`). Cmd/Ctrl+click required, hover shows URL. OSC 52 write default "always" (`osc-handlers.ts:145-151,205-207`).
- Tsunami apps: Go process on `localhost:0`, no auth; own partition `tsunami:<blockId>` (`tsunami.tsx:31`).
- VDOM (legacy): shell realm, tag allowlist, csstree-filtered CSS, but **no prop-key filter** (`vdom.tsx:210-290`).

### Guards
- Tab `will-navigate`: always prevented; http/https/**file** → `openExternal` (`emain-util.ts:100-120`). Unhandled file drop → `file://` → OS opens it `[inferred]`.
- `will-frame-navigate`: subframes blocked except `pdfview` / tsunami allowlist (`emain-util.ts:133-185`).
- Tab `setWindowOpenHandler`: deny + `openExternal` http/https/file (`emain-tabview.ts:345-352`).
- Missing: guest `will-navigate`, `will-attach-webview`, permission handlers (grep 0), `app.enableSandbox()`, global drop handler, IPC sender validation (`get-auth-key`, `get-env`, `open-external` etc. answer any sender).

### Keyboard, mouse, focus
- Webview keys: main `before-input-event` on guest; matched keys `preventDefault` + `reinject-key` to shell keymap (`emain-ipc.ts:291-333`, `keymodel.ts:480-484`).
- Weaknesses `[inferred]`: key list snapshotted once, so chord `Ctrl:Shift:s` missed (`keymodel.ts:770` vs `:751`); chord mode only checked on tab webContents; Esc always swallowed (`:733`); one global `webviewFocusId` (`emain-ipc.ts:32`); lazy listener on first focus; no keyup from webview (`webview.tsx:518`).
- Drag: `pointer-events: none` on content during drags (`layoutModel.ts:1088`, `block.tsx:150-152`). Resize: pointer capture, **no shield** (`TileLayout.tsx:446-473`).
- Ctrl+Shift overlay mask covers webviews (`block.scss:407-415`).
- Focus: `<webview>` DOM `focus` → `focusNode()` (`webview.tsx:1057-1063`).

### Possible issues (inferred, untested)
1. Web page → backend RPC: shared session + session-wide header + no WS Origin check → full terminal input. Needs port discovery.
2. Paste XSS: HTML-only clipboard → `div.innerHTML` (`termutil.ts:152,280`). Detached `<img onerror>` runs. No CSP.
3. `openExternal` any scheme from OSC 8.
4. No permission handler + broad entitlements.
5. Web block on `stream-file?path=x.html` runs on backend origin with header.

## VS Code

### Model
- Workbench `vscode-file://vscode-app`, sandboxed (`windows.ts:160`), privileged IPC.
- Content never in workbench realm, except small UI markdown (hovers, chat): DOMPurify with strict allowlists (`base/browser/domSanitize.ts:114-173,242-247`, `markdownRenderer.ts:744-798`); `command:` only if `isTrusted` (`:760-762`).
- Webview content treated as hostile even when extension-authored (`contrib/webview/browser/webview.ts:126-136`).
- Workspace trust does not touch webviews. Gates extensions instead: markdown `untrustedWorkspaces: limited` (`package.json:38-46`); WYSIWYG editor modal + drops workspace roots (`markdownEditorProvider.ts:327-343,356-363`); notebook DOMPurify only when untrusted (`notebook/index.ts:339-341`).

### Webview architecture
- Three documents: workbench → host shell `vscode-webview://<hash>/index.html` → inner `#active-frame`.
- Host iframe sandbox: `allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-downloads` (`webviewElement.ts:426`).
- Inner frame: `fake.html` same origin + `document.write` (srcdoc lacked SW, `pre/index.html:1029-1077`). Sandbox `allow-same-origin allow-pointer-lock` (+scripts/downloads/forms by option). No popups, no top-nav.
- Inner is **same-origin with host shell**. Mitigation: shell captures `postMessage`, `MessagePort.prototype.postMessage`, `Function.prototype.call` before content loads (`pre/index.html:99-105`).
- Origin: scheme `vscode-webview` `standard, secure, supportFetchAPI, corsEnabled, allowServiceWorkers, codeCache` (`mainImpl.ts:111-115`). Host = base32 `sha256({parentOrigin, salt})` (`base/browser/iframe.ts:117-135`). Salt = random UUID per `viewType` (`webview.ts:360-411`).
- Shell self-check: recomputes hash, refuses to start on mismatch (`pre/index.html:338-375`). Defeats forged `parentOrigin`.
- Handshake: `webview-ready` posted once to `parentOrigin` with a `MessagePort`. Workbench checks origin, `source`, one-time `mountId`, `keyEventToken`, port (`webviewElement.ts:526-575`). Then private port only.
- Main: protocol serves only `/index.html`, `/fake.html`, `/service-worker.js`, else 403 (`webviewProtocolProvider.ts:15-50`).
- Main `onBeforeRequest` (`app.ts:386-464`):
  - `vscode-webview://…/index.html` only from main-window processes.
  - `vscode-file://` only from main-window processes.
  - remote-resource blocked under webview ancestors; SVG blocked unless webview frame or XHR.
- Resources: fake `https://*.vscode-resource.vscode-cdn.net` URLs → service worker → shell → workbench `loadResource` (`service-worker.js:349-369,575-593`; `webviewElement.ts:826-985`). Root check: `isEqualOrParent`, root itself denied, Windows `..`+spaces rejected (`resourceLoading.ts:107-168`).
- CSP: shell `default-src 'none'; script-src 'sha256-…' 'self'; frame-src 'self'` (`pre/index.html:7-8`). Content CSP is the extension's job. Shell strips `meta http-equiv` except CSP/default-style/content-type, kills `refresh` (`:889-896`).
- Webviews never reparented: overlay positioned over an anchor (`overlayWebview.ts:21-24,123-124,201-204`).

### Markdown preview
- markdown-it `html: true`, **no sanitizer** (`markdownEngine.ts:398-401`). Links: default + `vscode:`, `vscode-insiders:`, `data:image/` (`:295-303`).
- Security = webview isolation + CSP per level (`documentRenderer.ts:257-277`):

| Level | img/media/style/font | script |
|---|---|---|
| Strict (default) | `'self' cspSource https: data:` | nonce only |
| AllowInsecureLocalContent | + `http://localhost:* http://127.0.0.1:*` | nonce only |
| AllowInsecureContent | + `http:` | nonce only |
| AllowScriptsAndAllContent | no CSP | any |

- Nonce = fresh UUID per render (`:103`). No `connect-src`/`frame-src` → blocked by `default-src 'none'`.
- Options: scripts on, forms off, roots = contributed + workspace (`preview.ts:467-477`).
- Updates: `DOMParser` → strip all `meta[http-equiv]` → `morphdom` (`preview-src/index.ts:339-400`).
- Links: http/https/mailto/vscode pass to shell → `did-click-link`, accepted only if iframe is `activeElement` (`webviewElement.ts:212-217`). Workbench allowlist; `command:` only with `enableCommandUris` (`mainThreadWebviews.ts:24-30,93-118`), off in preview.
- Messages to extension: only `e.source === resource` (`preview.ts:182-214`). Handlers low-impact by design.
- Classic preview: no task-list checkboxes.
- New WYSIWYG editor (`vscode.markdown.editor`): checkbox → text edit → `WorkspaceEdit` (`markdownEditorProvider.ts:591-627`). Validates types/ranges (`:1323-1366`), drops stale `editEpoch` (`:596-599`), queue. Per-load `messageSecret` in `<meta>` (`:1160`), zod envelope (`markdownEditorRpc.ts:43-84`). Weakness: free-form range replace.

### Keyboard
- Webview shell forwards a **copy** of every keydown (`pre/index.html:603-650`). Prevents in-frame Cmd+Z/Y/P/F/S and clipboard keys; workbench re-sends them via `execCommand` (`webview.contribution.ts:21-49`).
- Workbench accepts only if `keyEventToken` matches, `isTrusted` true, iframe is `activeElement` (`webviewElement.ts:744-772`). Re-dispatched as synthetic event.
- Electron: `setIgnoreMenuShortcuts(true)` while webview focused (`webviewMainService.ts:32-40`).
- Integrated browser (WebContentsView) policy (`preload-browserView.ts:45-140`):
  - Forward only `isTrusted` and not `defaultPrevented` (page first).
  - Only with Ctrl/Alt/Meta, or Esc/F-keys/media. Skip native editing combos and Mac Alt+key.
  - Per-view `webContents.ipc` (`browserView.ts:474`). Fallback `before-input-event` when page hung (`:482-512`).
- Simple Browser: cross-origin iframe, keys lost, "Focus Lock" indicator.

### Mouse, focus, menu
- Sash drag: `pointer-events-disabled` on every iframe (`sash.ts:539-542,605-607`).
- Editor drags: iframe `pointerEvents='none'` on window `dragstart`/`dragover`, cites electron#18226 (`webviewWindowDragMonitor.ts:287-327`).
- OS file drags into webview: shell posts drag events, workbench re-dispatches (`pre/index.html:792-832`).
- Focus: shell polls `hasFocus()` every 250ms (`pre/index.html:61-77`); programmatic focus debounced 50ms (`webviewElement.ts:1005-1043`).
- Context menu: shell posts coordinates + `data-vscode-context`; workbench draws HTML menu (`pre/index.html:1189-1227`).
- Integrated browser: native view hidden and replaced by 1s-refreshed JPEG whenever an HTML overlay intersects (`overlayManager.ts:21-48`, `webContentsViewHost.ts:150-229`).

### Electron guards
- `web-contents-created` for all (`app.ts:573-616`): `will-navigate` prevented (except browser views); `setWindowOpenHandler` → `openExternal(url)` + deny, **no scheme filter**.
- Permissions keyed on `requestingUrl` (`app.ts:261-299`). Webview: pointerLock, notifications, clipboard-read, sanitized-write. Window: + media, local-fonts. Rest denied.
- `validatedIpcMain` (`ipcMain.ts:106-158`): channel prefix `vscode:`, `senderFrame.url` host = app authority, main frame only.
- Webview content has no Electron IPC.
- Integrated browser: `sandbox`, `contextIsolation`, no node, no `webviewTag` (`browserView.ts:142-157`); partitions `persist:vscode-browser`, per-view, per-agent (`browserSession.ts:136,160,178`); `file://` gated; popups need recent gesture.
- No `<webview>` tag anywhere. Comments cite electron#14258, #18226.

### Incidents

| ID | Break | Fix in source |
|---|---|---|
| CVE-2021-43908 | `<meta refresh>` → attacker frames shell with forged `parentOrigin` → `allowScripts` → XSS; `vscode-file://` `..%2F` → repo HTML in workbench origin → `child_process` | meta stripping; hashed-origin self-check + port handshake; process gate on `index.html` / `vscode-file`; 3-file allowlist; sandboxed workbench `[inference]` |
| CVE-2021-26437 | Notebook markdown XSS in same-origin frame → `top.require` | DOMPurify when untrusted; process gate |
| CVE-2022-41034 | Webview JS auto-clicked `command:` link → terminal exe | `enableCommandUris`; `command:` only if `isTrusted` |
| 2026-06 (Ammar Askar) | Webview synthetic `KeyboardEvent`s forwarded → command palette → install extension → token theft | `isTrusted` + `keyEventToken` (`webviewElement.ts:744-750`, `pre/index.html:107-112,646-647`) |
| 2026-09 (Remedio) | Ctrl+click `command:` DocumentLink in source editor installs `.vsix`. Unfixed per blog | not checked |
| MPE (3rd party) CVE-2025-65716, CVE-2026-54701/2/3 | `head.html` XSS; message handler ran any `executeCommand`; arbitrary `fs.writeFile` | n/a |

### Size
- Webview core ~5.1k lines + 717-line SW. Integrated browser ~28k lines. Still 3+ CVE-class breaks in 5 years, each a chain of small gaps.

## Joplin

### Model
- `SECURITY.md` lists exclusions only.
- Untrusted: note content (shared notebooks, sync, imports, paste, PDFs, x-callback, titles), sync target.
- Trusted: plugins (`nodeIntegration: true`, `contextIsolation: false`, `PluginRunner.ts:119-126`); main renderer (same + `enableRemoteModule`, `ElectronAppWrapper.ts:267-273`).
- Any script in main doc = RCE. Security = keeping note HTML out of it.

### Viewer history

| Period | Viewer | Privilege | Commit |
|---|---|---|---|
| ≤2018-06 | `<webview nodeintegration>` | Node in viewer | `df302206d` removes |
| 2018-06→09 | `<webview preload>` | `ipcRenderer` on `window` | `df302206d` |
| 2018-09→2019-12 | webview + contextIsolation | IPC via postMessage | `72af56438` |
| 2019-12→2024-07 | plain iframe, `file://` | **same origin as Node parent**, `top.require` | `f10695fb8` |
| 2024-07→now | iframe `joplin-content://note-viewer/` | cross-origin, own process | `d2028588e` |

- 2019 switch = regression. Every sanitizer bypass 2020–2024 = RCE.

### Current viewer
- `NoteTextViewer.tsx:260-267`. **No `sandbox`** (breaks PDF viewer, resources). `allow` scoped (`:64-73`).
- **No CSP**; can't have one: inline `onclick` handlers.
- Viewer persists across notes; `setHtml` swaps `innerHTML` (`index.html:464`). Note A's script sees B, C (CVE-2026-55105 impact).
- `joplin-content://`: `standard, secure, supportFetchAPI, stream, corsEnabled, codeCache` (`registerCustomProtocols.ts:8-22`).
  - `note-viewer` host: allow-listed dirs (`handleCustomProtocols.ts:184-196`).
  - `file-media` host: any local file with `?access-key=`, media types only, `nosniff` (`:197-208,244-254`).
  - Path: `normalize`, reject leading `..`, `resolvePathWithinDir` (`:171-194`).
- Main CSP (`index.html:5-17`): `script-src 'self' joplin-plugin://* joplin-content://*`. No CSP until `d1913493a` (2025-09); `'unsafe-inline'` removed `e3028e39f` (2026-02).
  - `joplin-content://*` in main `script-src` + resourceDir on that host = attachments loadable as main script `[inferred]`.

### Messaging
- Host → viewer: `postMessage(..., '*')` (`NoteTextViewer.tsx:117-150`). `setHtml` carries `mediaAccessKey` (`:112-115`): viewer XSS reads any media file on disk `[inferred]`.
- Host receive: `event.source` + `target`, **no origin check** (`:202-215`). `source` survives iframe navigation.
- Viewer receive: only `data.target` (`index.html:92-105`). Nested frames can call `setHtml`.
- Dispatch (`useMessageHandler.ts:23-81`):
  - `contentScriptExecuteCommand` → `CommandService.execute(anyName, ...)` (`:68-71`). Viewer XSS = any app command.
  - Fallthrough: any other string → `openItem(msg)` (`:76-78`).

### Rendering
- markdown-it `html: true` (`MdToHtml.ts:514-518`). Off in `494e235e1` (CVE-2018-1000534), on again `df302206d`.
- Link validation blocks only `javascript:`, `vbscript:`, non-image `data:` (`validateLinks.ts:62-74`).
- Sanitizer: custom, htmlparser2 fork (`htmlUtils.ts:209-409`).
  - **Per token**, only `html_block`/`html_inline` (`sanitize_html.ts:11-57`). Fence, KaTeX, Mermaid, Fountain, link output unsanitized.
  - Tag blocklist (`:246-256`); `form`→`div`; depth counter drops content of blocked tags.
  - Drops `on*`; `name`→`id`; `href`/`xlink:href` via `isAcceptedUrl` (`:185-207`); `src`, `style`, `srcset`, `formaction` not checked; `<style>` kept.
- HTML notes sanitized whole since `3db47b575` (2020-02). Safe mode `<pre>${htmlentities}</pre>` (`955f724d3`).
- Mermaid 11.10.1 default config in viewer. KaTeX `trust` was `true` 2020–2026, now `\href`/`\url` safe schemes only (`katex.ts:43-56,357`). Fountain now sanitized.
- TinyMCE editor: strict CSP, default on (`TinyMCE.tsx:752-770`).

### Checkbox write-back
- Render: `- [ ]` with `token.map[0]` line, fallback `99999999`; inline `onclick` → `checkboxclick:<state>:<line>` (`checkbox.ts:69-97,129,159-165`).
- Toggle (`note-screen-shared.ts:509-552`): last field = line; finds `- [ ] `/`- [x] ` anywhere; **ignores claimed state**; rewrites whole line.
- No version/hash. Shifted text flips another checkbox silently `[inferred]`.

### Links and files
- `linkReplacement.ts:100-110`: inline `onclick`, `htmlentities` added after XSS (`57b4198d2`). `data-from-md` marks trusted anchors.
- Raw-HTML anchors posted to host (`webviewLib.js:93-123`). Viewer click checks `e.target`, not closest anchor (`index.html:833-839`).
- `openItem` → resource / note / `bridge.openItem` / `bridge.openExternal` (`openItem.ts:17-56`).
- `openExternal` allowlist `http: https: mailto: joplin:` (`bridge.ts:19,494-508`), only since `56ce951f3` (2026-09-20). 2022–2026 any scheme reached `shell.openExternal`.
- `openItem`: `pathExists` (NTLM leak on UNC, CVE-2026-49449 `[adv]`), then extension allowlist `isSafeToOpen` (`isSafeToOpen.ts:15-203`) else dialog.
- Remote images allowed (no proxy). `file://` media rewritten to `file-media` with key (`index.html:417-431`).

### Guards
- `will-frame-navigate` **main frame only** → `openExternal` (`ElectronAppWrapper.ts:394-402`). Subframe nav unblocked.
- `setWindowOpenHandler`: `about:blank` allowed (no Node), http(s) → browser, rest denied; recursive via `did-create-window` (`:405-425`).
- None: `will-navigate`, `will-attach-webview`, permission handler, CSP header.
- Drops: global `dragover`/`drop` preventDefault in main doc and viewer (`eventHandlerOverrides.js:6-7`, `index.html:819-831`).
- x-callback-url: command allowlist (`69826610a`); response target http(s) only (`8353a82fc`).

### Advisories (desktop + renderer)

| CVE / ID | Vector | Fix |
|---|---|---|
| CVE-2018-1000534 | HTML in note, webview with Node | `494e235e1`, `df302206d`, `72af56438` |
| CVE-2020-9038 | HTML notes unsanitized | `3db47b575` |
| #3143 | SVG `on*` | `41edae971` drop all `on*` |
| CVE-2020-15930 | `<embed>` | `57d750bc9` |
| CVE-2020-28249 | `<link>` | `fd90a490c` |
| CVE-2021-33295 | `<noscript>` parser differential | `9c20d5947` |
| CVE-2021-37916 | `<button>`/`<form>` | `feaecf765` |
| 2022-04 | content inside blocked tags | `774c20772` |
| CVE-2022-23340 | title, Goto Anything, main doc | `810018b41` |
| CVE-2022-35131 | same, again | `e797ebb86` `[inferred]` |
| CVE-2022-40277 | md link custom scheme → `openExternal` | `56ce951f3` (2026-09) |
| CVE-2022-45598 | fence lang into attr | `a2de167b9` / `762b4e88f` |
| 2023-05 | `<style>` raw `<` | `b26bc9ed5` |
| 2023-05 | `href=javascript:` | `09d7ddeb0` |
| CVE-2023-37298 | SVG `<use>` | `caf66068b` / `0b291915d` |
| CVE-2023-37299 | `<area href>` | `9e90d9016` |
| 2023-06 | quotes in `onclick` | `57b4198d2` |
| 2023-06 | x-callback any command | `69826610a` |
| CVE-2023-37898 | safe mode `<pre>` | `955f724d3` |
| CVE-2023-38506 | paste into RTE | `a0ec928fc` |
| CVE-2023-39517 | `<area target=_top>` | `7c52c3e9a`, `4d7399973` |
| CVE-2023-45673 | PDF link navigates top | `c2bfc526e` |
| 2024-02/04 | UNC / executable links | `836e23c08`, `8dc75efc4` |
| CVE-2024-40643 | `<.a<iframe src=javascript:>` parser differential | `b220413a9` |
| CVE-2024-49362 | mermaid label forges `data-from-md` | `d2028588e` isolation; `1a195e23d` `[inferred]` |
| 2024-10 | `_blank` window with Node; KaTeX error | `9d8cd1d70`, `591c458a4` |
| CVE-2024-53268 | OS scheme handler (Windows RCE) | code: `56ce951f3` (2026-09); advisory: 3.0.3 |
| CVE-2024-55630 | DOM clobbering via `name` | `e70efcbd6` |
| CVE-2025-24028 | comment mXSS | `2a058ed80` |
| CVE-2025-25187 | Goto Anything, 3rd time | `360ece6f8` `[inferred]` |
| CVE-2026-46650 | unanchored `isAcceptedUrl` regex | `9fdc2d4ad` |
| CVE-2026-49449 | KaTeX `\href{file://host}` NTLM | `b15472bc9` |
| CVE-2026-55105 | Fountain output unsanitized | `8e0812de9` |
| CVE-2026-105784 | whiteboard renders md into main doc | `7fb9ec93e`; CSP blocked script |
| GHSA-v9jp-q5hw-w3p3 | x-callback `x-success` any scheme | `8353a82fc`, `56ce951f3` |
| 2026-09 | `xlink:href` read by click handler | `56ce951f3` |
| CVE-2026-49453/55456 | sync `id: ../..` traversal | not reviewed |
| CVE-2026-22810 | OneNote import traversal | `791668455` `[adv]` |

- Rate: ~8 desktop/renderer advisories in 2026. Not converging.

### State at HEAD
- Better: viewer cross-origin + own process; main CSP without `unsafe-inline`; `openExternal` and `openPath` allowlists.
- Fragile: main still Node + no context isolation + remote; viewer no CSP, no sandbox; viewer can run any command, open URLs, read media, watch later notes; `source`-only checks, `'*'` posts; subframe nav unblocked; third-party renderer output trusted; checkbox unversioned.

## Hyper and Tabby (+ xterm.js)

### Summary
- Both: `nodeIntegration: true`, `contextIsolation: false`, `@electron/remote`. No isolation to copy.
- Real attacks came via **side channels into shell input**, not renderer XSS: dropped names, URL schemes typed into shells, output echoed as input, links to OS handlers.
- Packaging: missing or misspelled fuses + broad entitlements.

### Hyper
- No stated model. Plugins = trusted Node. Issue #3739 (2019) asked for `nodeIntegration: false`; closed.
- Window: Node on, isolation off, `navigateOnDragDrop: true` (`app/ui/window.ts:50-54`), remote (`:62`). Never sandboxed.
- IPC: uuid channel, no sender check (`app/rpc.ts:25-43`). Main exposes `child_process.exec`/`execFile` to renderer (`app/plugins.ts:467-473`).
- CSP `script-src 'self' 'unsafe-inline'` (`app/index.html:8`). Config `~/.hyper.js` = code (`app/config/init.ts:21`).
- News feed URL → `openExternal`, no scheme check (`notifications.tsx:48-55`).
- Links: WebLinksAddon → `openExternal` (`term.tsx:217-221`), http(s) regex. OSC 8 default handler: `confirm` + `window.open`; `setWindowOpenHandler` default `allow` (`window.ts:319-326`) → URL opens in Electron window `[inferred]`.
- Paste of copied files: `"'" + join("' '") + "'"`, no `'` escaping (`lib/utils/paste.ts:8-11`) → breakout `[inferred]`.
- Drop: navigation trick; path single-quoted, `'` escaped, **control chars kept** (`window.ts:229-242,300-308`); URLs raw; no bracketed paste. Tabby's `\x03 cmd\x0d.txt` PoC likely works `[inferred]`.
- `will-navigate` only catches drops; other schemes navigate (`:300-318`).
- `ssh://` handler on by default (`config-default.json:55`, `app/index.ts:200-207`) → types `ssh ${user}@${resource} -p ${port}\n` (`lib/actions/ui.ts:298-319`). Canary: no validation. `ssh://h;id` → host `h;id`; `ssh://u$(id)@h` → user `u$(id)` (checked with Node `URL`).
  - PR #7615 (`20a4ecf9`, `ddbaf367`, `b0c88b22`, master only): resource regex, `user` unchecked. No release after v3.4.1.
- CLI on mac: `exec('open -b ... ' + paths)` unquoted (`cli/index.ts:224-241`). Local only.
- Hyper ≤2.x: `<webview>` per pane opened by **PTY output** `bash: <url>: command not found` (`lib/actions/sessions.js:51-70`). Removed `d0f03f52` (2019-03).
- No fuses ever. Entitlements incl. `disable-library-validation`, camera, mic, contacts, calendars, location, photos.
- CVE-2024-23741 (≤3.4.1): RCE via RunAsNode / inspect fuses. Unfixed both branches.
- `c712e52b` (2019): `-add-new-contents` preventDefault. CVE-2025-7074: ReDoS in bundled rimraf, irrelevant.

### Tabby
- Model emerged from 2026 advisories: SSH/Telnet servers, file names, web pages, cat'd files. Fixes = prompts/allowlists; renderer stays privileged.
- Window: Node on, isolation off, preload `sentry.js` (`app/lib/window.ts:65-70`), remote (`:146`). Linux `--no-sandbox` (`app/lib/app.ts:71-72`).
- Permissions: check and device handlers return `true` (`window.ts:152-153`); no request handler → grant all.
- No CSP. `fastHtmlBind` → `innerHTML` for profile icons starting `<` (`fastHtmlBind.directive.ts:22`); profiles can come from config sync.
- pty IPC no sender validation (`app/lib/pty.ts:153-203`). `setWindowOpenHandler` deny (`window.ts:478-480`).
- Links: `allowNonHttpProtocols: true`; http/https/host-less `file:` (`decorator.ts:31-49`). URL regex any scheme (`handlers.ts:15-25`).
- Central `openExternal` (`platform.service.ts:157-195`): http/https/ftp/mailto direct; else dialog. `defaultId: 0` = Open on Enter.
- OSC pre-parser (`oscProcessing.ts`): `1337;CurrentDir` unvalidated, used for file-link resolution (`:66-73`); OSC 52 write silent apart from toast (`:77-81`).
- Paste: multiline warning, bracketed paste, does not strip `ESC[201~` (`baseTerminalTab.component.ts:545-595`).
- Drop (final): `getPathForFile`, strip C0/DEL, per-shell quoting, bracketed paste (`pathDrop.ts:23-73`).
- `tabby://` always registered (`app/lib/index.ts:38-45`): `run`, `paste` prompt (default accept); `profile`, `recent`, `quickConnect` no prompt (`tabby-core/src/cli.ts:23-73`).
- Plugins: npm with blacklist, full Node. Config sync https only since `ed3fbff5` (2026-05).
- Fuses set (`electron-builder.yml:119-122`). Entitlements: jit, unsigned-exec-mem, apple-events, camera, mic.

| ID | Root cause | Fix | Ver |
|---|---|---|---|
| CVE-2026-45037 | linkifier any scheme → `openExternal` | `fb9bec8e` central allowlist + confirm | 1.0.232 |
| CVE-2026-45035 (critical) | `tabby://run` no prompt (added `b31a4867`) | `9eff8499`, `6e47c2fb` | 1.0.233 |
| CVE-2026-45038 | dropped path raw to pty (`\x03`, `\r`) | `e70fafdf` strip C0/DEL | 1.0.233 |
| CVE-2026-46709 | `"..."` quoting expands `$()` | `e151472b` per-shell quoting + bracketed paste | 1.0.234 |
| CVE-2026-45036 | ZMODEM auto-reply + OSC 10 reply → globbing runs planted binary via `cat` | `91523067` prompt | 1.0.233 |
| CVE-2026-72903 | SFTP `..\` names | `3a4a4143`, `15f21c5d` `resolveInsideBase` | 1.0.235 |
| GHSA-8wmh | agent channel bridged with forwarding off | `b091dc51` | 1.0.236 |
| (none) | config sync over http → profile command | `ed3fbff5` | 1.0.233 |
| CVE-2025-22136 | fuse key misspelled, silently ignored | `73f97878` | 1.0.217 |
| CVE-2024-55950 | dyld env + library validation off → TCC bypass | `e1e6e1cd` | 1.0.216 |

- 2026-05-07 batch: external researchers, days apart. All local patches.

### xterm.js
- CVE-2019-0542: `DCS +q` / invalid `DCS $q` echoed payload as input. Fix `eeca95b6` (backport `3592c641`), 3.8.1/3.9.2/3.10.1.
- v6 core: OSC 0/1/2, 4/10/11/12 set **and query reply**, 8, 104/110-112 (`InputHandler.ts:292-331`). `windowOptions` default `{}`: all CSI t report ops off (`OptionsService.ts:51`, `InputHandler.ts:75-93`). DECRQSS known settings only.
- OSC 8 default: non-http(s) dropped unless `allowNonHttpProtocols`; activation `confirm` + `window.open` (`OscLinkProvider.ts:71-129`).
- WebLinksAddon default: `window.open`, http(s) regex (`WebLinksAddon.ts:21-35`).
- Bracketed paste does not strip `ESC[201~` (`Clipboard.ts:21-24`).
- `ClipboardAddon` answers OSC 52 `?` with clipboard contents by default (`ClipboardAddon.ts:33-54,72-78`).
- ImageAddon limits: pixels 16M, storage 128 MB, sixel 25 MB, iip 20 MB (`ImageAddon.ts:17-25`).

## Electron and app postmortems

### Postmortems: chat / collab

| App | Incident | Chain | Fix |
|---|---|---|---|
| Discord 2020 | CVE-2020-15174 (Electron) | Sketchfab embed DOM XSS → top nav (no `will-navigate` from cross-origin iframe) → contextIsolation off → prototype override → preload runs `nvidia-smi` | embeds off, sandbox, later isolation `[adv]` |
| Discord 2022 | ElectroVolt | video-embed XSS + `new-window` opens unsandboxed + V8 CVE-2021-21220 | `[adv]` |
| Slack 2020 | H1 #783877 | `<area>`/`<map>` bypass filter, `target=_blank` → overwrite desktop env functions | 4.4, no commit `[adv]` |
| Teams 2020 | Vegeris | displayName XSS + AngularJS/CSP bypass → `electronSafeIpc` download → `<webview>` with file as **preload**. Zero-click, wormable | `[adv]` |
| Signal 2018 | CVE-2018-10994 | linkifier on escaped HTML; Windows `<iframe src=\\share>`; `file://` CSP `'self'` matched UNC | `bfbd84f5` |
| Signal 2018 | CVE-2018-11101 | quote via `dangerouslySetInnerHTML` | `4e5c8965ff` + CSP `frame-src 'none'`; broken CSP syntax fixed `a4bc460d4c` |
| Signal | — | contextIsolation + sandbox only 2023 | `9374832e` |
| Element | CVE-2022-23597 | `element://` deep link → any `vector://` path → Jitsi XSS → V8 UAF → `userDownloadOpen({path})` → `openPath` | `89b1e39b` fixed URL; `99ce48be8c` opaque id → path map in main |
| Element | CVE-2023-30609 | search highlight on unescaped text | `bf182bc9` |
| Element | GHSA-9r5h-8m2x-w7q6 (2026) | URL preview `javascript:` | probably `417d73be` `[unverified]` |
| Mattermost | CVE-2019-20861 | webview `new-window` → unvalidated `openExternal`; deep-link argv | `eacd1c66`, `ee8f9191` |
| Mattermost | CVE-2024-37182 | redirect to `ms-excel:` → Chromium `openExternal` permission auto-granted | `1c9fc719` prompt; dialog close defaulted Allow, `dd4870f9` |
| Mattermost | CVE-2026-1628 | logging cleanup dropped `addWebContentsEventListeners` → preload exposed | break `e6027e3f`, fix `fdbc02cb` |
| Mattermost | CVE-2026-1046 | server help links → `openExternal` | `22fd6e2b` `isHttpLink` |
| VS Code | CVE-2021-43908 | see VS Code; also leaked origin via `@font-face` `Origin` | — |

- Commit ids are in each project's repo (full URLs not kept).

### Postmortems: markdown / notes
- Root cause in nearly all: Node on + isolation off. Obsidian still ships it in 2026 `[adv]`.
- Obsidian `[adv]`:
  - CVE-2021-38148 non-http(s) links without prompt.
  - CVE-2022-36450 `obsidian://hook-get-address` `x-success=file:///...%00` → `window.open`.
  - CVE-2023-27035 / 33244 embeds got mic/camera/notifications (no permission handler).
  - CVE-2023-2110 DOMPurify allowed `<iframe>`; remote page XHRs `app://local/C:/...`: privileged scheme, `ACAO: *`, empty referrer passes, no vault confinement.
  - CVE-2026-104077 reveal.js `data-background-iframe` → `iframe.src` `javascript:` → `parent.require()`.
  - CVE-2026-104078 MathJax `\href{java<TAB>script:}`; disputed.
- Typora `[adv]`, ~18 CVEs, sample:
  - Math `</script>` (CVE-2019-7295/7296); MathJax `\href` (CVE-2020-18748).
  - Mermaid: iframe `javascript:`/`srcdoc` (CVE-2020-18737, 21058), mXSS (CVE-2019-20374), `classDef` `</style>` zero-click (CVE-2026-82805).
  - `<svg><iframe srcdoc>` (CVE-2020-18221).
  - `file:`/`../` links launch apps on macOS (CVE-2019-12137, open).
  - `typora://app/` absolute path read (CVE-2023-2316), bypass `#/../../` (CVE-2023-2971).
  - `<embed>` of bundled `updater.html` with DOM XSS on main origin (CVE-2023-2317); iframes were converted to webview, embeds weren't.
- MarkText `[diff]`:
  - CVE-2020-27176 MathML mXSS → `b83bc5cd` `mathMl: false`.
  - CVE-2021-29996 / CVE-2022-21158 fence lang + `javascript:` → `0dd09cc6`.
  - CVE-2022-24123 `innerHTML = code` before mermaid → `c959d185` strict + sanitize.
  - CVE-2022-25069 / CVE-2023-2318 paste `innerHTML` → `fed1dac4`; 2318 open 2023–2026.
  - CVE-2023-1004 `.js` link → `openPath` → WSH → `abd81c1a`.
  - Root fix 2026 `fa84fc00` (isolation, sandbox, Node off).
  - Had `will-navigate` deny, window-open deny, `will-attach-webview` block since 2019. Didn't help: XSS ran in-page with Node.
- Zettlr `[diff]`:
  - CVE-2021-26835 iframe pre-render `innerHTML` → `53b544b2` host allowlist + click-to-load.
  - Root fix 2021 `7d702894` (Node off, isolation on); preload then exposed whole `clipboard` + `ipc`.
  - CVE-2022-40276 print preview unsandboxed `file://` iframe → file read → `6a91bb38` `sandbox=""`.
  - Sandbox off 2022 (Electron 20), back 2024 (`c1415bbf2`). Mermaid SVG unsanitized until 2026.
- Others:
  - Logseq: plugin README `marked` → `innerHTML` (CVE-2025-56683, `4cdf49ae`); pdf.js CVE-2024-4367 → `git.exec_command`; 2026 CERT.pl: IPC exec `shell: true`, unvalidated fs paths (unfixed).
  - Boostnote mermaid labels (CVE-2019-12136, `htmlLabels` false).
  - Notable CVE-2020-16608, Inkdrop CVE-2021-20745 / 2022-46603: markdown → RCE via Node.
  - HITCON 2023 (STAR Labs): paste as second channel (clipboard HTML with hidden `<embed>`).

### Electron checklist vs Tie (at research time, before Track A)

| # | Item | Default | Tie then |
|---|---|---|---|
| 5 | Permission handler | **grant all** | Missing |
| 7 | CSP | none | meta CSP; lacks `object-src`, `frame-src`, `base-uri`, `form-action` |
| 13 | `will-navigate` | allow | Missing, critical |
| 14 | `setWindowOpenHandler` | allow | Missing, critical |
| 15 | `openExternal` untrusted | — | not used yet |
| 17 | IPC `senderFrame` | — | Missing |
| 18 | avoid `file://` | — | shell on `file://` |
| 19 | fuses | mostly on | not flipped |
| 2-4, 6, 8-10, 20 | Node off, isolation, sandbox, webSecurity, etc. | — | OK |

- Default history: Node off 5; `webviewTag` off 5; isolation on 12; sandbox on 20; `new-window` removed 22; `protocol.handle` replaces `register*` 25; `ipcRenderer` can't cross bridge 29; cross-origin iframes need `allow=` 30; `File.path` removed 32; 44: subframe workers need `nodeIntegrationInSubFrames`.
- Confirmed in source:
  - No permission handler = grant all (`electron_permission_manager.cc:228-251,366-371`).
  - `navigateOnDragDrop` default false (`web_contents_preferences.cc:211,425`; `electron_browser_client.cc:500`).
  - Strict site isolation forced (`electron_browser_client.cc:1835-1838`).
  - Fuse `grantFileProtocolExtraPrivileges` default on: `file://` universal access, incl. child `file://` frames regardless of sandbox (`electron_browser_client.cc:488-491`; `docs/tutorial/fuses.md:131-149`).

### Electron advisories relevant (all fixed in 44)
- GHSA-hq2x-r82h-9wj4: popups from `allow-scripts allow-popups` iframes ran with app origin. 43.0.0.
- GHSA-gr2m-v5gq-v685: same, sandboxed top-level docs. 44.0.0-beta.5.
- GHSA-9f4c-93c8-jc8g: sandboxed iframe without `allow-popups` opened windows. 42.0.1.
- GHSA-p2rr-rvmm-c5fp: sandboxed iframes launched external protocols; `openExternal` granted by default. 42.0.0-beta.3.
- GHSA-r5p7-gp4j-qhrx, GHSA-9pf5-hg6p-4pwp: permission handlers got top-frame origin. Use `requestingUrl`.
- GHSA-v3j7-r9gq-3gjw, GHSA-j84w-jfhq-vhvj: `supportFetchAPI` without `corsEnabled` allowed cross-origin reads; `corsEnabled` not a mitigation. 44.0.0-beta.5.
- GHSA-h7rp-cf8h-j98x: isolation bypass via Promise prototype hijack. 42.0.0-beta.5.
- GHSA-ff2p-hmqr-hxm4: bridge copy honoured prototype setters. Workaround `Object.hasOwn`.
- GHSA-9qh4-3jw8-366w: `<webview>` enabling Node in workers. Strip in `will-attach-webview`.
- GHSA-mq8j-3h7h-p8g7 (2022): compromised renderer reached IPC. Validate `senderFrame`.
- GHSA-v64r-4m7r-3mvq: `net.fetch` redirect to `file://`. 42.0.0-beta.3.
- Lesson: iframe sandbox bypassed repeatedly in 2026. Backstops named every time: window-open deny + permission deny.
- ~40 Electron advisories in 2026. Source: advisories pages 1-7, read 2026-10-14.

### Isolation mechanics (source)
- Preload only in main frame unless `nodeIntegrationInSubFrames` (`renderer_client_base.cc:217-229`). Isolated world same (`electron_render_frame_observer.cc:131-142`).
- IPC Mojo bound only for primary main frame (`electron_browser_client.cc:1707-1723`). Compromised subframe can't call `ipcMain`.
- Consequences:
  - `window.tie` never in a subframe.
  - Same-origin subframe still reaches `parent.tie`. **Origin is the boundary, not preload scope.**
  - Main frame navigating anywhere gets preload + IPC. Hence navigation deny is critical.
- Sandboxed iframe:
  - No `allow-same-origin` → opaque origin, can't script parent.
  - `allow-scripts allow-same-origin` on same-origin URL = no boundary.
  - `kIsolateSandboxedIframes` on by default (`features.cc:1004-1015`); applies with origin-restricting sandbox + dedicated-process site (`navigation_request.cc:4720-4791`); Electron strict isolation (`site_info.cc:1276-1279`); no Electron override. `about:srcdoc` eligible. → own process, not runtime-tested.
  - `srcdoc` inherits parent CSP (spec), no base URL, no headers. Custom scheme: own CSP header, relative URLs (`standard`), handler controls subresources.
  - Never `file://` for content (fuse above).
- `<webview>` (`lib/browser/guest-view-manager.ts`):
  - Docs recommend against (`docs/api/webview-tag.md:3-10`).
  - Separate guest WebContents (`:113-117,215`). `will-attach-webview` with mutable prefs (`:108`).
  - Inherits only safe values from embedder (`:57-73`). `webpreferences` attr parsed with **no allowlist**; `preload` honoured (`parse-features-string.ts:52-54,83-85`). Rebuild prefs in `will-attach-webview`.
  - Pros: own partition, top-level context, DOM-placed. Cons: discouraged, event quirks.
- WebContentsView: child views stack **above** window's own view (`electron_api_browser_window.cc:99`; `docs/api/view.md:50-57`). Tie HTML can't draw over it. Geometry and focus pushed by IPC.

| Threat | Opaque sandboxed iframe (origin only) | Process boundary (OOPIF / webview / WCV) |
|---|---|---|
| `parent.tie` | blocked | blocked |
| top nav / popups | sandbox flags (bypassed 3× in 2026) | same for OOPIF; webview/WCV own handlers |
| renderer exploit | owns shell → RCE | owns content process only |
| Spectre reads of shell | possible | blocked |
| main IPC abuse | no binding | no binding |

### Keys and mouse (source)
- Cross-origin iframe, same webContents: keys go to focused frame's widget; `PreHandleKeyboardEvent` on same `WebContentsImpl` → `before-input-event` (`web_contents_impl.cc:4627-4645,4767-4802`; `render_widget_host_impl.cc:1820-1834`; `electron_api_web_contents.cc:1703-1722`).
  - Fires before the iframe sees the key; content can't block. Not runtime-tested.
  - Shell DOM `keydown` does not fire while iframe focused.
- `<webview>`: fires on guest, not embedder; not forwarded (`web-view-events.ts`). Unhandled guest keys → embedder menu (`electron_api_web_contents.cc:1659-1665`). Attach listener via `web-contents-created`.
- WebContentsView: listener per view. VS Code lets page go first (`browserView.ts:482-510`).
- macOS menu: unhandled keys → `performKeyEquivalent:` (`electron_api_web_contents_mac.mm:37-67`). Content can likely swallow non-reserved accelerators `[unverified]`.
- Mouse capture: only frame with last mousedown may capture, "prevents malicious frames ... from hijacking" (`render_widget_host_input_event_router.cc:656-670,2160-2177`). Shell drag should keep moves over iframes `[unverified]`.
- HTML5/OS drags over iframe go to iframe. Fix: `pointer-events: none` on content during drags and on window `dragenter`.

### Custom protocols
- Privileges (`electron_api_protocol.cc:37-44,143-176`): `standard` (needed for per-tile origins), `secure`, never `bypassCSP`, no `corsEnabled` for content, `supportFetchAPI` only if needed.
- Pitfalls:
  - Traversal: `path.resolve` + `path.relative` check (`docs/api/protocol.md:165-183`). Check after decoding (`..%2F`).
  - Obsidian CVE-2023-2110 traversal. Resolve symlinks first.
  - Use `request.initiatorOrigin`, not referrer.
  - `net.fetch` redirects: `redirect: 'error'`.
  - `session.protocol` scopes scheme per session.
- VS Code prior art: `vscode-file` roots + extension allowlist (`protocolMainService.ts:103-146`); `vscode-webview` 3 files.

### `shell.openExternal`
- macOS: `NSWorkspace openURL`, any registered scheme (`platform_util_mac.mm:115-146`).
- Dangerous: `file:`, `smb:`/`afp:`/`nfs:` (mount + open, Positive Security 2021 `[blog]`), app schemes.
- Links in web content need no app code: Chromium `HandleExternalProtocol` → `openExternal` permission (default granted) → OS (`electron_browser_client.cc:1035-1110`; `web_contents_permission_helper.cc:335-357`). Sandboxed subframes blocked unless top-nav tokens (`:1084-1104`).
- Safe use: `new URL()`; http/https (maybe mailto); never `file:`; user gesture + visible URL; main only.

# Cross-cutting patterns

| Pattern | Seen in |
|---|---|
| Privileged realm renders foreign HTML; every XSS = RCE | Joplin 2019–24 (same-origin iframe), Hyper, Tabby, Obsidian, Typora, MarkText ≤2026, Zettlr ≤2021, Discord, Slack, VS Code notebooks (CVE-2021-26437), Wave (markdown, paste, VDOM in shell realm) |
| Sanitizer bypass: blocklists, parser differentials, mXSS | Joplin (~15), Typora, MarkText, Obsidian (iframe allowed), Boostnote |
| Sanitizer on wrong layer: post-render extensions unsanitized (mermaid, KaTeX/MathJax, fountain, fence lang, reveal.js `data-*`) | Joplin (6 bugs), Typora, MarkText, Obsidian, Zettlr, Logseq, Boostnote |
| New UI renders content outside the isolated viewer | Joplin Goto Anything ×3, whiteboard; Signal quotes; Element search; Tabby profile icons; Wave paste `innerHTML`; MarkText/HITCON paste |
| `openExternal` / `openPath` without scheme or extension allowlist | Joplin (2022–2026), Tabby CVE-2026-45037, Mattermost ×3, Obsidian, MarkText `.js`, Element `openPath`, Wave, Hyper news feed, VS Code window-open |
| Chromium external-protocol permission auto-granted | Mattermost CVE-2024-37182, Electron GHSA-p2rr |
| Navigation / new-window guard missing, partial or bypassed | Discord (CVE-2020-15174), Mattermost CVE-2026-1628, VS Code meta refresh, Joplin (`_top`, PDF, `_blank`, subframes), Hyper default allow, Electron 2026 sandbox-popup GHSAs |
| No permission handler (grant all) | Wave, Hyper, Tabby (`() => true`), Joplin, Obsidian (CVE-2023-27035/33244) |
| Custom protocol / `file://` origin flaws: traversal, absolute paths, CORS, privileged origin serving user files | VS Code `..%2F`, Obsidian `app://`, Typora `typora://`, Signal UNC, Wave `stream-file`, Joplin `joplin-content://*` in main CSP |
| Message bridge too broad or weakly authenticated | Joplin (any command, string→URL, no origin, `'*'`), VS Code preview `e.source`, MPE `executeCommand`, Element renderer path, Logseq exec, Hyper `exec` IPC, Wave IPC any sender, Teams `electronSafeIpc` |
| Forged input across boundary | VS Code synthetic `KeyboardEvent` (2026); Teams preload via `<webview>`; Electron GHSA-9qh4 |
| Untrusted strings typed into a shell / output→input loops | Hyper `ssh://`, paste, drop; Tabby `tabby://run`, drop ×2, ZMODEM + OSC 10; xterm CVE-2019-0542; Hyper 2.x output opens webview |
| Secrets handed to untrusted realm | Wave session-wide authkey; Joplin media access key |
| Fuses / entitlements | Wave CVE-2025-12843, Hyper CVE-2024-23741 (unfixed), Tabby CVE-2025-22136 (misspelled key), CVE-2024-55950 |
| Partial fixes, regressions, unsafe defaults in fixes | Typora 2316→2971; Tabby 45038→46709; Hyper ssh fix master-only, incomplete; Mattermost guard dropped in refactor; dialogs defaulting to Allow/Open (Mattermost, Tabby) |
| Guards don't help when script runs in privileged page | MarkText (had all nav guards since 2019) |

Process lessons:
- Isolation must be the primary boundary. Sanitizer = defence in depth.
- Renderer compromise is realistic (V8 bugs: Element, Discord). Minimize what renderer can ask main.
- Test that guards are attached; refactors drop them.
- Verify fuses on the built binary; config alone proves nothing.

# Implications for Tie

## Adopted: Track A (done, `75cde6b`..`8b0ddf1`, `docs/SECURITY.md`)

| Guard | From pattern |
|---|---|
| Deny navigation (all frames) and redirects; only shell reloads | Discord, Mattermost, VS Code, Joplin; main frame always gets preload |
| `window.open` always denied | Electron 2026 sandbox GHSAs; Hyper default allow; xterm default `window.open` |
| `<webview>` attach denied until needed | Teams preload injection; `webpreferences` unallowlisted |
| Permissions denied on every session | Wave, Tabby, Obsidian; Electron grant-all default |
| Terminal links: hover URL, cmd-click, http(s) only, via main `openExternal` | Tabby CVE-2026-45037, Wave OSC 8, Joplin, Mattermost |
| Native drops are no-ops | Tabby drop CVEs, Hyper drop, Wave `file://` drop |
| IPC only from shell main frame (`shellIpc`) | VS Code `validatedIpcMain`, Electron GHSA-mq8j |
| Shell on `tie://app/`, traversal-safe | Electron checklist #18, Signal UNC, VS Code `..%2F` |
| Fuses: NODE_OPTIONS, inspect, file privileges off; asar integrity, only-asar, cookie encryption on; checked after package | Wave, Hyper, Tabby fuse CVEs (incl. misspelled key) |
| `sec-*` e2e scenario per guard; `// SECURITY:` comments | Mattermost CVE-2026-1628 regression |

- Choices made: cmd-click not shift (clashes with mouse-mode selection); no `mailto`.
- Deviation: `runAsNode` fuse **on** (CLI launcher needs it).

## Decided: Track B (content tiles, `discussion.md`)
- Strong isolation by default. Shell realm runs only Tie code.
- Sandboxed iframe, no `allow-same-origin`, per-tile origin `tie-content://<token>/`, served by `protocol.handle` in main (root-enforced, traversal-safe).
- CSP response header: `default-src 'none'`, own nonce'd script only. DOMPurify anyway.
- Markdown parsed inside the iframe (parser bugs stay sandboxed).
- `MessageChannel` handshake. Typed verbs only: `toggleTask(line, expected, rev)`, `openLink(url)`. Main re-validates.
- Checkbox write-back: shell rewrites the known file; verify file unchanged + line content before write (Joplin lacks this).
- Global keys move to main `before-input-event`.
- `pointer-events: none` on content during drags/resizes.
- Browser tile (later): `<webview>`, own partition, no preload, `will-attach-webview` enforced.
- Rejected:
  - Shell-realm render + sanitizer (Joplin, Wave, Typora history).
  - WebContentsView: stacks above HTML, breaks floats/shelf/menus (VS Code needs screenshot overlay manager).
  - `srcdoc`: inherits shell CSP, no subresource control.

Track B design notes from sources (not yet decided individually):
- Messages: check `event.source` **and** origin (`'null'`); post to exact target, never `'*'`; no string→URL fallthrough, no "run command" (Joplin).
- Never hand secrets to content (Joplin media key, Wave authkey).
- Never add `tie-content:` to shell `script-src` (Joplin `joplin-content://*`).
- One rendering path for foreign text; no shell-DOM HTML sinks (Joplin Goto Anything, whiteboard). Candidate lint rule.
- Sanitize final HTML, not per token; render mermaid/KaTeX inside the frame (Joplin, Typora, MarkText).
- No inline handlers in viewer, so CSP stays strict (Joplin can't have CSP because of them).
- Strip `meta http-equiv` refresh; `will-frame-navigate` limits frame to its own `tie-content://<token>/` (VS Code CVE-2021-43908).
- Protocol handler: decode, then resolve + containment check; realpath; root itself denied; `nosniff`; no `corsEnabled`, no `bypassCSP`; `initiatorOrigin` for access decisions.
- Keys: intercept list recomputed on keymap change; chord state in main, checked on every webContents; don't swallow Esc or native editing combos (Wave flaws; VS Code browser-view policy).
- Context menu: content posts `{x, y, context}`, shell draws HTML menu (VS Code).
- Iframes reload when re-parented: same constraint as xterm, already a Tie pattern.

## Open
- `runAsNode` fuse on: signed binary usable as Node (Wave CVE-2025-12843 class). Fix: `Tie --cli` mode in main, then fuse off (`docs/PENDING.md`).
- Remote images in markdown: block by default? Exfil by injected agents, LAN GETs (Wave leak).
- Agent HTML: scripts at all? If not, `sandbox=""`.
- Shell CSP still lacks `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, `frame-src tie-content:`; `style-src 'unsafe-inline'` allows UI spoofing by injected HTML.
- Paste: strip `ESC[200~`/`ESC[201~` and C0 (except `\t\r\n`) before `term.paste()`. Not done.
- xterm: keep `windowOptions` empty; no `ClipboardAddon` (answers OSC 52 reads); no new output→pty responders.
- Never open/navigate a tile from terminal output or OSC alone. Only user action or `tie` CLI.
- If Tie registers a URL scheme: treat as remote attacker; prompts default Cancel; spawn argv, never typed strings.
- Content tiles must never reach the `tie` socket (no preload, no `file:` access to `~/.config/tie/`).
- Preload input hygiene for `pty.spawn` (plain objects, `Object.hasOwn`, GHSA-ff2p).
- Runtime verification (harness): OOPIF placement (`processId` child vs main), `before-input-event` with iframe focus, pointer capture across iframes, OS drag over iframe, opaque-origin fetch to `tie-content:`, `srcdoc` CSP inheritance.
- Suggested harness additions: content-escape scenario (`parent.tie`, `top.location`, `window.open`, `file:`/`smb:` links); `tie-dev` frame-tree dump (origins, process ids).
- Keep Electron 44 on latest patch (~40 advisories in 2026).
- Browser tile: `<webview>` vs WebContentsView revisited when built; iframe unfit for arbitrary sites (framing headers, cookies).
