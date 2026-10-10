# Electron Crash on Quit + Blocked Launches

Investigation during MVP build, 2026-10-09.

## Symptoms

- macOS "Electron quit unexpectedly" dialogs, repeatedly, during harness runs.
- Later: new instances never reached `app.whenReady()` (even a minimal Electron app).
- Orphaned Electron processes after test runs.

## Causes

1. **node-pty exit callback during teardown**
   - Crash stack: `pty.node ThreadSafeFunction::CallJS` → `Napi::Error::ThrowAsJavaScriptException` → abort.
   - Quitting with live ptys: exit callbacks call JS after/while Electron tears down; any throw (e.g. destroyed `webContents`) aborts.
2. **Harness killed npm wrapper**: `node_modules/.bin/electron` is a node launcher; killing it orphaned Electron.
3. **macOS state restoration prompt**: after crashes, macOS asks "reopen windows?" for `com.github.Electron`; the prompt blocks launch finishing, so `ready` never fires.

## Fixes

- `pty.ts`: `send()` never throws (guards destroyed window, try/catch).
- `index.ts`: `before-quit` → prevent, kill ptys, wait for exits (timeout + SIGKILL), then `app.exit(0)`. SIGTERM/SIGINT → `app.quit()`.
- Harness launches the Electron binary directly and stops it via pid from `~/.tie/<instance>.json`.
- Harness passes `-ApplePersistenceIgnoreState YES` to bypass the restore prompt.
- Info file written only after renderer signals ready (`renderer:ready`), so harness/CLI never race startup.

## Verification

- 3 start/stop cycles with running ptys: no new crash reports, no leftover processes.
- Full e2e suite: no new crash reports.
