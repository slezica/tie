# Settings and Appearance

## File (`src/main/settings.ts`)

- Path per instance (`ARCHITECTURE.md`). First `dev` run copies `settings.json` to `settings.dev.json`.
- Loaded once at main startup; missing → defaults. Hand edits while running are not picked up.
- `sanitize()` at load and save: numbers clamped, wrong types → defaults. Theme alias `elegant-dark` → `tie-dark`.
- Unreadable / unparseable → defaults; Save blocked (file never overwritten), panel status shows why. Re-read on each `settings:get`/`set`, so fixing the file unblocks Save.
- `settings:set(patch)`: `validateSettings` (shell must resolve to an executable, `terminalTitle` a known mode), merge, write whole file (pretty JSON). Returns `{ok, settings}` or `{ok: false, errors: [{field, message}]}`.

| Key | Default | Scope | Values |
|---|---|---|---|
| `theme` | `tie-dark` | app | theme id |
| `borderless` | false | app | hide window controls |
| `tabBar` | `top` | app | `top` \| `bottom` |
| `shelfStyle` | `normal` | app | `normal` \| `compact` |
| `fontFamily` | `''` | all tiles | `''` = default stack |
| `fontSize` | 12 | all tiles | 8–32 px (markdown: base text size) |
| `lineHeight` | 1.15 | all tiles | 1–2 |
| `cellWidth` | 100 | all tiles | 70–150 % (kitty `cell_width`) |
| `shell` | `''` | terminal kind | command line; `''` = login shell (`TERMINALS.md`) |
| `terminalTitle` | `command` | terminal kind | `auto` (program's title, else command) \| `command` \| `directory` (`TERMINALS.md` "Observe") |
| `warnPasteControl` | true | terminal kind | confirm pastes/drops with control characters |
| `warnPasteRun` | true | terminal kind | confirm pastes that would run commands |
| `confirmExternal` | true | all tiles | confirm before a link opens in the system browser (`TILES.md` "Links out") |
| `allowExternalControl` | false | app | socket callers outside Tie terminals (scripts, other apps) may run commands (`CLI.md` "Callers"); only a real `true` counts |

- Scopes: app (UI + tiles), all tiles (content only, never chrome), tile kind.
- `shell` applies to new terminals only. Everything else applies live (renderer cache: `prefs.ts`, set at boot and after each save).
- Adding a setting: `Settings` + `DEFAULTS` + `sanitize` (main), `Settings` type (preload), `Appearance` + `applyAppearance` (if visual), `Prefs` + `applyPrefs` (if read synchronously), panel field + `draft()`.
- `terminalTitle` live: `prefs` updated, then every tile's `refreshTitle` (panel save).

## Panel (`src/renderer/settings.ts`)

- Open: menu / cmd+,; harness: `document.dispatchEvent(new CustomEvent('tie:settings'))` (toggles).
- Pages `Appearance` | `Terminal` (shell, terminal title, paste confirms) | `Security` (external control, link confirm) (last one remembered).
- Live preview (`applyAppearance(draft())`, `previewBorderless`). Cancel / Escape / backdrop reverts.
- Enter (not in a select) or Save saves. Errors: status line (else file path), field `.invalid`, jump to its page.
- Font list async (`queryLocalFonts`, else candidates), monospace only; fields don't wait for it.

## Themes (`themes.ts`)

- Theme = `{label, dark, accent, palette}` (xterm colors + 16 ANSI). Add one: entry in `THEMES`, nothing else.
- Content viewers get the theme over their port (markdown: bg, fg, accent, ANSI → code tokens; fonts: UI font for text, tile font for code). `MARKDOWN.md`.

## Color tokens

- `applyAppearance()` sets only `--bg` / `--text` (palette bg / fg), `--accent`, `--red` / `--green` / `--yellow` (ANSI 1–3).
- Everything else in `style.css` is `color-mix` of these (`--fg-a..d`, `--muted`, `--faint`, `--panel`, `--border`, `--bar-bg`, `--accent-soft`, `--app-bg`).
- Light themes: `:root.light`, `color-scheme: light`, softer `--shadow`.

## Fonts

- Vars `--tile-font`, `--tile-font-size`, `--tile-line-height`; xterm gets the same via `termOptions()` (live terminals updated + refit).
- Stack: chosen family, then `Hack, JetBrains Mono, SF Mono, Menlo, monospace`.
- Char width: emulated with xterm `letterSpacing`, which xterm rounds in *device* px. Delta computed in device px; nearest achievable width (at 2x: 0.5 CSS px steps). Re-applied on DPR change.
- Chrome uses `--ui-font` (system sans).

## Window options

`applyAppearance()` toggles `:root` classes; layout re-reads geometry, terminals refit.

- `borderless`: traffic lights hidden live; tab bar starts at left edge. Square corners need `frame: false` at window creation, so corners change on next launch. Top bar stays the drag region.
- `tabBar: bottom` (`.tabs-bottom`): `#tabs` moves to `#bottom` (drag region). Top strip stays for traffic lights; with `borderless` it collapses (`--top-h: 0`).
- `shelfStyle: compact` (`.shelf-compact`): `--shelf-w-compact`, icons only.
