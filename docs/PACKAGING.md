# Packaging

`Tie.app` (arm64), electron-builder (`electron-builder.yml`, id `com.salezica.tie`), installed by copying to `/Applications`. No auto-update: re-run `tie-dev install`.

## Commands

| Command | Does |
|---|---|
| `tie-dev package` | `out/package/mac-arm64/Tie.app`, security fuses, signed ad hoc, then `check-package` (fuses + smoke; failure removes it) |
| `tie-dev install` | package, replace `/Applications/Tie.app` (`TIE_INSTALL_DIR` overrides) |
| `tie-dev release --version X.Y.Z` | below |
| `tie-dev icon` | `dev/icon.cjs` → `build/icon.png` → `.icns` |

Idempotent:

- Fingerprint = hash of all inputs (`src`, `bin/tie`, `resources`, `build`, configs, `package.json`, lockfile), stored in `Resources/fingerprint`.
- `package`: skips if fingerprint matches and signature valid. `install`: skips if installed fingerprint matches.
- Both refuse to replace a copy that is running (matched by executable path).

`release`:

1. Fails unless repo clean and `X.Y.Z` ≥ `package.json` version.
2. Tag `vX.Y.Z` on HEAD with matching version: already released, just `package`. Tag elsewhere: fail.
3. Typecheck, unit, e2e; any failure stops (nothing committed).
4. Higher version: set it, commit `package: set version X.Y.Z`.
5. Tag `vX.Y.Z`, package.

## Bundle (`Tie.app/Contents`)

| Path | What |
|---|---|
| `MacOS/Tie` | Electron |
| `Resources/app.asar` | `out/**` (minus package, log, stamp) + `package.json` + prod deps |
| `Resources/app.asar.unpacked/node_modules/node-pty` | native module + `spawn-helper` (must be real files) |
| `Resources/bin/tie` | launcher (`resources/bin/tie`, sh) |
| `Resources/cli/tie.mjs` | CLI (`bin/tie`) |
| `Resources/fingerprint` | input hash (idempotency) |

## CLI launcher

- Runs the CLI with Tie's Electron as Node (`ELECTRON_RUN_AS_NODE=1`). No system Node needed.
- Tie terminals get `Resources/bin` on PATH; dev runs get the repo's `bin/`.
- Outside Tie: add `/Applications/Tie.app/Contents/Resources/bin` to PATH.

## Packaged vs dev

- Instance `default` vs `dev` (`ARCHITECTURE.md`); both run side by side.
- Packaged: no debug port, no DevTools menu (harness can't attach).

## Signing

Ad hoc (`codesign --sign -`), enough for self-built apps. No developer identity, no notarization (needed only to distribute).
