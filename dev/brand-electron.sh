#!/usr/bin/env bash
# Rename the dev Electron bundle to "Tie" so the macOS menu bar shows the right app name
# (it reads CFBundleName from the bundle; no runtime API changes it). Re-sign ad hoc after.
set -euo pipefail
[[ "$(uname)" == "Darwin" ]] || exit 0
APP="$(cd "$(dirname "$0")/.." && pwd)/node_modules/electron/dist/Electron.app"
PLIST="$APP/Contents/Info.plist"
[[ -f "$PLIST" ]] || exit 0
[[ "$(plutil -extract CFBundleName raw "$PLIST")" == "Tie" ]] && exit 0
plutil -replace CFBundleName -string Tie "$PLIST"
plutil -replace CFBundleDisplayName -string Tie "$PLIST"
codesign --force --deep --sign - "$APP" 2>/dev/null
echo "branded dev Electron bundle as Tie"
