# Settings and Appearance

Settings file, panel, themes, color tokens, fonts.

## File

- `~/.tie/settings.json` for the installed app (`default`); `~/.tie/settings.<instance>.json` for others (e.g. `settings.dev.json`). `TIE_SETTINGS` overrides.
- First `dev` run copies `settings.json` to `settings.dev.json` if missing.
- Loaded once at main startup. Missing → defaults.
- Sanitized at load and save (`sanitize()`): numbers clamped, wrongly typed strings → defaults.
- Unreadable or unparseable → defaults + stderr error, and:
  - Save blocked; the file is never overwritten.
  - Panel status line shows the problem on open.
  - While unreadable, re-read on each `settings:get`/`set`; fixing the file unblocks Save.
- Saved whole on every `settings:set` (pretty JSON).

| Key | Default | Scope | Range / meaning |
|---|---|---|---|
| `theme` | `tie-dark` | app-wide | theme id (`themes.ts`) |
| `fontFamily` | `''` | all tiles | `''` = default monospace stack |
| `fontSize` | 12 | all tiles | 8–32 px |
| `lineHeight` | 1.15 | all tiles | 1–2 |
| `cellWidth` | 100 | all tiles | 70–150 % (kitty `cell_width`) |
| `shell` | `''` | terminal tiles | command line; `''` = login shell (`TERMINALS.md`) |

- Scopes: app-wide (UI + tiles), all tiles (tile content only, never chrome), tile kind.
- Theme alias `elegant-dark` → `tie-dark`.
- Validation (`validateSettings`, main): `shell` executable must resolve. Errors block save.
- Shell change applies to new terminals only.

## Panel (`settings.ts`)

- Open: app menu `Settings…` / `cmd+,`. Harness: `document.dispatchEvent(new CustomEvent('tie:settings'))`.
  - Second open request while loading: ignored.
- On close: keys return to the active tile (`refocus()`).
- Left nav: `Appearance` | `Terminal`. Last page remembered while running.
- Appearance: theme (+ ANSI swatches), window (borderless, tab bar, shelf), font, size, line height, char width.
- Terminal: shell command (placeholder shows the default).
- Live preview of appearance. Cancel / Escape / backdrop click reverts.
- Enter or `Save` saves. On error:
  - Status line shows messages (otherwise it shows the file path).
  - Field marked `.invalid`, panel jumps to its page.
  - Editing the field clears the error.
- Font list loads async (`queryLocalFonts`, else known candidates), monospace only. Fields don't wait for it.
- Warning when the chosen font isn't installed.

## Themes (`themes.ts`)

Theme = `{label, dark, accent, palette}`. Palette = xterm colors + 16 ANSI.

Built in: Tie Dark (default), Dracula, Nord, Gruvbox Dark, One Dark, Tokyo Night, Catppuccin Mocha, Solarized Dark, Solarized Light.

Add a theme: new entry in `THEMES`. Nothing else needed.

## Color tokens

`applyAppearance()` sets only base tokens on `:root`:

| Token | From |
|---|---|
| `--bg` | palette background |
| `--text` | palette foreground |
| `--accent` | theme accent |
| `--red` | ANSI 1 |
| `--green` | ANSI 2 |

Everything else in `style.css` is derived with `color-mix`:

- `--fg-a/b/c/d`: text at 4.5 / 8 / 13 / 22 % over transparent.
- `--muted`, `--faint`, `--panel`, `--border`, `--bar-bg`, `--accent-soft`.
- `--app-bg`: `--bg` 20% darker (behind tiles).
- Light themes: `:root.light` + `color-scheme: light`; softer `--shadow`.

Rule: never hardcode colors. Mix from base tokens.

## Fonts and text

- Tile content vars: `--tile-font`, `--tile-font-size`, `--tile-line-height`.
- xterm options set from the same values (`termOptions()`); existing terminals updated and refit.
- Font stack: chosen family, then `Hack, JetBrains Mono, SF Mono, Menlo, monospace`.
- Char width: xterm has no cell scale; emulated with `letterSpacing`.
  - xterm adds `Math.round(letterSpacing)` in *device* px, so the delta is computed in device px.
  - Steps are whole device px: at 2x, 0.5 CSS px per char. Nearest achievable width wins.
  - Re-applied when the window's device pixel ratio changes.
- Chrome uses `--ui-font` (system sans), unaffected by tile settings.
- Emoji icons rendered grayscale.

## Limitations

- Keymap not configurable (`PENDING.md`).
- File edits while running aren't picked up (except fixing an unreadable file); restart or use the panel.

## Borderless window

- `borderless` (app-wide, default off). kitty analogue: `hide_window_decorations yes`.
- On: traffic lights hidden (live), tab bar starts at the left edge (`:root.borderless`).
- Square corners: macOS allows them only on frameless windows, set at creation. So on launch with `borderless`, the window is `frame: false, roundedCorners: false`. Toggling live changes corners on next launch.
- The top bar stays the window's drag region.

## Tab bar and shelf style

- `tabBar`: `top` (default) | `bottom`. Bottom: tabs move to `#bottom`, which becomes the drag region.
  - Top strip stays for the traffic lights; with `borderless` it collapses (`--top-h: 0`).
- `shelfStyle`: `normal` (default) | `compact` (`--shelf-w-compact`, icons only, smaller).
- Layout reads effective bar heights `--top-h` / `--bottom-h` (derived from `--top-bar` by settings classes).
- Both apply live (re-layout + refit terminals).
