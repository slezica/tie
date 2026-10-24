# Terminal block glyphs (QR gaps)

Symptom: QR codes printed by `qr` and `offer` (half blocks `█▀▄`) show horizontal gaps between rows in Tie, even with `lineHeight: 1`. Kitty renders them seamless (`modify_font cell_height 120%`).

# Diagnosis

- Tie terminals use xterm.js's DOM renderer (no `@xterm/addon-webgl`). The DOM renderer draws every character with the font.
- Measured (MesloLGS Nerd Font Mono 13px, lineHeight 1, DPR 2): cell 17px (font ascent 13 + descent 4), `█` glyph 13.25px (ascent 10.0 + descent 3.25). ~3.75px gap per row. The gap is Meslo's metrics, not `lineHeight`.
- Kitty draws block and box characters itself (sprites that fill the cell), regardless of font.
- xterm's `customGlyphs` (default on) does the same, but only in the WebGL renderer: "doesn't work with the DOM renderer" (`node_modules/@xterm/xterm/typings/xterm.d.ts:80-87`).
- Box drawing (`┌──┬──┐`) has the same gaps.
- Sixel (`qr -render sixel`): Tie can't render it at all. It needs `@xterm/addon-image`, which isn't installed. Separate topic.

# Settled

1. Root cause: DOM renderer + font glyphs. No settings change fixes it.
2. Plain "WebGL everywhere" is not acceptable on addon 0.19: more than 16 terminals evicts contexts, including visible ones (Research §2).
3. Not worth waiting for upstream: the blocker fixes are open PRs or issues with no milestone (Upstream status).

# Pending

1. Whether to fix this at all at this stage of Tie. Leaning: not yet; complexity vs. benefit.
2. If fixed, which option (below).
3. Sixel support (`@xterm/addon-image` 0.9.0): independent of the glyph fix.

# Options

1. Stay DOM, generated block font: build a tiny font at runtime for U+2580–259F (+ U+2500–257F), sized to the current cell; `FontFace` with `unicodeRange`, first in the stack; regenerate on appearance change.
   - Pro: no GPU risks, no harness changes.
   - Con: needs a font writer (e.g. opentype.js); exact sizing depends on font, size, line height, DPR, fractional cell width. Untested.
2. WebGL behind a setting, with a Tie-owned context budget (Research "Recommended strategy").
   - Pro: block, box, powerline glyphs solid; xterm's own solution.
   - Con: a subsystem: budget, leak and context workarounds, atlas budget, GPU resets on display change and wake, letterSpacing per renderer, harness rewrite (17 scenarios read `.xterm-rows`).
3. Wait for xterm 7.0 / addon 0.20, reassess.
   - Pro: no work now.
   - Con: no date; the blockers aren't scheduled for it.

# Upstream status (2026-10-24)

- `@xterm/xterm`: latest stable 6.0.0 (2025-12-22); betas continuous (6.1.0-beta.315, 2026-10-13). Previous major gap: 5.5 → 6.0, 20 months.
- Only open milestone: 7.0.0 (464 closed, 7 open, no due date).
- Blocker items, none in a milestone:
  - #6074 atlas grows unbounded (issue, open).
  - #6187 clamp atlas pages (PR, open since 2026-09-24, no comments).
  - #6068 dispose doesn't release the WebGL context (issue, open).
  - #6115 wrong scale after DPR change (PR, open since 2026-08-18, no comments).
  - #4379 dozens of terminals on one page (issue, open since 2023).

# Research: WebGL renderer

Delegated research, 2026-10-24. Probes ran as ad-hoc harness scenarios (no `src/` changes): addon bundle evaluated into the UI page over CDP, Terminals found via `Runtime.queryObjects`. Probe scripts were not kept.

Citation keys:
- `[wgl]` = `@xterm/addon-webgl@0.19.0` tarball `src/` (npm pack).
- `[xt]` = `node_modules/@xterm/xterm/src/` (6.0.0).
- `[cr]` = Chromium `main` (raw.githubusercontent.com/chromium/chromium; Electron 44.9.3 ships Chromium 152.0.7977.167).
- `[vsc]` = `microsoft/vscode` `src/vs/workbench/contrib/terminal/browser/xterm/xtermTerminal.ts` (main).
- Tie paths relative to repo root.

---

### 0. Empirical probes (what was actually run)

Method: ad-hoc scenarios (no src changes). Addon bundle evaluated into the UI page over CDP; Terminal instances found via `Runtime.queryObjects(Object.prototype)` filtered by shape; addon loaded with `term.loadAddon`. Font: MesloLGS Nerd Font Mono 13 px, lineHeight 1.15, DPR 2 (`TIE_SCALE=2`). GPU: `ANGLE Metal Renderer: Apple M3 Max`, `MAX_TEXTURE_SIZE` 16384, `MAX_TEXTURE_IMAGE_UNITS` 16.

| # | Probe | Result |
|---|---|---|
| P1 | QR (`█▀▄`), box drawing, powerline, shades, braille: DOM vs WebGL | DOM: horizontal gaps in QR, gaps in `┌──┬──┐`. WebGL: solid QR, continuous box lines, shades as patterns. Braille still from font (0.19 doesn't cover it). |
| P2 | Cell geometry | DOM: 207 cols, cell 7.826 css (15.653 device). WebGL: 216 cols, cell 7.5 css (15 device). Rows identical (51, 19.5 px). |
| P3 | Screenshot of WebGL terminal, offscreen instance (default `drive`) | **Blank** terminal body. Canvas readback (`toDataURL`) has the content. |
| P4 | Same, `hiddenWindow` instance | Captured correctly. |
| P5 | 21 WebGL terminals in one UI renderer (20 opened `--shelved`) | 5 contexts lost: `t1` (the **visible**, active one) + 4 others. Console: "Too many active WebGL contexts. Oldest context will be lost." ×5; addon fires `onContextLoss` 3 s later. Lost canvas renders white with a sad-face icon. |
| P6 | Hostile output: random truecolor CJK, 15 + 150 screens, written straight to xterm | DOM: 52 ms/screen (worst 124). WebGL: 224–235 ms/screen while atlas grows; atlas reached 15 pages incl. two 16384² pages = **540 Mpx (~2.2 GB RGBA)**; JS heap 517 MB. No crash. |
| P7 | Cached content (same glyph/color set repeated) | Both frame-bound (33 ms per two rAFs): no throughput conclusion. |


---

### 1. Compatibility and bundling

**Change.** Add `"@xterm/addon-webgl": "0.19.0"` to `dependencies`.

- Exact match: 0.19.0 was published 2025-12-22 alongside xterm 6.0.0; its `package.json` `commit` is `f447274f…`, the same commit as Tie's `@xterm/xterm@6.0.0` and `@xterm/addon-fit@0.11.0` (`node_modules/@xterm/*/package.json`).
- Peer deps: 0.19.0 declares **none** (`npm view @xterm/addon-webgl@0.19.0 peerDependencies` empty). 0.18.0 declared `^5.0.0`. The 0.20 betas declare `^6.1.0-beta.x`, so they can't be used with 6.0.0.
- Bundle: `module` = `lib/addon-webgl.mjs` (126 KB minified, self-contained: it carries its own copies of xterm's `vs/base` + `common`; there's no runtime import of `@xterm/xterm`). Vite resolves `module`. Types: `typings/addon-webgl.d.ts` (`declare module '@xterm/addon-webgl'`, type-only import of `@xterm/xterm`).
- Scan of the bundle: no `eval`, `new Function`, `Worker`, `createObjectURL`, `fetch`. One `window.addEventListener('message')` used for `setTimeout0` (`vscodeScheduleAsyncWork`). xterm core already has the same listener (`xterm.mjs`), so this adds no new surface.
- Lazy load option: `await import('@xterm/addon-webgl')` gives a separate chunk served from Tie's own origin. Allowed by the UI CSP `script-src 'self'` (`src/renderer/index.html:11`).

**Problem.** The addon reaches into private core internals (`_core._renderService`, `_charSizeService`, … `[wgl] WebglAddon.ts:50-67`). That's fine only while both packages come from the same commit.
**Solution.** Pin all three exactly (already Tie's policy). Bump them together.
**Confidence.** High.

---

### 2. WebGL context limits (blocker-class)

**Facts.**
- Cap: 16 active contexts per renderer process on desktop, 8 on Android, 4 on workers. Source: `[cr] content/renderer/webgraphicscontext3d_provider_impl.cc:120-126`. Switch `--max-active-webgl-contexts=N` overrides both (`:128-137`). The switch is forwarded to renderers (`[cr] content/browser/renderer_host/render_process_host_impl.cc:3975`), so `app.commandLine.appendSwitch` works.
- Eviction: when a new context would exceed the cap, Chromium force-loses the context with the **oldest last flush** (`[cr] third_party/blink/renderer/modules/webgl/webgl_rendering_context_base.cc:452-482, 498-513`). Visibility is not considered. P5 confirmed it: the visible terminal was evicted.
- Restoration: an evicted context is only restored when another context is destroyed and the evicted list has room (`…base.cc:532-560`). The addon `preventDefault`s `webglcontextlost`, waits 3 s for `webglcontextrestored`, then fires `onContextLoss` (`[wgl] WebglRenderer.ts:110-131`).
- Tie's case: one UI renderer for all tabs (`docs/TABS.md`). Hidden spaces are `display:none` but still mounted (`src/renderer/render.ts:10-15`). Every terminal holds its context forever, so the **17th terminal anywhere in Tie kills one**, possibly a visible one. Content frames and browser guests run in other processes and don't count.
- `display:none` terminals don't render: the IntersectionObserver pause (`[xt] browser/services/RenderService.ts:123-150`) stops them. But their context still counts.
- Shelved tiles are `visibility:hidden` (`src/renderer/style.css:626-633`). They still "intersect", so they keep rendering into an invisible canvas.
- Dispose doesn't free the context: `WebglRenderer` dispose removes the canvas but never calls `WEBGL_lose_context` (`[wgl] WebglRenderer.ts:144-150`). The context lives until GC and still counts. Upstream #6068 is **open**, and was confirmed with xterm 6.0.0 + addon 0.19.0 in Obsidian using exactly a "dispose when hidden" strategy: live panes garbled after about 16 tab switches.
- Leak: `_cursorBlinkStateManager` isn't registered for disposal in 0.19 (`[wgl] WebglRenderer.ts:32`). Its `setInterval` (`CursorBlinkStateManager.ts`) keeps the disposed renderer, and through it the **whole Terminal plus 5000 lines of scrollback**, alive. The interval runs while focused, and Tie uses `cursorBlink: true` (`src/renderer/kinds/terminal.ts:54`). Fixed upstream in #5817 (merged 2026-04-21, 0.20 only). Tabby works around it (`tabby-terminal/src/frontends/webglAddon.ts`).

**Prior art.**
- VS Code: per terminal, `onContextLoss` → dispose → DOM (`[vsc]:958-961`). A load failure sets a static `_suggestedRendererType = 'dom'` for all later terminals (`[vsc]:130, 973-975`). No visibility-based release.
- Hyper (xterm 5): context loss → canvas addon (`lib/components/term.tsx:224-231`). The canvas addon no longer exists in xterm 6.
- Wave: context loss → `setTermRenderer("dom")` (`frontend/app/view/term/termwrap.ts:351-352`).
- Tabby: context loss → dispose (with the leak workaround), then recreate on reactivate or window focus, only when visible and focused, max 3 attempts, then DOM (`tabby-terminal/src/frontends/xtermFrontend.ts:53, 853-890`).
- xterm #4379 (open since 2023): "dozens of terminals" asks for one shared context. #6137 (open, experimental WebGPU addon) would remove the cap.

**Problems for Tie.**
1. More than 16 terminals → Chromium evicts by flush age → a visible terminal goes white (sad-face icon) for 3 s, then is gone unless handled.
2. Dispose/recreate churn (tab switching) leaks contexts until GC (#6068) and Terminals via the blink interval.
3. Renderer switch changes cell width (§3), so DOM fallback means different `cols` and a pty resize (SIGWINCH). Fine for rare fallback, bad on every tab switch.

**Solution options.**
- **A. WebGL everywhere + fallback on loss** (VS Code / Wave). Simplest, but past 16 terminals the victims are arbitrary, including visible ones. Not acceptable for Tie's many-tabs model.
- **B. Tie-owned GPU budget, visible terminals only** (recommended). One `gpu` module in the renderer:
  - Budget ≤ 14 live contexts (headroom below 16).
  - Acquire on show:
    - Space visible, not collapsed, not shelved-hidden.
    - Hook it into `Surface.resize()` *before* `fitTerm`, so the fit always measures the WebGL cell. Hidden → shown fires the host's ResizeObserver (0 → size), and that's the hook.
  - Release LRU-hidden first, only under budget pressure. Keeps recently used tabs warm and avoids churn on quick tab flips.
  - Release = `disposeWebgl(addon)`:
    - dispose `_renderer._cursorBlinkStateManager` (leak);
    - `addon.dispose()`;
    - `_renderer._gl.getExtension('WEBGL_lose_context')?.loseContext()` (#6068), after dispose, so the addon's own loss listener is already gone.
  - While released, xterm falls back to its DOM renderer (`[wgl] WebglAddon.ts:90-96`), paused while hidden. No fit runs while hidden: `fitTerm` skips bodies under 10 px (`terminal.ts:193-198`). So `cols` never flips and the pty sees no resize.
  - Over budget with more than 14 *visible* terminals: the extras stay DOM. Their cols differ from a GPU one, which is fine.
  - Unexpected `onContextLoss` (GPU reset): release, mark, retry on next show/focus, max N attempts (Tabby pattern), then DOM.
- **C. Raise the cap** (`--max-active-webgl-contexts=32/64`). Cheap, but:
  - It also applies to browser-guest renderers.
  - Every context costs a drawing buffer (§6).
  - It doesn't fix #6068 zombies or the leak.
  - Possible complement to B (headroom), not a substitute.
- **D. Stay DOM** (see §10 for DOM-side glyph alternatives).

**Confidence.**
- High: cap, eviction order, P5.
- High: #6068 and the leak (source + upstream reports).
- Medium: B's no-resize claim. It depends on every fit path going through `Surface.resize`. `appearance()` also calls `fitTerm` (`terminal.ts:106`) and needs the same guard.

---

### 3. Rendering differences vs DOM

| Topic | Change | Problem | Solution | Conf. |
|---|---|---|---|---|
| Custom glyphs (default `customGlyphs: true`, `[xt] typings/xterm.d.ts:80-87`) | 0.19 draws itself: U+2500–257F box (128), U+2580–259F blocks + quadrants, U+2591–2593 shades (patterns), U+1FB70–1FB8B, U+1FB95–1FB97 legacy, powerline U+E0A0–E0A2, U+E0B0–E0BF (`[wgl] CustomGlyphs.ts`, dispatch `:402-440`; `TextureAtlas.ts:516-518`). Fills the full cell incl. lineHeight/letterSpacing. | Braille U+2800–28FF, other legacy computing, progress U+EE00–EE0B, git-branch U+F5D0–F60D still use the font. Added only in 0.20 beta (`addon-webgl.d.ts` 0.20: `customGlyphs` moved to an addon option). | Accept; revisit on 6.1. | High (P1) |
| Cell width | WebGL floors device char width: `floor(charW·dpr)` (`[wgl] WebglRenderer.ts:566`). DOM keeps it fractional (`[xt] DomRenderer.ts:116`). Cell = char + `round(letterSpacing)` in both (`:583` / `:118`). | Meslo 13 px @2x: 15.65 → 15 device px: cells 4.2 % narrower (207 → 216 cols, P2). Glyphs overhang neighbours by 0.65 px. `appearance.ts:61-67` assumes the DOM formula, so `cellWidth: 100` ≠ natural width under WebGL. | Compute per renderer: `target = round(W·dpr·cellWidth/100)`; WebGL `letterSpacing = target − floor(W·dpr)` (here 16 − 15 = 1 → 8.0 css, +2 % vs natural); DOM as today. `char.left = floor(ls/2)` centres glyphs (`:587`). | High |
| Line height | Same formula both: `floor(ceil(charH·dpr)·lineHeight)` (`[wgl] :571-576`, `[xt] DomRenderer.ts:117-119`). Text centred via `char.top` (`:580`). | None: rows identical (P2). | — | High |
| Font loading / fallback | Glyphs rasterized once into the atlas with `ctx.font = … fontFamily` (`TextureAtlas.ts:500-503`); browser fallback still applies per glyph. Nerd Font PUA icons render (P1). | A web font loading late would be cached wrong. Tie uses system fonts only (`docs/TERMINALS.md` "Size"). Icons wider than 2 cells are clipped (`TextureAtlas.ts` allowedWidth = cell·max(len, 2)). | None needed. | High |
| Ligatures | Per-cell raster; joined runs only via a character joiner (ligatures addon). Tie has none. | A ligature font may show browser ligatures in DOM spans but not in WebGL (unverified; DOM row letter-spacing ≠ 0 likely disables them already). | Accept. | Low |
| Bold / italic / dim | Atlas uses `fontWeightBold`, italic, dim alpha (`TextureAtlas.ts:474-503`). | P1: equivalent. | — | High |
| Underline styles | Drawn in atlas: single, double, curly, dotted, dashed, overline, strike (`TextureAtlas.ts:532-690`). | Curly looks thinner than DOM (P1 image). Cosmetic. | — | Medium |
| minimumContrastRatio | Supported (`TextureAtlas.ts:394-409`). Tie leaves it at 1. | — | — | High |
| Transparency | `allowTransparency` false → canvas paints the opaque theme bg. | Tie's xterm bg = `--tile-bg` = `--bg` (`themes.ts:115-120`, `style.css:18`), so no visible change. `.xterm-viewport { transparent }` becomes moot. Image addon later wants `allowTransparency` (VS Code `[vsc]:284`). | — | High |
| Selection / cursor | Drawn in canvas from the selection model (`WebglRenderer.ts:228-234, 477-500`). Copy = buffer text (unchanged). | None observed. | — | Medium |
| DPR change (move between displays) | Core `onDprChange` → `handleDevicePixelRatioChange` (`WebglRenderer.ts:164-171`). Device-pixel box observer (`DevicePixelObserver.ts`). Atlas keyed by DPR. Tie's `watchDpr` re-applies options (`appearance.ts:79-86`) → `handleResize` (`[xt] RenderService.ts:94-109`). | Upstream #6115 (**open**): wrong scale after a DPR change (viewport/uniforms not updated on the device-box path). | On DPR change: recreate GPU addons (same mechanism as §2 release + acquire). Needs a real 2-display check. | Medium |
| Texture atlas growth | Atlas cached per (glyph, bg, fg, ext), never evicted. Pages 512² merge 4 → 1 up to `MAX_TEXTURE_SIZE` (16384), not the "forced" 4096 (`TextureAtlas.ts:150-197`, `:159`; `GlyphRenderer.ts:121-125`). | **P6: 540 Mpx (~2.2 GB) from untrusted output; 224 ms/screen.** Real triggers: truecolor half-block images (chafa/timg), gradients, heatmaps. Upstream #6074, #6187 open. | §7 "atlas budget": watch `onAddTextureAtlasCanvas` / pages, reset GPU when over budget (e.g. 64 Mpx). | High (measured) |
| Atlas clear | `clearTextureAtlas()` clears contents but keeps page sizes (`TextureAtlas.ts:1068-1075`). It can no-op (`:138-148`, #6238 open). In 0.19 it corrupts siblings sharing the atlas (#6014, fixed only in 0.20). Atlases are shared across terminals with equal config (`CharAtlasCache.ts`). | Can't shrink memory via clear. Recreating one terminal gets the same shared atlas back. | "GPU reset" = release **all** addons (last owner disposes the atlas, `removeTerminalFromCache`), re-acquire visible ones. | High (source) |
| Theme change | `onChangeColors` → new atlas config → re-raster (`WebglRenderer.ts:93, 157-162`). | Tie sets 5 options one by one (`terminal.ts:99-107`): up to 4 throwaway atlas configs per change (shared across terminals). | Accept, or set `term.options` keys before fit only. Minor. | Medium |
| macOS lock/unlock, Spaces, sleep | — | VS Code #311614 (**open**): garbled or solid-colour terminals after lock/unlock/Space switch, WebGL. #317969 duped into it. #6238 says `clearTextureAtlas` workaround can no-op. | Main `powerMonitor` `resume` / `unlock-screen` + window `show`/`focus` → renderer GPU reset of visible terminals. Unverified on Tie. | Medium-low |

---

### 4. Interactions with existing Tie code

| Item | Effect | Action |
|---|---|---|
| `fixWidthCache` (`terminal.ts:171-191`) | Patches `WidthCache.prototype` via the DOM renderer instance. With WebGL loaded first, `_renderer.value` is WebglRenderer, `_widthCache` is undefined, and it logs "shape changed, skipped" (misleading). The prototype patch persists, so a later DOM fallback (`_createRenderer()`, `[xt] CoreBrowserTerminal.ts:583-584`) is covered **only if** the patch ran once. | Keep order: `open` → `fixWidthCache` → load WebGL → fit. Still needed for DOM fallback until xterm ≥ 6.1. |
| `term.open` timing | Loading the addon before `open` defers `activate` to `onWillOpen` (`[wgl] WebglAddon.ts:51-54`). Then a WebGL2 failure throws *inside `term.open`* (`WebglRenderer.ts:88-91`). | Load after `open`, in `try/catch`. Failure → DOM + remember (VS Code static flag pattern). |
| Fit addon | Reads `_renderService.dimensions` (`addon-fit/src/FitAddon.ts:62`): works with either renderer. Cols change on renderer swap (P2). | Fit right after load (VS Code comment `[vsc]:963-964`). Never fit while a GPU-eligible terminal is temporarily DOM. |
| Runtime option updates (`terminal.ts:99-107`) | Trigger `handleResize` per option (`[xt] RenderService.ts:94-109`). Works. | letterSpacing formula per renderer (§3). |
| Zoom / collapse / float resize | Canvas realloc on each cols/rows change (`WebglRenderer.ts:173-204`). Collapsed = `.body` `display:none` → release candidate. | Unmeasured cost during drag-resize; check in a scenario. |
| Shelved tiles (`visibility:hidden`) | Keep rendering and hold contexts. | Treat unrevealed shelved tiles as hidden in the budget. |
| Tile close | `term.dispose()` disposes the addon → blink leak + zombie context. | `dispose` path calls `disposeWebgl` first. |
| CSS (`style.css:557-576`) | `.xterm` padding still holds. Canvas is inside `.xterm-screen`. Scrollbar rules unaffected. | None. |
| `keys.ts:15` (`xterm-helper-textarea`) | Textarea still exists. | None. |

---

### 5. Harness and scenarios

- **`.xterm-rows` disappears** with WebGL (P2 `hasRows: false`). Dependents:
  - `dev/helpers.mjs`: `termFit` (`:127-151`), `screen` (`:212`).
  - 10 scenarios via `h.screen`: content-watchdog, markdown-open, sec-focus, sec-drop, sec-mermaid, sec-paste, sec-paste-off, sec-socket, sec-socket-external, shelf-reveal.
  - Direct DOM reads:
    - `boot-settings.mjs:8` (fontFamily)
    - `cli.mjs:8`
    - `collapse-zoom.mjs:37`
    - `cwd-inherit.mjs:7`
    - `terminal.mjs:15`
    - `settings.mjs:10, 34, 45, 70` (bg, span width for cellWidth, font)
    - `sec-links.mjs:15` (word positions for clicks)
- **Text access options:**
  - (a) Dev-only renderer hook, e.g. `window.tieDev.term(id) → {lines, cursor, cols, rows, cell, renderer, contexts}`, compiled only into dev builds. Never over the socket: `TERMINALS.md` "No terminal read over the CLI".
  - (b) My probe's CDP heap query (`Runtime.queryObjects`). It works with zero src changes but is slow and fragile.
  - (a) is recommended.
- **`sec-links`** needs click points from buffer coordinates: find the word in `buffer.getLine(y).translateToString()`, x = `.xterm-screen` left + col·cell.width.
- **`terminal-fit`:**
  - With WebGL, check: canvas css size == `cols × css cell`, and the screen is inside the body.
  - The "text past its row" check is DOM-only.
  - Keep a DOM run of the scenario so `fixWidthCache` stays covered (forced-DOM switch).
- **Screenshots:**
  - Offscreen (`TIE_BACKGROUND=1`) captures a **blank** WebGL terminal (P3); hidden window works (P4). Root cause not investigated (likely OSR compositing of GPU canvases).
  - `tie-dev screenshot` on a visible instance should be fine (real window).
  - Options:
    - (a) `hiddenWindow` for pixel scenarios;
    - (b) dev flag `preserveDrawingBuffer` + helper that composites `canvas.toDataURL()` into `ctx.shot`;
    - (c) env `TIE_TERM_RENDERER=dom|webgl` so unrelated scenarios stay DOM in OSR.
- **WebGL itself works offscreen** (context, render, readback: P3 data URL, P5 cap). So logic tests (budget, loss, fallback) run in default `drive`.
- New scenarios:
  - `terminal-gpu`: budget, eviction never hits a visible tile, fallback, recreate.
  - `terminal-glyphs`: hidden-window pixel check of QR rows, no gap rows.
  - `terminal-atlas`: hostile output → atlas stays under budget.
  - Leak check: close N focused terminals → heap `queryObjects` count of Terminals returns to baseline.

---

### 6. Accessibility and text access

- Screen reader: Tie doesn't enable `screenReaderMode`. When on, `AccessibilityManager` builds its own DOM tree (`[xt] CoreBrowserTerminal.ts:554-559`), independent of the renderer. Change: without it, there's no readable text in the DOM at all under WebGL (DOM renderer rows were at least present). Confidence medium (VoiceOver not tested).
- Selection / copy: `SelectionService` reads the buffer, so no change. Rendering verified (P1/P2).
- Links: OSC 8 `linkHandler` is renderer-independent. The underline is drawn by `LinkRenderLayer` (2D canvas `xterm-link-layer`, seen in P2).
- Find: Tie has none. Native text selection/find in the DOM was never xterm's path anyway.
- Confidence: high for copy/links, medium for a11y.

---

### 7. Performance and memory

- GPU memory per terminal ≈ drawing buffer `cols·cellW × rows·cellH × 4 B`, ×2 for double buffering. P5: maximized 3240×1990 = 25.8 MB, ~52 MB with the back buffer. Quarter-screen ≈ 13 MB. Plus per-context texture copies of atlas pages (1 MB per 512² page, typical 1–9 MB). The JS-side atlas canvas is shared per config.
- CPU:
  - Steady state is frame-bound for both in P7. No throughput number; a real benchmark needs pty-fed `cat` of a large file with `performance` marks.
  - New-glyph rasterization (`getImageData` per glyph, `TextureAtlas.ts:440-700`) is main-thread and **slower than DOM under colour churn** (P6: 224 vs 52 ms/screen).
- Idle: cursor blink rAF in both. Hidden spaces paused in both (IntersectionObserver). Shelved tiles render in both.
- Atlas budget (from §3): sum page pixels, observed via `onAddTextureAtlasCanvas` + private `_renderer._charAtlas.pages`. Over the threshold → GPU reset. Alternative hack: set the static `TextureAtlas.maxTextureSize = 4096` after the first load (GlyphRenderer only sets it when unset, `GlyphRenderer.ts:121-125`). That mirrors #6187 but may hit the merge edge case when all pages are at max (unverified). Prefer the reset.
- GPU process crash: all contexts lost.
  - Restore within 3 s → addon re-inits (`WebglRenderer.ts:122-131`); else `onContextLoss`.
  - Repeated crashes → software compositing. WebGL then fails: SwiftShader WebGL fallback is deprecated/removed in recent Chromium (blink-dev "Intent to Remove: SwiftShader Fallback"; opt-in `--enable-unsafe-swiftshader`).
  - `getContext('webgl2')` null → ctor throws → DOM.
  - Log `app.on('child-process-gone')` type `GPU` in main.
- `app.disableHardwareAcceleration()` / `--disable-gpu`: same, WebGL unavailable → DOM. Fine with the try/catch.
- Harness instances: each fresh instance gets real GPU contexts (ANGLE Metal). Parallel `test --e2e` instances each have their own cap. Fine.

---

### 8. Security (`docs/SECURITY.md`)

- Fuses (`electron-builder.yml:30-39`): unaffected.
- UI CSP: unaffected (no workers/eval/blob). `sec-csp` comment about xterm's injected `<style>` still holds.
- Realms: WebGL runs only Tie's code in the UI realm. Content never in the UI realm, so no content-controlled shaders. Untrusted terminal output only picks glyphs, colours and atlas growth.
- GPU process: the UI renderer already talks to it (compositing, 2D canvas). WebGL adds command-buffer surface reachable by Tie's own code only. Marginal.
- **New availability issue (untrusted output):**
  - (1) atlas growth to GB (P6);
  - (2) more than 16 terminals → a visible terminal blanks.
  - Neither leaks data. Both deserve guards + scenarios under Tie's "every guard has a scenario" rule (red first: P6 is the red).
- `--max-active-webgl-contexts`, if used, also raises the cap for browser-guest renderers (web pages). Minor.
- Confidence: high.

---

### 9. Known open bugs relevant to 0.19 + xterm 6.0, macOS, Electron

| Issue | State | Impact on Tie | Workaround |
|---|---|---|---|
| xterm #5818 / PR #5817: blink interval leak (`WebglRenderer.ts:32`) | Fixed in 0.20 only | Closed focused terminal leaks Terminal + scrollback | Dispose `_cursorBlinkStateManager` before `addon.dispose()` (Tabby) |
| xterm #6068: dispose doesn't release the context | Open | Churn → zombies → live terminals evicted | `WEBGL_lose_context.loseContext()` after dispose |
| xterm #6074 / #6187: atlas unbounded, pages up to `MAX_TEXTURE_SIZE` | Open | GB memory from output (P6) | Budget + GPU reset |
| xterm #6238: `clearTextureAtlas` no-op after merge/clear | Open | Clear unreliable | Reset via recreate, not clear |
| xterm #6014: clear corrupts sibling terminals sharing the atlas | Fixed after 0.19 (2026-07) | Don't call clear | Same |
| xterm #5929: atlas cache equality ignored cell size / max texture | Fixed after 0.19 | Low (cell size derivable from letterSpacing + char size in Tie) | — |
| xterm #6115: wrong scale after DPR change | Open | Moving window Retina ↔ external display | Recreate on DPR change |
| xterm #4379: many terminals per page | Open (WebGPU PR #6137 experimental) | Root cause of §2 | Budget |
| VS Code #311614 (+#317969): corruption after macOS lock/unlock/Spaces | Open | Likely on Tie (same stack) | Reset on resume/unlock/focus |
| VS Code #332859: braille/truecolor animation in one terminal corrupts all others (shared atlas) | Open | Shared atlas across Tie terminals | Budget/reset; unverified |
| xterm #4728: DPR mismatch under devtools emulation | Open | Not observed in OSR at scale 2 (P2: canvas 3240 = 216·15) | — |

---

### 10. Alternatives that keep the DOM renderer (for the QR bug only)

- **Wait for xterm 6.1 / addon 0.20.** Fixes the leak, atlas family #6014, wider custom glyphs (Braille, progress, git). Still open there: #6068, #6074, #6115, VS Code #311614. 6.1 is still beta (beta.315, 2026-10-13); 6.0 shipped 2025-12-22. The DOM renderer in 6.1 beta has no custom glyphs (`src/browser/renderer/dom/` has no glyph code; option docs still say DOM unsupported).
- **Generated block font (DOM).**
  - Build a tiny font at runtime for U+2580–259F and U+2500–257F, sized to the current cell (fontSize, lineHeight, DPR).
  - Load it via `new FontFace(name, arrayBuffer, {unicodeRange})` and prepend it to the font stack.
  - Rows clip vertically, so oversized glyphs fill the cell exactly.
  - Needs a font writer (e.g. opentype.js) and has to be regenerated on appearance change. Width must equal the DOM cell (fractional).
  - Untested idea. Medium-high effort, low blast radius.
- **WebGL opt-in setting** (`terminalRenderer: dom | gpu`) with option B machinery. Lets the user pick quality vs risk while upstream matures.

---

### Recommended strategy

1. Don't flip globally on 0.19 without the budget. Plain "WebGL everywhere" breaks Tie at 17 terminals, the normal multi-tab case.
2. Implement option B as a `gpu.ts` module in `src/renderer/kinds/`, behind a setting (`terminalRenderer: 'auto' | 'dom'`; `auto` = WebGL when available):
   - budget 14, LRU over hidden terminals, acquire before fit;
   - `disposeWebgl` = blink-leak workaround + dispose + `loseContext`;
   - unexpected loss → mark, retry on show/focus (3 attempts), then DOM;
   - "GPU reset" (release all, re-acquire visible) on: atlas over budget, DPR change, `powerMonitor` resume/unlock, window show;
   - letterSpacing formula per renderer (`appearance.ts`);
   - order `open → fixWidthCache → gpu acquire → fit`, all in `try/catch`.
3. Docs: `TERMINALS.md` "Size" + new "GPU" section. `SECURITY.md` rows for the atlas budget and context budget. This record.
4. Re-evaluate on xterm 6.1 / addon 0.20 stable. Drop workarounds as fixed: #5817, #6014, plus whichever of #6068/#6187 land.
5. Alternative if the machinery feels too heavy: stay DOM, wait for 6.1, and try the generated-font approach for blocks only.

### Harness / scenario changes needed

1. Dev-only renderer hook `tieDev.term(id)`: lines, cols, rows, css cell, renderer kind, live contexts, atlas pixels.
2. `helpers.mjs`: `screen()` via the hook. `termFit()` with WebGL and DOM branches. New `wordPoint(ctx, id, word)` for clicks.
3. Rewrite the direct `.xterm-rows` reads: boot-settings, cli, collapse-zoom, cwd-inherit, terminal, settings (cellWidth via hook), sec-links.
4. Env/setting to force a renderer per instance (`TIE_TERM_RENDERER`), so `terminal-fit` runs both, and OSR pixel-free scenarios can stay DOM if desired.
5. Screenshots: `hiddenWindow` for terminal-pixel scenarios, or dev `preserveDrawingBuffer` + canvas composite in `ctx.shot`. Document the OSR blank-canvas behaviour in `HARNESS.md`.
6. New scenarios:
   - `terminal-gpu`: 20+ terminals across tabs; visible never evicted; tab flip keeps pty sizes (`assertPtySizes`); context loss → fallback → recovery.
   - `terminal-glyphs`: hidden window; QR/box rows without background gaps (pixel scan).
   - `terminal-atlas` (security-style, red first): hostile truecolor output keeps atlas under budget.
   - `terminal-leak`: close focused terminals; Terminal count via heap query returns to baseline.
7. Main log of GPU process loss (`child-process-gone` type GPU) so `app.log` explains blank terminals.
