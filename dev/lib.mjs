// Shared harness utilities: instance info, tie CLI wrapper, CDP page connection, fresh instances.
import { spawn, execFile } from 'node:child_process'
import { existsSync, readFileSync, rmSync, openSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// Skip macOS 'reopen windows?' prompt after a crash; it blocks app launch indefinitely.
export const ELECTRON_ARGS = ['.', '-ApplePersistenceIgnoreState', 'YES']

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export const infoPath = (instance) => join(homedir(), '.tie', `${instance}.json`)

export function readInfo(instance) {
  const p = infoPath(instance)
  if (!existsSync(p)) throw new Error(`instance "${instance}" not running (no ${p})`)
  return JSON.parse(readFileSync(p, 'utf8'))
}

// Run bin/tie against an instance; returns parsed JSON (or null for empty output).
export function tie(instance, ...args) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, TIE_INSTANCE: instance }
    delete env.TIE_SOCKET
    delete env.TIE_TILE
    execFile(join(ROOT, 'bin/tie'), [...args, '--json'], { env }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr.trim() || err.message))
      const out = stdout.trim()
      resolve(out ? JSON.parse(out) : null)
    })
  })
}

// Connect to the instance's renderer page over the debugging port.
export async function connectPage(instance) {
  const { debugPort } = readInfo(instance)
  if (!debugPort) throw new Error('instance has no debug port (release build?)')
  let lastErr
  for (let i = 0; i < 50; i++) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`)
      for (const ctx of browser.contexts()) {
        for (const page of ctx.pages()) {
          if (await page.$('#tiles').catch(() => null)) return { browser, page }
        }
      }
      await browser.close()
      lastErr = new Error('Tie page not found')
    } catch (e) {
      lastErr = e
    }
    await sleep(200)
  }
  throw lastErr
}

// Launch a fresh built instance in the background; returns { instance, stop }.
// opts.settings: pre-seed the instance's settings file (e.g. to test boot-time application).
export async function launch(instance = `drive-${process.pid}`, opts = {}) {
  rmSync(infoPath(instance), { force: true })
  // Own settings file: tests never see (or touch) the user's settings.
  const env = { ...process.env, TIE_INSTANCE: instance, TIE_BACKGROUND: '1', TIE_CWD: ROOT, TIE_SETTINGS: join(ROOT, 'tmp', `${instance}.settings.json`) }
  delete env.TIE_SOCKET
  delete env.TIE_TILE
  delete env.ELECTRON_RUN_AS_NODE
  mkdirSync(join(ROOT, 'tmp'), { recursive: true })
  rmSync(env.TIE_SETTINGS, { force: true })
  if (opts.settings) writeFileSync(env.TIE_SETTINGS, JSON.stringify(opts.settings))
  const errFile = join(ROOT, 'tmp', `${instance}.stderr`)
  const err = openSync(errFile, 'w')
  const child = spawn(join(ROOT, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), ELECTRON_ARGS, { cwd: ROOT, env, stdio: ['ignore', err, err] })
  for (let i = 0; i < 150 && !existsSync(infoPath(instance)); i++) await sleep(100)
  if (!existsSync(infoPath(instance))) {
    child.kill()
    throw new Error(`instance failed to start, see ${errFile}`)
  }
  // Kill Electron itself (pid from info file), not the npm wrapper.
  const pid = readInfo(instance).pid
  const stop = async () => {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {}
    for (let i = 0; i < 50 && existsSync(infoPath(instance)); i++) await sleep(100)
    rmSync(errFile, { force: true })
    rmSync(env.TIE_SETTINGS, { force: true })
  }
  return { instance, stop }
}
