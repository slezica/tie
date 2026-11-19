# Terminal color schemes

Status: open, not started. Split from `2026-11-16-configurable-bindings.md` (was its Phase 4).

# Topic

Custom color schemes for terminals.

# Current state

- Themes: `THEMES` in `renderer/themes.ts`, built in. One theme drives terminal palette, UI tokens, viewer colors.
- Theme = `{label, dark, accent, palette, code?}` (`SETTINGS.md` "Themes"):
    - `palette`: xterm colors + 16 ANSI.
    - `code`: optional per-token colors for viewer code blocks; absent tokens fall back to ANSI (`viewers/highlight.ts`).
- Adding one: an entry in `THEMES`, nothing else. No user-defined themes.
- Settings: `theme` (theme id), picked on the Appearance page.
- UI tokens: `--bg`, `--text`, `--accent`, `--red` / `--green` / `--yellow` from the theme; the rest `color-mix` of these (`SETTINGS.md` "Color tokens").

# Pending

1. Scope: terminals only, or a full custom theme (UI derived from it)?
2. Source: panel editor, files in `~/.config/tie/themes/`, or import (kitty `.conf`, iTerm, base16)?
3. Storage: inside `settings.json` or one file per scheme?
4. Start from a built-in ("duplicate and edit")?

# Settled

Nothing yet.

# Plan

After discussion.
