# Settings and Appearance

## File (`src/main/settings.ts`)

- Path per instance (`ARCHITECTURE.md`). First `dev` run copies `settings.json` to `settings.dev.json`.
- Loaded once at main startup; missing → defaults. Hand edits while running are not picked up.
- `sanitize()` at load and save: numbers clamped, wrong types → defaults. Theme alias `elegant-dark` → `tie-dark`.
- Unreadable / unparseable → defaults; Save blocked (file never overwritten), panel status shows why. Re-read on each `settings:get`/`set`, so fixing the file unblocks Save.
- `settings:set(patch)`: `validateSettings` (shell must resolve to an executable, `terminalTitle` a known mode, `gitignore` a boolean, `bindings` below), merge, write whole file (pretty JSON). Returns `{ok, settings}` or `{ok: false, errors: [{field, message}]}`.

| Key | Default | Scope | Values |
|---|---|---|---|
| `theme` | `tie-dark` | app | theme id |
| `borderless` | false | app | hide window controls |
| `toolbar` | `bottom` | app | `top` \| `bottom` |
| `fontFamily` | `''` | all tiles | `''` = default stack |
| `fontSize` | 12 | all tiles | 8–32 px (markdown: base text size) |
| `lineHeight` | 1.15 | all tiles | 1–2 |
| `cellWidth` | 100 | all tiles | 70–150 % (kitty `cell_width`) |
| `shell` | `''` | terminal kind | command line; `''` = login shell (`TERMINALS.md`) |
| `terminalTitle` | `command` | terminal kind | `auto` (program's title, else command) \| `command` \| `directory` (`TERMINALS.md` "Observe") |
| `warnPasteControl` | true | terminal kind | confirm pastes/drops with control characters |
| `warnPasteRun` | true | terminal kind | confirm pastes that would run commands |
| `confirmExternal` | true | all tiles | confirm before a link opens in the system browser (`TILES.md` "Links out") |
| `gitignore` | true | file picker | walks skip what git ignores (`.gitignore` chain, `.git/info/exclude`, global excludes; inside repos only) |
| `allowExternalControl` | false | app | socket callers outside Tie terminals (scripts, other apps) may run commands (`CLI.md` "Callers"); only a real `true` counts |
| `bindings` | `{}` | app | key binding overrides, sparse: `{<action>: <chord> \| null}` (`INPUT.md` "Keyboard") |

- `bindings`: action ids and chord format in `core/keymap.ts` (`ACTIONS`, `chord()`). Present = customized (a customized `zoom-in` drops its hidden aliases); `null` = unbound.
    - `sanitize`: unknown actions, malformed / reserved chords dropped (those actions keep their defaults). Conflicts left: `resolveKeymap` is deterministic (overrides first, `ACTIONS` order).
    - `validateSettings` (`bindingErrors`): unknown action, malformed chord, reserved (Escape / Enter / Backspace with any modifiers, cmd+C/V/X/A/Z, cmd+shift+Z, cmd+,), no Cmd / Ctrl (function keys excepted), two actions on one chord (default aliases included). Default chords always pass (`Ctrl+Tab`). `field: 'bindings'`, message names the action(s).
    - A save replaces the whole object (no per-action merge). Applied live: main rebuilds the keymap (`keys.ts` `setBindings`) and the menu (Quit label).
- Scopes: app (UI + tiles), all tiles (content only, never chrome), tile kind.
- `shell` applies to new terminals only. Everything else applies live (renderer cache: `prefs.ts`, set at boot and after each save).
- Adding a setting: `Settings` + `DEFAULTS` + `sanitize` (main), `Settings` type (preload), `Appearance` + `applyAppearance` (if visual), `Prefs` + `applyPrefs` (if read synchronously), panel field + `draft()`.
- `terminalTitle` live: `prefs` updated, then every tile's `refreshTitle` (panel save).

## Panel (`src/renderer/settings.ts`)

- Open: menu / cmd+,; harness: `document.dispatchEvent(new CustomEvent('tie:settings'))` (toggles).
- Pages `Appearance` | `Bindings` (below) | `Terminal` (shell, terminal title, paste confirms) | `Files` (Respect .gitignore) | `Security` (external control, link confirm) (last one remembered).
- Live preview (`applyAppearance(draft())`, `previewBorderless`). Cancel / Escape / backdrop reverts.
- Enter (not in a select, not on a button) or Save saves. Errors: status line (else file path), field `.invalid`, jump to its page.
- Font list async (`queryLocalFonts`, else candidates), monospace only; fields don't wait for it.

## Bindings page (`src/renderer/bindings.ts`)

- `bindingsPage(section, settings.bindings, {message})` → `{value, focus}`. Edits its own draft; Save sends `bindings: value()` whole; Cancel drops it.
- Filter row (live):
    - `#bind-name`: case-insensitive substring of the action label.
    - `#bind-key`: capture field (`INPUT.md` "Capture fields"). Exact match on a complete chord, any chord the action answers to (hidden aliases included: `Cmd++` finds Zoom in). Empty = no filter.
    - Typing in one search clears the other.
    - Sliders (`.bind-custom`, `aria-pressed`): only customized rows. X (`.bind-clear`): clears both searches and the toggle.
- Table (`.bind-row[data-action]`, `ACTIONS` order): Action | Binding | pencil, X.
    - Binding: the override, else the default chord (aliases hidden); unbound = dim `—`.
    - Binding column width `--bind-w`: widest text over all rows (defaults + current, bold) + margin. Measured at open and after each change, never by filtering.
    - Customized (present in the draft): bold, X enabled. X = back to default.
- Edit (pencil): the cell becomes a focused capture field holding the current chord. Each chord replaces it; Backspace empties; Enter / blur accept; Escape cancels. Focus then returns to the row's pencil.
    - Same as now: nothing. Default chord: override dropped (not customized, aliases back). Empty: `null` (unbound).
    - Invalid (`validBinding`): unchanged; message on the status line.
    - Owned by another action (`conflicts` on the candidate draft, aliases included; also on X): dialog `.binding-conflict` naming both, Cancel / Replace. Replace: the other becomes `null` (customized). Focus back to the row after the dialog.
- Errors from main (`field: 'bindings'`): status line, `.bind-table.invalid`, jump to the page.

## Themes (`themes.ts`)

- Theme = `{label, dark, accent, palette, code?}` (xterm colors + 16 ANSI; `code`: optional code token colors `{comment, keyword, string, regexp, number, symbol, title, section, type, builtin, attr, variable, self, tag, meta, link, deletion, operator, punctuation, params, escape}` → `{color, italic?, bold?}`, sent to viewers as `--code-<token>` / `-style` / `-weight`; absent tokens fall back to the ANSI mapping in `viewers/highlight.ts`). Add one: entry in `THEMES`, nothing else.
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

- `borderless`: traffic lights hidden live; a top toolbar starts at the left edge. Square corners need `frame: false` at window creation, so corners change on next launch. The strips stay the drag region.
- `toolbar: bottom` (`.toolbar-bottom`, default): `#toolbar` in `#bottom`; the top strip shrinks to the system title bar (`--titlebar-h`) for the traffic lights, 0 with `borderless`. `top`: `#toolbar` in `#top`, no bottom strip (`TABS.md` "Toolbar").
