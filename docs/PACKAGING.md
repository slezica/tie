# Packaging

Tie ships as `Tie.app` (arm64), built with electron-builder, installed by copying to `/Applications`.

## Commands

| Command | Does |
|---|---|
| `tie-dev package` | `out/package/mac-arm64/Tie.app`, signed ad hoc |
| `tie-dev release --version X.Y.Z` | release: see below |
| `tie-dev install` | package, replace `/Applications/Tie.app` (refuses while Tie runs) |
| `tie-dev icon` | re-render placeholder icon (`dev/icon.cjs` → `build/icon.png`, `.icns`) |

Update = `tie-dev install` again. No auto-update.

## Release

`tie-dev release --version X.Y.Z`:

1. Fails unless: repo clean, `X.Y.Z` ≥ `package.json` version, tag `vX.Y.Z` absent.
2. Typecheck, unit, e2e. Any failure stops here (nothing committed).
3. If higher: set version, commit `package: set version X.Y.Z`. Equal: no-op.
4. Tag `vX.Y.Z`.
5. Package (`out/package/`). Version shows in the app's Info.plist.

## Bundle layout

| Path in `Tie.app/Contents` | What |
|---|---|
| `MacOS/Tie` | Electron binary |
| `Resources/app.asar` | `out/**` + `package.json` + prod deps (archive: read by Electron, not by the shell) |
| `Resources/app.asar.unpacked/node_modules/node-pty` | native module + `spawn-helper` (must be real files) |
| `Resources/bin/tie` | CLI launcher (`resources/bin/tie`, shell) |
| `Resources/cli/tie.mjs` | CLI (`bin/tie`) |

Config: `electron-builder.yml`. Bundle id `com.salezica.tie`.

## CLI

- Launcher runs the CLI with Tie's Electron as Node (`ELECTRON_RUN_AS_NODE=1`), like VS Code's `code`. No system Node needed. ~40-70 ms.
- Tie terminals get `Resources/bin` on PATH (like kitty). Dev runs put the repo's `bin/` instead.
- Outside Tie: add `/Applications/Tie.app/Contents/Resources/bin` to PATH.

## Installed vs dev

| | Installed | Dev (`tie-dev run`) |
|---|---|---|
| Instance | `default` | `dev` |
| Socket | `~/.config/tie/default.sock` | `~/.config/tie/dev.sock` |
| Settings | `settings.json` | `settings.dev.json` |
| Debug port, DevTools menu | off | on |

Both can run side by side.

## Signing

- Ad hoc (`codesign --sign -`): enough for apps you build yourself (not quarantined).
- No Apple developer identity, no notarization. Needed only to distribute.
