#!/usr/bin/env bash
# ptydump: snapshot everything relevant to a pty wedge (docs/2026-10-21-pty-wedge.md) for later analysis.
# Every step is time-boxed: on a wedged machine ps/lsof/openpty/stat block forever (uninterruptibly),
# so a probe that hangs is itself a finding; it's left behind (unkillable) and reported.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="${1:-$ROOT/out/log/ptydump/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$out"
log() { echo "$*" | tee -a "$out/summary.txt"; }

# boxed <seconds> <file> <cmd...>: run with a deadline; output to file; marks HUNG (pid kept) on timeout.
boxed() {
  local secs=$1 file=$2; shift 2
  ( "$@" ) >"$out/$file" 2>&1 &
  local pid=$!
  for ((i = 0; i < secs * 10; i++)); do
    kill -0 $pid 2>/dev/null || { wait $pid; log "  ok   $file"; return 0; }
    sleep 0.1
  done
  log "  HUNG $file (pid $pid left running: $*)"
  echo "HUNG after ${secs}s" >>"$out/$file"
  return 1
}

log "ptydump $(date '+%Y-%m-%d %H:%M:%S %z') → $out"
log "uptime: $(uptime)"
log "os: $(sw_vers -productVersion) ($(uname -r)); ptmx_max $(sysctl -n kern.tty.ptmx_max); /dev/ttys nodes: $(ls /dev | grep -c '^ttys')"
{ sw_vers; uname -a; sysctl kern.tty.ptmx_max; sysctl kern.boottime; node -p "'node-pty ' + require('$ROOT/node_modules/node-pty/package.json').version + ', electron ' + require('$ROOT/node_modules/electron/package.json').version" 2>/dev/null; } >"$out/system.txt"
ls /dev | grep '^ttys' | sort >"$out/ttys-nodes.txt"   # readdir only: never stats a node

log "processes (ps walks ttys: may hang on a wedged machine)"
boxed 10 ps-all.txt ps -eo pid,ppid,stat,lstart,etime,command
boxed 10 ps-stuck.txt bash -c "ps -eo pid,ppid,stat,lstart,etime,command | awk '\$3 ~ /^U/'"
if [[ -s "$out/ps-stuck.txt" ]] && ! grep -q HUNG "$out/ps-stuck.txt"; then
  n=$(grep -c spawn-helper "$out/ps-stuck.txt" || true)
  log "  stuck (state U): $(wc -l <"$out/ps-stuck.txt" | tr -d ' ') processes, $n spawn-helpers"
  # User-space stacks of a few stuck processes (kernel frame = the blocked syscall).
  i=0
  while read -r pid _; do
    [[ $i -ge 4 ]] && break
    boxed 20 "sample-$pid.txt" sample "$pid" 1
    i=$((i + 1))
  done < <(grep -E 'spawn-helper|nvim|python|bash' "$out/ps-stuck.txt" | awk '{print $1}')
fi

log "probes"
boxed 5 probe-stat-tty.txt stat /dev/ttys000
boxed 5 probe-stat-ptmx.txt stat /dev/ptmx
boxed 8 probe-openpty.txt python3 -c 'import pty,os,time; t=time.time(); m,s=pty.openpty(); print("openpty ok", os.ttyname(s), f"{time.time()-t:.3f}s")'
boxed 8 probe-script.txt script -q /dev/null /usr/bin/true
boxed 15 lsof-ptmx.txt bash -c "lsof -b -w 2>/dev/null | awk '\$NF ~ /\\/dev\\/ptmx/ {print \$1, \$2}' | sort | uniq -c | sort -rn"

log "power and kernel logs"
pmset -g log 2>/dev/null | grep -E "	(Sleep|Wake|DarkWake|Assertions) " | tail -400 >"$out/pmset.txt"
log "  last sleep/wake: $(grep -E '	(Sleep|Wake) ' "$out/pmset.txt" | tail -1 | cut -c1-100)"
boxed 120 kernel-log-2h.txt log show --last 2h --predicate 'process == "kernel"' --style compact
boxed 60 kernel-log-tty.txt bash -c "grep -iE 'tty|pty|devfs|ptmx|hang|deadlock' '$out/kernel-log-2h.txt' | grep -v 'unnest of range'"

log "tie"
cfg="${XDG_CONFIG_HOME:-$HOME/.config}/tie"
mkdir -p "$out/tie"
cp "$cfg"/*.json "$out/tie/" 2>/dev/null
for f in "$cfg"/log/*.log; do [[ -f "$f" ]] && tail -n 300 "$f" >"$out/tie/$(basename "$f")"; done
for info in "$cfg"/*.json; do
  [[ -f "$info" ]] || continue
  inst="$(basename "$info" .json)"
  [[ "$inst" == settings* ]] && continue
  pid="$(node -p "try{require('$info').pid}catch{''}" 2>/dev/null)"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null || continue
  log "  instance $inst (pid $pid)"
  boxed 20 "tie/$inst-sample.txt" sample "$pid" 1
  boxed 5 "tie/$inst-list.json" env TIE_INSTANCE="$inst" "$ROOT/bin/tie" list --json
  boxed 5 "tie/$inst-children.txt" bash -c "ps -o pid,stat,etime,command -g \$(ps -o pgid= -p $pid | tr -d ' ') 2>/dev/null; pgrep -lfP $pid"
done

log "spindump (kernel stacks: the one thing user space can't see)"
if sudo -n true 2>/dev/null; then
  boxed 60 spindump.txt sudo -n spindump -notarget 3 -file "$out/spindump-full.txt"
else
  log "  needs sudo: run   sudo spindump -notarget 3 -file $out/spindump-full.txt"
fi

log "done → $out"
