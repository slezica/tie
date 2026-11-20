# Settings and Appearance

## File (`src/main/settings.ts`)

- Where: shape and pure rules in `src/core/settings.ts` (`Settings`, `DEFAULTS`, `sanitize`, `parseSettings` (text → settings: the one parse for startup and Reload), `fileChanged` (disk vs baseline), `validateSettings(s, executable)`, `parseCommand`; unit tests `settings.test.ts`). Main (`src/main/settings.ts`): the file (load, baseline, watch, save, Reload / Ignore / Recreate), shell argv, `resolveExecutable` (passed to `validateSettings`).
- Path per instance (`ARCHITECTURE.md` "Instances").
- Loaded once, at startup; missing → defaults. Never auto-reloaded: a hand edit while running is only reported (banner, below).
- Written only by an explicit user action: the panel's Save, and "Recreate with defaults" in the startup dialog (+ its `.bak`). Never by startup, load / sanitize (adjusted values stay in memory: a file saying `fontSize: 200` keeps saying it), opening / cancelling the panel, previews, Ignore, Reload or the watcher. One exception: the first `dev` run (no `TIE_SETTINGS`, no `settings.dev.json` yet) copies `settings.json` to `settings.dev.json`: a one-time seed of a new dev instance's own file, never the installed app's; it is that run's baseline (no banner).
- `sanitize()` at load, Reload and save: numbers clamped, not a number (or 0) → default, numeric strings count; wrong types → defaults; `allowExternalControl` only on a real `true`. Load and Reload also: merged over `DEFAULTS`, theme alias `elegant-dark` → `tie-dark`; not a JSON object → a syntax error.
- Baseline: the file's content as last loaded or written by Tie (missing and unreadable are baselines too). Changed = the disk's content differs (content, not mtime: a touch or an identical rewrite is no change). Tie's own writes set the baseline in the same tick: they never count as a change.
- Watch: main watches the file for the whole run (`watch.ts`: directory watch, survives rename saves; stable reads), recomputes "changed" fresh on each event and pushes `settings:file {changed, path}`, also when it flips back (the edit undone). Nothing applied. Latency: the watcher's debounce, 100 ms (max 500; `settings-file` logs it).
- Panel banner (`.settings-banner`, top strip over every page): `Settings changed in <path>`, `Ignore` / `Reload`; Save disabled while it shows. `settings:get` returns `changed` read fresh, so it shows at first paint; the panel follows the push while open. Closed panel: nothing shows.
    - Ignore (`settings:ignore`): baseline := the disk content, nothing loaded; banner gone, Save enabled, even with no panel change (a Save then overwrites the file). A further change raises it again.
    - Reload (`settings:reload`): the file parsed as at startup (same trust: `sanitize`, no `validateSettings`), applied live as after a Save, baseline := it, panel rebuilt from it (unsaved panel edits dropped). Fails (syntax, unreadable): a second banner line with the reason, banner and disabled Save stay; Ignore still works.
    - Main's guard (`saveRefusal`): `settings:set` refuses `{field: 'file', message: 'Settings changed in <path>'}` while the disk differs from the baseline (closes the race between an edit and the click).
- Startup with a file that doesn't load: Tie runs on defaults (memory), the file untouched; once the UI is up, a dialog (`.dialog.settings-load`): `Syntax errors in your settings file, at <path>.` + the parser's message; `Close` (focused: Enter keeps the file) / `Recreate with defaults`. Unreadable (permissions): `Can't read your settings file, at <path>.`, `Close` only.
    - Close: nothing written. Save stays blocked (`{field: 'file'}`, status line: `Syntax errors in the settings file, fix it (or recreate it) before saving: …` / `Settings file unreadable, …`) until the file is fixed on disk (banner → Reload) or the user picks Ignore.
    - Recreate (`settings:recreate`, syntax errors only): the file's bytes copied to `<name>.bak` beside it (0600, replaces an older one; named in the button's tooltip), then defaults written, baseline set, Save unblocked, applied. Fails: `Couldn't recreate the settings file` dialog.
- `settings:set(patch)`: refused while the file is broken or changed (above); else `validateSettings` (shell must resolve to an executable, `terminalTitle` a known mode, `gitignore` a boolean, `bindings` below), merge, sanitize, write whole file (pretty JSON). Returns `{ok, settings}` or `{ok: false, errors: [{field, message}]}`.

| Key | Default | Scope | Values |
|---|---|---|---|
| `theme` | `tie-dark` | app | theme id |
| `borderless` | false | app | hide window controls |
| `bars` | bottom: tabs \| shelf, templates | app | layout of the bars ("Window options"); panel: Appearance, Layout row |
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
    - `sanitize` (`cleanBindings`): unknown actions, chords `validBinding` refuses (malformed, reserved, no modifier) dropped (those actions keep their defaults); not an object → `{}`. Conflicts left: `resolveKeymap` is deterministic (overrides first, `ACTIONS` order).
    - `validateSettings` (`bindingErrors`): not an object, unknown action, malformed chord, reserved (Escape / Enter / Backspace with any modifiers, cmd+C/V/X/A/Z, cmd+shift+Z, cmd+,), no Cmd / Ctrl / Alt (Shift alone or a bare key: refused; function keys excepted; `Alt+A`, `Ctrl+C` allowed: left to the user), two actions on one chord (default aliases included). Default chords always pass (`Ctrl+Tab`). `field: 'bindings'`, message names the action(s).
    - A save replaces the whole object (no per-action merge). Applied live: main rebuilds the keymap (`keys.ts` `setBindings`) and the menu (Quit label).
- Scopes: app (UI + tiles), all tiles (content only, never chrome), tile kind.
- `shell` applies to new terminals only; `borderless` corners at next launch (below). Everything else applies live after Save, Reload, Recreate: main (window, bindings + menu) and the UI's `applySettings` (`applyAppearance`; `applyPrefs`: renderer cache `prefs.ts`, also set at boot; every tile's `refreshTitle`, for `terminalTitle`).
- Adding a setting: `Settings` + `DEFAULTS` + `sanitize` (`core/settings.ts`, + a unit case), `Settings` type (preload), `Appearance` + `applyAppearance` (if visual), `Prefs` + `applyPrefs` (if read synchronously), panel field + `draft()`.

## Panel (`src/renderer/settings.ts`)

- Open: menu / cmd+,; harness: `document.dispatchEvent(new CustomEvent('tie:settings'))` (toggles).
- Pages `Appearance` | `Bindings` (below) | `Terminal` (shell, terminal title, paste confirms) | `Files` (Respect .gitignore) | `Security` (external control, link confirm) | `About` (last, under a separator; read-only: Tie version, instance, Electron / Chromium / Node versions, settings and log paths with `~`, full path in the tooltip; from `settings:get` `about`) (last one remembered).
- Live preview (`applyAppearance(draft())`, `previewBorderless`). Cancel / Escape / backdrop reverts.
- The draft (`draft()`, `patch()`): every field, plus `bars` (Layout row, below) and `bindings` (Bindings page).
- Save is enabled only with something to save: a panel value differs from the active settings (compared on every `input` / `change`, binding edit and layout change; a value put back disables it again), or after Ignore in this panel (the file differs: Save overwrites it). Always disabled under the banner.
    - Compared: bindings as a map (key order ignored); `bars` structurally (`sameBars`: order within a list matters); the rest by value.
- Only the Save button saves. Enter in a text / number field or a select: done with it, focus to the panel itself (`.settings`, keeps Escape); value kept. On a focused button Enter presses that button; capture fields: their own Enter (accept). Errors: status line (else file path), field `.invalid`, jump to its page.
- Font list async (`queryLocalFonts`, else candidates), monospace only; fields don't wait for it.
- Status line (`.status`, bottom left): the settings file path, or what blocks Save. Paths shown with `~` (as the banner and the startup dialog); the full path is the tooltip.

## Layout row (Appearance > Window)

- `.layout-row`: title "Layout", summary below (`#set-layout-summary`), buttons `Reset` (`#set-layout-reset`), `Modify` (`#set-layout-modify`).
- Summary (`barsSummary`, `core/bars.ts`): each bar in use, its components in visual order: `Bottom: Tabs, Shelf, Templates`; `Top: Tabs · Left: Shelf, Templates`. From the draft.
- The layout is a draft value like the theme: previewed live, in `patch()`, compared in `dirty()`, persisted by Save, reverted by Cancel.
- `Reset`: draft layout := `defaultBars()`, previewed. Disabled when the draft already is the default.
- `Modify`: the edit layout mode (`LAYOUT.md` "Edit mode"). The panel hides (`.settings-backdrop.away`; draft and fields kept) and returns on:
    - `Done`: the mode's layout becomes the draft (previewed, summary and Save state refreshed).
    - `Cancel` / Escape: the draft unchanged, re-applied (the layout as when the mode opened).
    - Focus back on `Modify`.
- The mode never writes the file. Only Save does.
- While the mode runs:
    - Banner (file changed on disk): updates in the hidden panel; seen on return (Save disabled under it). Reload can't be reached meanwhile.
    - Panel closed or rebuilt under it (menu `cmd+,` toggles the panel: its Cancel; Reload rebuild): the mode ends first as Cancel (`abortLayoutEdit`), then the panel acts (Cancel reverts to the saved layout).

## Bindings page (`src/renderer/bindings.ts`)

- `bindingsPage(section, settings.bindings, {message, change})` → `{value, focus}`. Edits its own draft; Save sends `bindings: value()` whole; Cancel drops it.
- Filter row (live):
    - `#bind-name`: case-insensitive substring of the action label.
    - `#bind-key`: capture field (`INPUT.md` "Keyboard", capture fields). Exact match on a complete chord, any chord the action answers to (hidden aliases included: `Cmd++` finds Zoom in). Empty = no filter.
    - Typing in one search clears the other.
    - Pencil toggle (`.bind-custom`, `aria-pressed`, tooltip "Only customized"; the rows' edit icon: customized = edited): only customized rows. Pressed: accent icon, border, soft accent fill. X (`.bind-clear`, tooltip "Clear filters"): clears both searches and the toggle, focus to `#bind-name`.
- Table (`.bind-row[data-action]`, `ACTIONS` order): Action | Binding | pencil, X.
    - Rows scroll under a fixed head. Scrollbar always shown, its own room (`--bind-sb`; styled, not macOS overlay: an overlay one covered the X buttons); the head leaves the same room.
    - Binding: the override, else the default chord (aliases hidden); unbound = dim `—`.
    - Binding column width `--bind-w`: widest text over all rows (defaults + current, bold) + margin. Measured at open and after each change, never by filtering.
    - Customized (present in the draft): bold, X enabled. X = back to default.
- Edit (pencil): the cell becomes a focused capture field holding the current chord. Each chord replaces it; Backspace empties; Enter / blur accept; Escape cancels. Enter / Escape: focus back to the row's pencil.
    - Same as now: nothing. Default chord: override dropped (not customized, aliases back). Empty: `null` (unbound).
    - Invalid (`validBinding`): unchanged; message on the status line.
    - Owned by another action (`conflicts` on the candidate draft, aliases included; also on X): dialog `.binding-conflict`, title "Key already in use", one line `<chord> is bound to “<other action>”.`, Cancel / Replace. Replace: the other becomes `null` (customized). Focus back to the row after the dialog.
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

- `borderless`: traffic lights hidden live; the title strip goes (`--strip-h` 0). Square corners need `frame: false` at window creation, so corners change on next launch. The bars stay drag regions.
- `bars`: where tabs, shelf and templates sit (`LAYOUT.md` "Bars"; `core/bars.ts`). Shape:
  ```json
  "bars": {
    "top":    { "start": [], "end": [] },
    "bottom": { "start": ["tabs"], "end": ["shelf", "templates"] },
    "left":   { "start": [], "end": [] },
    "right":  { "start": [], "end": [] }
  }
  ```
  - Each of `tabs`, `shelf`, `templates` exactly once; order within a list matters. An empty bar is hidden.
  - Invalid (missing, twice, unknown name, wrong shape, extra keys): the whole layout falls back to the default (`sanitize` → `cleanBars`). `validateSettings`: an error on `bars` for a save.
  - Panel: Layout row ("Layout row" above): Reset, Modify (the edit mode). Hand edits: the file, then the panel's Reload.
- Old `toolbar` key: `"top"` with no `bars` → the default layout on the top bar (`migrateToolbar`, in `parseSettings`). Otherwise ignored. `sanitize` drops it: gone from the file at the next Save.
