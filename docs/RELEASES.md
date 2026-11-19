# Releases

Notes per release: what changed for the user, and what still needs a manual check. Newest first. Cut with `tie-dev release --version X.Y.Z` (`PACKAGING.md`).

## 0.8.1 (2026-11-19)

Supersedes 0.8.0 (same day, tagged, never installed): adds the pty fix below.

Changes since 0.7.0:

- Key bindings: configurable (Settings → Bindings; capture fields, conflicts, Alt-only chords allowed).
- Settings file: read at start only, never reloaded or written by itself. Edited on disk: banner in the panel (`Ignore` / `Reload`). Unparseable at start: dialog (`Close` / `Recreate with defaults`, with a `.bak`). Save sets the file to 0600.
- Shelf: multi-select (cmd+click), group close / unshelve / move / drag.
- Terminal: a link no longer on screen can't be hovered or opened (stale link cache); bad pty calls no longer raise an exception dialog.
- Links out: the dialog shows the site from the parsed URL and warns about a user name before the site address. Download names and page titles: bidi and control characters removed.
- CLI: `tie state` answers in dev builds only.
- Uncaught errors in the main process are logged (`[error]`, with the stack).
- Electron 44.11.5.

Pending manual testing:

- A saved Alt chord (e.g. `Alt+A`) runs in a terminal and in a markdown tile.
- Uncaught-error dialog in a visible instance (only the harness path, without dialog, was run).
- Non-US keyboard layouts (`PENDING.md` 40).

Known, not fixed:

- `ioctl EBADF` on a pty resize was seen in harness runs and is now caught, but its trigger was not reproduced.
- Guest hang (`unresponsive`) has no test (`ENGINE.md`).

## Unreleased

- Settings panel: Save disabled when nothing differs from the active settings.
- Settings panel: About page (versions, instance, settings and log paths).
- Settings panel: `~` path on the status line (full path in its tooltip).
