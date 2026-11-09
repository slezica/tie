#!/usr/bin/env bash
# Install while running, end to end, in a sandbox (`tie-dev check-install`): never /Applications or
# ~/.config/tie. The package installs to <tmp>/apps/Tie.app (TIE_INSTALL_DIR), state in <tmp>/config
# (XDG_CONFIG_HOME, for both tie-dev and the app). That copy runs as a background instance; its
# fingerprint is set to "old-…" so the package counts as newer. `open` is stubbed (it would launch
# through LaunchServices, without this environment). See PACKAGING.md "Install while running".
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
unset TIE_SOCKET TIE_TILE ELECTRON_RUN_AS_NODE
# Short path: socket paths (config dir) max 104 bytes.
tmp="$(mktemp -d /tmp/tie-ic.XXXXXX)"
export TIE_INSTALL_DIR="$tmp/apps" XDG_CONFIG_HOME="$tmp/config"
mkdir -p "$TIE_INSTALL_DIR" "$XDG_CONFIG_HOME" "$tmp/stub"
app="$TIE_INSTALL_DIR/Tie.app"
stage="$XDG_CONFIG_HOME/tie/staged"
pkg="$ROOT/out/package/mac-arm64/Tie.app"
inst="ic-$$"
inst2="ic2-$$"
info="$XDG_CONFIG_HOME/tie/$inst.json"
applog="$tmp/app.log"
printf '#!/bin/sh\necho "$@" >> "%s/open.log"\n' "$tmp" > "$tmp/stub/open"
chmod +x "$tmp/stub/open"

failed=0
ok() { echo "ok   $*"; }
bad() { echo "FAIL $*"; failed=1; }
fp() { cat "$1/Contents/Resources/fingerprint" 2>/dev/null || true; }
pid=
alive() { [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; }
launch() { # $1: bundle (default: the installed copy). Waits for the info file (after a swap: the relaunched process).
  rm -f "$info"
  TIE_INSTANCE="$inst" TIE_BACKGROUND=1 TIE_DEBUG=app TIE_LOG="$applog" "${1:-$app}/Contents/MacOS/Tie" -ApplePersistenceIgnoreState YES >>"$tmp/stderr" 2>&1 &
  for _ in $(seq 1 150); do [[ -s "$info" ]] && pid="$(node -p "require('$info').pid" 2>/dev/null)" && [[ -n "$pid" ]] && return 0; sleep 0.1; done
  return 1
}
stop() {
  alive && kill -TERM "$pid"
  for _ in $(seq 1 100); do alive || break; sleep 0.1; done
  pid=
}
cleanup() {
  stop || true
  [[ -n "${pid2:-}" ]] && kill -TERM "$pid2" 2>/dev/null || true
  rm -rf "$HOME/Library/Application Support/tie-$inst" "$HOME/Library/Application Support/tie-$inst2"
  if [[ $failed == 0 ]]; then rm -rf "$tmp"; else echo "kept: $tmp"; fi
}
trap cleanup EXIT
install() { "$ROOT/bin/tie-dev" install "$@" 2>&1; }

out="$(install)"
[[ "$out" == *"installed $app"* ]] && ok "not running: installs" || bad "first install: $out"
want="$(fp "$pkg")"

echo "old-$$" > "$app/Contents/Resources/fingerprint"
launch && ok "installed copy runs (pid $pid)" || bad "installed copy did not start"
first="$pid"
out="$(install)"
[[ "$out" == "staged $stage/Tie.app"* && "$(fp "$stage/Tie.app")" == "$want" && "$(cat "$stage/target")" == "$app" ]] && ok "running: stages" || bad "stage: $out"
[[ "$(fp "$app")" == "old-$$" ]] && ok "running: bundle untouched" || bad "running bundle changed"
out="$(install)"
[[ "$out" == "already staged"* ]] && ok "again: already staged" || bad "second install: $out"

# A second instance of the running bundle (spelled with //): no swap under the first.
TIE_INSTANCE="$inst2" TIE_BACKGROUND=1 TIE_LOG="$tmp/app2.log" "${app%/Tie.app}//Tie.app/Contents/MacOS/Tie" -ApplePersistenceIgnoreState YES >>"$tmp/stderr" 2>&1 &
pid2=
for _ in $(seq 1 150); do [[ -s "$XDG_CONFIG_HOME/tie/$inst2.json" ]] && pid2="$(node -p "require('$XDG_CONFIG_HOME/tie/$inst2.json').pid" 2>/dev/null)" && [[ -n "$pid2" ]] && break; sleep 0.1; done
[[ -n "$pid2" ]] && alive && [[ "$(fp "$app")" == "old-$$" && -e "$stage/Tie.app" ]] && grep -q '\[update\] stage waits' "$tmp/app2.log" \
  && ok "second instance: starts, no swap under the first" || bad "second instance: pid2=$pid2 fp=$(fp "$app")"
kill -TERM "$pid2" 2>/dev/null || true
for _ in $(seq 1 100); do kill -0 "$pid2" 2>/dev/null || break; sleep 0.1; done
pid2=

stop
launch && ok "relaunched after quit (pid $pid)" || bad "no start after the swap"
[[ "$pid" != "$first" && "$(fp "$app")" == "$want" ]] && ok "swap at launch: new fingerprint" || bad "swap: fingerprint $(fp "$app"), want $want"
[[ ! -e "$stage" && ! -e "$app.old" ]] && ok "swap: stage and old bundle gone" || bad "swap leftovers: $(ls -d "$stage" "$app.old" 2>/dev/null)"
grep -q '\[update\] swapped' "$applog" && ok "swap logged" || bad "no [update] swapped in $applog"
[[ "$(sed -n '/\[update\] swapped/,$p' "$applog" | grep -c '\[app\] ready')" == 1 ]] && ok "swapping process exits before ready (one ready: the relaunch)" || bad "ready count after swap: $(cat "$applog")"
out="$(install)"
[[ "$out" == *"up to date" ]] && ok "same fingerprint: up to date" || bad "up to date: $out"

# Restart: stage, SIGTERM (a background instance quits without asking), direct install, open.
echo "old-$$" > "$app/Contents/Resources/fingerprint"
out="$(PATH="$tmp/stub:$PATH" install --restart)" || bad "--restart exit $?"
[[ "$out" == *"restarted $app"* && "$(fp "$app")" == "$want" && ! -e "$stage" ]] && ok "--restart: quit, installed" || bad "--restart: $out"
grep -q -- "-a $app" "$tmp/open.log" 2>/dev/null && ok "--restart: reopened (open -a)" || bad "--restart: open not called"
alive && bad "--restart: old instance still running" || true
pid=

# Restart with no Tie running: direct install, then open.
echo "old-$$" > "$app/Contents/Resources/fingerprint"
: > "$tmp/open.log"
out="$(PATH="$tmp/stub:$PATH" install --restart)" || bad "--restart (not running) exit $?"
[[ "$out" == *"installed $app"* && "$(fp "$app")" == "$want" ]] && grep -q -- "-a $app" "$tmp/open.log" && ok "--restart, not running: installed, opened" || bad "--restart, not running: $out / $(cat "$tmp/open.log")"

# Only the target bundle swaps: the package copy (smoke, harness) leaves the stage alone.
mkdir -p "$stage" && ditto "$pkg" "$stage/Tie.app" && echo "$app" > "$stage/target"
echo "other-$$" > "$stage/Tie.app/Contents/Resources/fingerprint"
: > "$applog"
launch "$pkg" && ok "package copy runs with a stage present" || bad "package copy did not start"
stop
[[ -e "$stage/Tie.app" ]] && ! grep -q '\[update\]' "$applog" && ok "non-target bundle: no swap" || bad "non-target bundle touched the stage"

# Incomplete stage (no fingerprint): logged, left in place, current version starts.
rm "$stage/Tie.app/Contents/Resources/fingerprint"
echo "old-$$" > "$app/Contents/Resources/fingerprint"
: > "$applog"
launch && ok "incomplete stage: current version starts" || bad "incomplete stage: no start"
stop
[[ "$(fp "$app")" == "old-$$" && -e "$stage/Tie.app" ]] && grep -q '\[update\] stage incomplete' "$applog" && ok "incomplete stage: logged, left" || bad "incomplete stage handling"

exit $failed
