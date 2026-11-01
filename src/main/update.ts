// Staged update (PACKAGING.md "Install while running"). Electron spawns helpers from its bundle
// lazily, so `tie-dev install` never replaces the bundle of a running Tie: it stages the new one at
// <stateDir>/staged/Tie.app, then writes staged/target (the bundle it replaces; written last = the
// stage is complete). The next launch of that bundle swaps the stage in, before the single-instance
// lock or any window, and relaunches. Packaged builds only; a failed swap leaves the stage, logs and
// starts the current version.
import { app } from 'electron'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { stateDir, log } from './env'

export const stageDir = join(stateDir, 'staged')

const read = (p: string) => {
  try {
    return readFileSync(p, 'utf8').trim()
  } catch {
    return ''
  }
}
const real = (p: string) => {
  try {
    return realpathSync(p)
  } catch {
    return ''
  }
}

// Other processes running this bundle's executable (another instance, the bundled CLI): swapping
// under them would make them spawn new-version helpers. The swap then waits for a later launch.
function othersRunning(exe: string) {
  const out = execFileSync('/bin/ps', ['-axwwo', 'pid=,command='], { encoding: 'utf8' })
  return out.split('\n').some((l) => {
    const m = l.trim().match(/^(\d+) (.*)$/)
    return !!m && Number(m[1]) !== process.pid && (m[2] === exe || m[2].startsWith(`${exe} `))
  })
}

// Stage into place: a rename (same volume), else a copy (ditto: symlinks, modes, xattrs) + remove.
function moveIn(from: string, to: string) {
  try {
    renameSync(from, to)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e
    execFileSync('/usr/bin/ditto', [from, to])
    rmSync(from, { recursive: true, force: true })
  }
}

// true: swapped, relaunch requested and exiting (the caller starts nothing).
export function applyStaged(): boolean {
  if (!app.isPackaged) return false
  const stage = join(stageDir, 'Tie.app')
  if (!existsSync(stage)) return false
  const exe = process.execPath // …/Tie.app/Contents/MacOS/Tie
  const bundle = dirname(dirname(dirname(exe)))
  // Only the bundle the stage was made for (not out/package, harness or smoke copies).
  const target = read(join(stageDir, 'target'))
  if (!target || !bundle.endsWith('.app') || real(target) !== real(bundle)) return false
  const old = `${bundle}.old`
  let moved = false
  try {
    // SECURITY: the stage is trusted as the user's own: it lives in the private state dir (0700,
    // env.ts), the same trust as the settings and sockets there. No signature check (ad-hoc builds
    // have no stable identity); a real directory owned by the user, not a symlink.
    const st = lstatSync(stage)
    if (!st.isDirectory() || st.uid !== process.getuid?.()) return (log('update', 'stage refused (not a directory owned by the user)', stage), false)
    const fp = read(join(stage, 'Contents/Resources/fingerprint'))
    if (!fp || !existsSync(join(stage, 'Contents/MacOS/Tie'))) return (log('update', 'stage incomplete, left in place', stage), false)
    const own = read(join(process.resourcesPath, 'fingerprint'))
    if (fp === own) {
      rmSync(stageDir, { recursive: true, force: true })
      log('update', 'stage already installed, removed', fp)
      return false
    }
    if (othersRunning(exe)) return (log('update', 'stage waits: another process runs', exe), false)
    rmSync(old, { recursive: true, force: true }) // leftover of an earlier swap
    // Never a dead bundle: the current one moves aside first, and back if the stage can't move in.
    renameSync(bundle, old)
    moved = true
    moveIn(stage, bundle)
    moved = false
    rmSync(stageDir, { recursive: true, force: true })
    try {
      rmSync(old, { recursive: true, force: true })
    } catch (e) {
      log('update', 'old bundle left', old, String(e))
    }
    log('update', 'swapped', { bundle, from: own, to: fp })
    app.relaunch()
    app.exit(0)
    return true
  } catch (e) {
    if (moved) {
      try {
        rmSync(bundle, { recursive: true, force: true }) // a partial copy
        renameSync(old, bundle)
      } catch (e2) {
        log('update', 'restore failed: bundle at', old, String(e2))
      }
    }
    log('update', 'swap failed, stage left in place', String(e))
    console.error('tie: staged update failed:', e)
    return false
  }
}
