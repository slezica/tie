# Configurable bindings

Status: open. Phases 1-3 done; manual check results applied 2026-11-18. Left: two human checks ("Pending"). Color schemes: own record, `2026-11-18-terminal-color-schemes.md`.

# Topic

Keyboard bindings: editable from the settings panel (`PENDING.md` 3).

# Current state

- Keymap: `DEFAULT_KEYMAP` in `core/keymap.ts`, chord string → action. 36 chords, 35 actions (`zoom-in` has two).
- Matching: main only, `before-input-event` (`main/keys.ts`). `actionFor(k)` takes a keymap argument, never passed.
- Suspend: UI text field or modal focused → keymap off, except `quit`.
- Chord: `Cmd+Ctrl+Alt+Shift+<key>`, from Electron `input.key` (layout-dependent, shift-dependent: `Cmd+Shift++`; 2026-11-18, real keys with Cmd held: unshifted, `Cmd+Shift+=`).
- Menu: `Settings…` (`cmd+,`) and `Quit Tie` (`cmd+Q`, label only) are menu accelerators, outside the keymap.
- Settings: flat JSON, `sanitize` + `validateSettings` in main, panel with draft, Save / Cancel.

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
- Reserved: Escape, Enter, Backspace, editing combos (`cmd+C/V/X/A/Z`, `cmd+shift+Z`), `cmd+,`.
- Needs Cmd or Ctrl, or a function key. A bare letter would eat typing in terminals. (2026-11-18: Alt too; "Settled".)
- Same chord on two actions: refused at Save; the panel resolves it first (conflict dialog).

## Panel

- Bindings follow the panel draft: applied at Save, dropped at Cancel.
- Table layout fixed from all rows, not the filtered ones: no width jumps while filtering.
- Docs: `INPUT.md` chord table becomes "defaults".

# Pending

1. Shifted symbols vs `zoom-in` (from manual check 3). Real `Cmd+Shift+=` is named `Cmd+Shift+=` (key as Electron reports it with Cmd: the unshifted one). `zoom-in` answers to `Cmd+=`, `Cmd+Shift++`, `Cmd++`: so a real `Cmd+Shift+=` likely zooms nothing. Inferred from the code + the observation; the harness can't tell (its synthetic keys report `+`). Human: see "Manual checks" 3.
2. Done 2026-11-24 (user): a saved Alt chord runs its action, terminal focused and markdown tile focused.

# Manual checks (human)

Results 2026-11-18, by the author (real keys, dev instance).

Keys:

1. Alt chords (`Alt+D`, `Cmd+Alt+E`, `Alt+1`, `Ctrl+Alt+[`): shown as written. Binding an Alt-only chord was blocked → now allowed ("Settled").
2. Saved Alt chord runs: not testable then (Alt-only refused). Open again ("Pending" 2).
3. Shifted symbols: bottom-of-key character (`Cmd+Shift+=`, `Cmd+Shift+[`), not `+` / `{`. Accepted as is, preferred. To confirm ("Pending" 1):
    - Bindings page, key search, press `Cmd+Shift+=`: no rows = `zoom-in` doesn't answer to it.
    - Markdown tile focused: `Cmd+Shift+=` (expected: no zoom) vs `Cmd+=` (110% pill).
    - Numpad, if at hand: `Cmd+numpad +` and `Cmd+Shift+numpad +` (expected: both zoom: `Cmd++`, `Cmd+Shift++`).
4. Non-US layout: not tested. Moved to `PENDING.md` 40.
5. System-owned chords: correct.
6. Menu accelerators while capturing: correct.
7. `Cmd+Q` in a capture field: correct.
8. Held modifiers: bug, the field kept released modifiers (`Cmd+Shift+` after both released). Fixed: Chromium dropped the key-ups after a blocked modifier key-down; modifiers now pass, and a modifier's own key decides its flag.
9. Leaving capture: passes.
10. Quit menu label: correct.
11. Enter never saves / closes: correct. Added: Enter in a text / number field or select unfocuses it.
12. Conflict dialog: clear but verbose → one line (`Cmd+T is bound to “New tab”.`).
13. Bindings survive a restart, file holds only overrides: success.
14. `Ctrl+C` / `Ctrl+R` bindable: allowed without a warning.
15. Look: good.
16. Sliders read as "configure filters" → pencil (the rows' edit icon). Also: table scrollbar overlapped the rows' X buttons → always shown, its own room.
17. `browser` scenario hang: unchanged. Worked around 2026-11-16 (location Enter after `cmd+0` sent through main, `h.press`); root cause unconfirmed. Left for now (author, 2026-11-17): bisect the recent zoom commits only if this misbehaves by hand.

# Settled

- One chord per binding. No multi-step sequences.
- One chord per action in the table. `zoom-in`'s `Cmd+Shift++` stays a hidden alias of the default only; a custom `zoom-in` drops it.
- Capture fields (key search, binding edit): Escape cancels, Backspace empties, Enter accepts (unfocus, value kept). These three are unbindable. Tab is not reserved: captured and bindable like any key ("move on" dropped as unnecessary here).
- Ctrl+letter bindings allowed, even ones terminals use (`Ctrl+C`): left to the user. No warning.
- Alt-only chords allowed (`Alt+A`; 2026-11-18): left to the user, as `Ctrl+C` (on macOS Alt+letter types a character; a binding takes it). Rule: Cmd, Ctrl or Alt, or a function key. Shift alone, bare keys: refused.
- Alt chords named from the physical key (`code`: `KeyD` → `D`): confirmed by real presses (check 1).
- Shifted symbols named by the unshifted key, as Electron reports them with Cmd held (`Cmd+Shift+=`, `Cmd+Shift+[`): accepted, preferred (check 3).
- Binding edit: each complete chord replaces the field's value; Enter commits.
- Row X: back to default. Disabled when the row is not customized.
- Top X: clears both filters.
- Pencil = edit; the "only customized" filter toggle is a pencil too (2026-11-18: sliders read as "configure filters").
- Unbind: in edit, Backspace empties, Enter accepts empty = unbound (`null`).
- Edit field blur accepts, as Enter.
- `tab-1` … `tab-9`: nine rows.
- `zoom-in` default gets a second hidden alias `Cmd++` (layouts where `+` is its own key).
- Conflict (chord owned by another action): dialog, one line naming the chord and the other action, Cancel / Replace. Replace: the other action becomes unbound (customized, bold).
- Enter in a panel text / number field or select: unfocuses it (done); never saves.
- Bindings table scrollbar: always shown, its own room.
- Bindings follow the panel draft: applied at Save, dropped at Cancel.
- `cmd+,` and menu items: fixed, not in the table. `Quit` is in the table; its menu label follows.

# Plan

## Phase 1: keymap model (core + main)

Done. Notes: `space` named `Space` in `chord()`; e2e `keys-bindings`.

1. `core/keymap.ts`: `ACTIONS` (id, label, default chord, hidden aliases), `resolveKeymap(overrides)`, `validBinding(chord)` (shape, reserved, modifier rule), `conflicts(overrides)`. Unit tests.
2. Settings: `bindings` key; `sanitize` drops unknown actions / bad chords; `validateSettings` refuses reserved, bare keys, duplicates.
3. `main/keys.ts`: keymap from settings, rebuilt on save. `Quit` menu label follows.
4. Preload `Settings` type. Docs: `SETTINGS.md`, `INPUT.md` (table = defaults).

## Phase 2: capture

Done. Notes:

- Raw key log only in capture mode (never a log of what is typed elsewhere).
- Capture leaves with the field's focus; the UI → main report is asynchronous (same lag as text fields).
- `browser` scenario timed out (180 s) since before this work (fails on `1425498` too): "Manual checks" 17.
- Held modifiers: key-ups after a blocked key-down never reach `before-input-event` (Chromium suppresses them): modifiers pass in capture mode (fix 2026-11-18, check 8).

1. Harness: `TIE_DEBUG=keys` logs raw `key` / `code` per input. Author presses Alt chords; settle Pending 1.
2. Suspend levels: off / fields (quit passes) / capture (nothing passes). Main sends chords to the UI while capturing. `// SECURITY:` note, `sec-*` scenario: capture ends on blur, panel close, tile focus.
3. Capture field component (`renderer/`): live modifiers, complete chord replaces value, Escape / Backspace / Enter rules.

## Phase 3: Bindings page

Done. Notes:

- `renderer/bindings.ts`; panel page after Appearance. `SETTINGS.md` "Bindings page".
- Key search: exact complete chord, aliases included (`Cmd++` finds Zoom in).
- Conflict check runs on the candidate draft (`conflicts`), so row X (back to default) asks too when the default was given away.
- Errors from main: status line + table frame, not per row (the page prevents them; main messages only name labels).
- Enter on a focused panel button presses it instead of saving (rows' pencil / X).
- Scenario `settings-bindings`.

1. Page + filter row (name, key, only-customized toggle, X).
2. Table: fixed column widths from all rows, bold customized, pencil / X (disabled when default).
3. Edit flow: capture field in the cell, accept on Enter / blur, conflict dialog (Cancel / Replace), unbind by empty.
4. Draft integration: Save / Cancel, errors from main shown on the row.
5. Scenarios: `settings-bindings` (filter, edit, conflict, unbind, reset, save applies live, cancel reverts).
