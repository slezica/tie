# Configurable bindings and terminal color schemes

Status: open. Phase 1 (understanding).

# Topic

1. Keyboard bindings: editable from the settings panel (`PENDING.md` 3).
2. Custom color schemes for terminals.

# Current state

- Keymap: `DEFAULT_KEYMAP` in `core/keymap.ts`, chord string → action. 36 chords, 35 actions (`zoom-in` has two).
- Matching: main only, `before-input-event` (`main/keys.ts`). `actionFor(k)` takes a keymap argument, never passed.
- Suspend: UI text field or modal focused → keymap off, except `quit`.
- Chord: `Cmd+Ctrl+Alt+Shift+<key>`, from Electron `input.key` (layout-dependent, shift-dependent: `Cmd+Shift++`).
- Menu: `Settings…` (`cmd+,`) and `Quit Tie` (`cmd+Q`, label only) are menu accelerators, outside the keymap.
- Settings: flat JSON, `sanitize` + `validateSettings` in main, panel with draft, Save / Cancel.
- Themes: `THEMES` in `renderer/themes.ts`, built in. One theme drives terminal palette, UI tokens, viewer colors.

# Bindings: spec (from the author)

New panel page "Bindings", vertical.

1. Filter row
    - Name search input.
    - Key search input: focused, it takes key presses, shows them as names joined by `+`.
    - Using one input clears the other.
    - Pencil button: only customized rows.
    - X button: clear all.
    - Filtering is live.
2. Table
    - Columns: Action (wide), Binding (width = longest combo + margin), buttons (min).
    - Buttons: pencil (edit), X (clear).
    - Customized row: bold.
    - Edit: the binding label becomes a focused input, working as the key search input.

# Bindings: proposal (mine, to discuss)

## Model

- Settings key `bindings: {<action>: <chord> | null}`. Sparse: overrides only. `null` = unbound.
- `core/keymap.ts`: `ACTIONS` (id, label, default chords), `resolveKeymap(overrides)` → chord → action. Pure, unit-tested.
- Main: keymap rebuilt at load and on each save. Applies live.
- Customized = action present in `bindings`.

## Capture

- Through main, not DOM `keydown`.
    - Main sends each chord seen in `before-input-event` to the UI while a capture field has focus.
    - Same `chord()` for capture and matching: what is shown is what will match.
    - Sees keys the DOM never gets (menu accelerators, `cmd+Q`).
- Capture mode suspends everything, `quit` included. Third suspend level.
- Chord completes at the first non-modifier key. Modifiers alone: shown live (`Cmd+Shift+`), not a chord.
- Field keys: see Settled.

## Validation (main, `validateSettings`)

- Unknown action: refused.
- Malformed chord: refused.
- Reserved: Escape, Tab, Enter, Backspace, editing combos (`cmd+C/V/X/A/Z`, `cmd+shift+Z`), `cmd+,`.
- Needs Cmd or Ctrl, or a function key. A bare letter would eat typing in terminals.
- Same chord on two actions: refused at Save; the panel resolves it first (conflict dialog).

## Panel

- Bindings follow the panel draft: applied at Save, dropped at Cancel.
- Table layout fixed from all rows, not the filtered ones: no width jumps while filtering.
- Docs: `INPUT.md` chord table becomes "defaults".

# Pending

Bindings.

1. Alt chords. Expected (to verify with real key presses, Phase 2): macOS reports `Alt+D` as `key: '∂'`, `code: 'KeyD'`. Electron's `before-input-event` gives both; nothing rawer. Proposal: with Alt held, name the key from `code` (`KeyD` → `D`, `Digit1` → `1`), else from `key`.

Color schemes: discussed after bindings are done.

7. Scope: terminals only, or a full custom theme (UI derived from it)?
8. Source: panel editor, files in `~/.config/tie/themes/`, or import (kitty `.conf`, iTerm, base16)?
9. Storage: inside `settings.json` or one file per scheme?
10. Start from a built-in ("duplicate and edit")?

# Settled

- One chord per binding. No multi-step sequences.
- One chord per action in the table. `zoom-in`'s `Cmd+Shift++` stays a hidden alias of the default only; a custom `zoom-in` drops it.
- Capture fields (key search, binding edit): Escape cancels, Backspace empties, Tab moves on, Enter accepts (unfocus, value kept). These four are unbindable.
- Binding edit: each complete chord replaces the field's value; Enter commits.
- Row X: back to default. Disabled when the row is not customized.
- Top X: clears both filters.
- Pencil = edit only; the "only customized" filter uses a sliders icon.
- Unbind: in edit, Backspace empties, Enter accepts empty = unbound (`null`).
- Edit field blur accepts, as Enter.
- `tab-1` … `tab-9`: nine rows.
- `zoom-in` default gets a second hidden alias `Cmd++` (layouts where `+` is its own key).
- Conflict (chord owned by another action): dialog naming both actions, Cancel / Replace. Replace: the other action becomes unbound (customized, bold).
- Bindings follow the panel draft: applied at Save, dropped at Cancel.
- `cmd+,` and menu items: fixed, not in the table. `Quit` is in the table; its menu label follows.

# Plan

## Phase 1: keymap model (core + main)

Done. Notes: default chords exempt from the reserved rule (`Ctrl+Tab`); `space` named `Space` in `chord()`; e2e `keys-bindings`.

1. `core/keymap.ts`: `ACTIONS` (id, label, default chord, hidden aliases), `resolveKeymap(overrides)`, `validBinding(chord)` (shape, reserved, modifier rule), `conflicts(overrides)`. Unit tests.
2. Settings: `bindings` key; `sanitize` drops unknown actions / bad chords; `validateSettings` refuses reserved, bare keys, duplicates.
3. `main/keys.ts`: keymap from settings, rebuilt on save. `Quit` menu label follows.
4. Preload `Settings` type. Docs: `SETTINGS.md`, `INPUT.md` (table = defaults).

## Phase 2: capture

1. Harness: `TIE_DEBUG=keys` logs raw `key` / `code` per input. Author presses Alt chords; settle Pending 1.
2. Suspend levels: off / fields (quit passes) / capture (nothing passes). Main sends chords to the UI while capturing. `// SECURITY:` note, `sec-*` scenario: capture ends on blur, panel close, tile focus.
3. Capture field component (`renderer/`): live modifiers, complete chord replaces value, Escape / Backspace / Tab / Enter rules.

## Phase 3: Bindings page

1. Page + filter row (name, key, sliders toggle, X).
2. Table: fixed column widths from all rows, bold customized, pencil / X (disabled when default).
3. Edit flow: capture field in the cell, accept on Enter / blur, conflict dialog (Cancel / Replace), unbind by empty.
4. Draft integration: Save / Cancel, errors from main shown on the row.
5. Scenarios: `settings-bindings` (filter, edit, conflict, unbind, reset, save applies live, cancel reverts).

## Phase 4: color schemes

Own discussion, after Phase 3.
