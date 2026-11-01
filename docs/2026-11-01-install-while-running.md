# Install while Tie is running

`tie-dev install` refuses to replace `/Applications/Tie.app` while it runs. Goal: install any time; the new version takes effect at the next launch (or at once with `--restart`).

# Why not swap under a running app

- Electron spawns helpers lazily from the bundle path (renderers, GPU, content frames, utility). Replacing the bundle (or renaming it: Chromium caches the executable path at start) makes the old main spawn new-version helpers. Crashes.
- So the bundle is replaced only while no copy runs.

# Settled

- Stage: `tie-dev install` while the installed copy runs copies the package to `~/.config/tie/staged/Tie.app` (XDG config dir, `main/env.ts`), prints "staged: takes effect at the next launch". A newer stage replaces an older one. Same fingerprint as installed or staged → "up to date".
- Swap at next launch (approach A): the installed app at startup, before the single-instance lock and any window, finds a stage whose fingerprint differs → replaces itself (`rm -rf` dest, move stage in), `app.relaunch()`, `app.exit(0)`. Packaged builds only (`app.isPackaged`), stage validated first (`Contents/MacOS/Tie` present, fingerprint file present). One extra launch, once per install.
- `install` when not running: direct swap as today, and a stale stage is removed (the package is the source of truth).
- `install --restart`: stage, ask the running Tie to quit through the normal quit flow (`osascript -e 'quit app "Tie"'`: busy terminals get the question; a "no" leaves the stage in place and `install` exits 1 after a timeout), wait for the pid to exit, swap directly, `open -a` the new app.
- No toast in the running Tie (approach rejected for now). No swap-at-quit finisher (approach B): A covers crash / force-quit too.

# Pending

- Record of the swap in the log (`log('update', ...)`), so a failed swap is diagnosable.
- Failed swap at launch (permissions, half-moved): leave the stage, start the old app, log. Never a dead `/Applications/Tie.app`: move the old bundle aside first (`Tie.app.old`), move the stage in, then delete the old one.

# Done

- `tie-dev install [--restart]` (`bin/tie-dev`): up to date / already staged / stage / direct install; `--restart` via a detached finisher. `check-install` (`dev/install-check.sh`): sandboxed end-to-end check.
- Swap at launch: `src/main/update.ts` `applyStaged`, first call in `main/index.ts` (before the lock; the swapping process skips the lock and `whenReady`). Old bundle aside → stage in → `.old` removed; any failure restores the old bundle, leaves the stage, starts the current version.
- Swap log: `log('update', ...)`, tag always on (`env.ts`).
- Pending items above: both done.
- Deviations from Settled:
  - `--restart` quits with SIGTERM to the running pid, not `osascript 'quit app "Tie"'`: same quit flow (a visible Tie asks; it always asks, not only for busy terminals), but aimed at that copy (the name could reach another Tie.app, e.g. a `TIE_INSTALL_DIR` copy).
  - `--restart` finishes in a detached process (own session): run from a Tie terminal, quitting Tie would end `install` before the install + reopen.
  - `staged/target` added: the stage names the bundle it replaces, so only that bundle swaps (smoke / harness / `out/package` copies never do).
  - Swap waits while another process runs the same executable (second instance, CLI): the swap would land under it. Found by `check-install`: a running copy spelled with `//` was missed by a command-line match and got killed after the swap; matches now compare resolved paths.
  - Cross-volume move: `ditto` (bundle symlinks, modes, xattrs) rather than `cpSync`.
- Found on the way: `pgrep` skips its own ancestors, so from a Tie terminal the old running check never saw the installed Tie (`install` would have replaced it under itself). Now `ps` + resolved paths (`running_main`).
- Left:
  - Not verified against `/Applications`: macOS App Management (Ventura+) may refuse an app replacing its own bundle (ad hoc: no team id). Then the swap logs, restores and starts the old version each launch; `install` (from a terminal) still works once Tie is quit. Check on the first real staged install (`tie-dev logs --instance default`, `[update]`).
  - `--restart` with a visible Tie (question answered Quit / Cancel) and the real `open -a` not exercised by `check-install` (background instance, `open` stubbed).
  - One stage slot: staging for another `TIE_INSTALL_DIR` replaces it.
