# Packaging

`Tie.app` (arm64), electron-builder (`electron-builder.yml`, id `com.salezica.tie`), installed by copying to `/Applications`. No auto-update: re-run `tie-dev install` (any time: while Tie runs, it stages).

## Commands

| Command | Does |
|---|---|
| `tie-dev package` | `out/package/mac-arm64/Tie.app`, security fuses, signed ad hoc, then `check-package` (fuses + smoke; failure removes it) |
| `tie-dev install [--restart]` | package, replace `/Applications/Tie.app` (`TIE_INSTALL_DIR` overrides); while it runs: stage (below); `--restart`: quit it, install, reopen |
| `tie-dev check-install` | install while running, end to end in a `/tmp` sandbox (below) |
| `tie-dev release --version X.Y.Z` | below |
| `tie-dev icon` | `dev/icon.cjs` → `build/icon.png` → `.icns` |

Idempotent:

- Fingerprint = hash of all inputs (`src`, `bin/tie`, `resources`, `build`, configs, `package.json`, lockfile), stored in `Resources/fingerprint`.
- `package`: skips if fingerprint matches and signature valid. `install`: skips if installed fingerprint matches ("up to date"; removes a stage).
- Neither replaces a copy that is running (main process by resolved executable path; `ps`, not `pgrep`: it skips its own ancestors, and from a Tie terminal Tie is one). `package` refuses; `install` stages.

`release`:

1. Fails unless repo clean and `X.Y.Z` ≥ `package.json` version.
2. Tag `vX.Y.Z` on HEAD with matching version: already released, just `package`. Tag elsewhere: fail.
3. `electron-check`: behind the latest patch of our Electron major = fail. Newer major: info. npm unreachable: warning, repeated at the end.
4. Typecheck, unit, e2e; any failure stops (nothing committed).
5. Higher version: set it, commit `package: set version X.Y.Z`.
6. Tag `vX.Y.Z`, package.

## Install while running

Why: Electron spawns helpers (renderers, GPU, utility) from the bundle path lazily; a bundle replaced under a running Tie makes it spawn new-version helpers, or get killed (code pages). Record: `2026-11-01-install-while-running.md`.

- Stage: `install` while the installed copy runs copies the package to `<state dir>/staged/Tie.app` (`~/.config/tie` or `$XDG_CONFIG_HOME/tie`), then writes `staged/target` (the bundle it replaces; last = stage complete). "staged …: takes effect at the next launch of Tie". Same fingerprint as the stage: "already staged". A newer package replaces the stage.
- Swap at launch (`main/update.ts` `applyStaged`, first thing in main, before the single-instance lock): packaged builds only; only the bundle named by `target` (resolved paths: never `out/package`, smoke or harness copies); stage a real directory owned by the user, with `Contents/MacOS/Tie` and `Resources/fingerprint`; fingerprint differs from the running bundle's (equal: stage removed); no other process runs this bundle's executable (another instance, the CLI: the swap waits for a later launch). Then: bundle → `Tie.app.old`, stage → bundle (rename; across volumes `ditto` + remove), stage dir and `.old` removed, `app.relaunch()`, `app.exit(0)`.
- Failure (any step): the old bundle moves back if it was moved, the stage stays (retried next launch), the current version starts. Logged under the always-on `update` tag (instance log).
- `--restart`: stage, SIGTERM the running Tie (its normal quit flow: a visible Tie asks, busy terminals listed), then a detached finisher (own session: survives Tie's terminals closing, so it works from a Tie terminal) waits up to 60 s for the pid, installs directly from the package, removes the stage, `open -a`. Output: `<state dir>/log/install.log`, shown when it ends. Cancelled or slow: "did not quit", stage stays, exit 1.
- `check-install` (`dev/install-check.sh`): `TIE_INSTALL_DIR` and `XDG_CONFIG_HOME` in `/tmp/tie-ic.*` (short: socket path limit). Install; run that copy (fingerprint faked old); install stages, again "already staged"; a second instance (path spelled with `//`) doesn't swap; quit, relaunch swaps (one `ready`: the relaunch); "up to date"; `--restart` (`open` stubbed); stage not swapped by the package copy; incomplete stage left + logged.

## Bundle (`Tie.app/Contents`)

| Path | What |
|---|---|
| `MacOS/Tie` | Electron |
| `Resources/app.asar` | `out/**` (minus package, log, stamp) + `package.json` + prod deps |
| `Resources/app.asar.unpacked/node_modules/node-pty` | native module + `spawn-helper` (must be real files) |
| `Resources/app.asar.unpacked/node_modules/tie-peer` | native module: socket peer identity (`native/peer`) |
| `Resources/bin/tie` | launcher (`resources/bin/tie`, sh) |
| `Resources/cli/tie.mjs` | CLI (`bin/tie`) |
| `Resources/fingerprint` | input hash (idempotency) |

- Bundled-only packages (xterm excepted, historical) are `devDependencies`: `dependencies` get copied into `app.asar` as `node_modules`. Viewer libraries (markdown-it, DOMPurify, highlight.js) live only in `out/viewers/*.js`.

## CLI launcher

- Runs the CLI with Tie's Electron as Node (`ELECTRON_RUN_AS_NODE=1`). No system Node needed.
- Tie terminals get `Resources/bin` on PATH; dev runs get the repo's `bin/`.
- Outside Tie: add `/Applications/Tie.app/Contents/Resources/bin` to PATH.

## Packaged vs dev

- Instance `default` vs `dev` (`ARCHITECTURE.md`); both run side by side.
- Packaged: no debug port, no DevTools menu (harness can't attach).

## Signing

Ad hoc (`codesign --sign -`), enough for self-built apps. No developer identity, no notarization (needed only to distribute).

First launch of each build: macOS asks whether Tie may use "Tie Safe Storage" in the Keychain (Electron's cookie-encryption key, fuse `enableCookieEncryption`). An ad-hoc signature is a new identity every build, so "Always allow" lasts until the next install. Harness and smoke instances run with `--use-mock-keychain` and never prompt.

## Electron updates

- `tie-dev electron-check`: pinned version (`package.json`, exact) vs npm dist-tags (`<major>-x-y`, `latest`).
- Behind: bump (`npm install --save-exact electron@X`), run checks. Majors: our call (info only).
- Binary: downloaded by `install-electron` in `postinstall` (the package no longer does it itself).
