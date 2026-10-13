// Shared harness utilities: instance info, tie CLI wrapper, CDP page connection, fresh instances.
import { spawn, execFile } from 'node:child_process'
import { existsSync, readFileSync, rmSync, openSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'node:net'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// Skip macOS 'reopen windows?' prompt after a crash; it blocks app launch indefinitely.
export const ELECTRON_ARGS = ['.', '-ApplePersistenceIgnoreState', 'YES']

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export const stateDir = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'tie')
export const infoPath = (instance) => join(stateDir, `${instance}.json`)

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
          // Must be *this* instance's page: ports can be reused, never drive another Tie (e.g. the user's).
          const id = await page.evaluate(async () => (await window.tie?.info())?.instance).catch(() => null)
          if (id === instance) return { browser, page }
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
// A port nobody is listening on right now (instance-name hashing can collide).
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

// opts.settings: pre-seed the instance's settings file (object, or raw string e.g. malformed JSON).
export async function launch(instance = `drive-${process.pid}`, opts = {}) {
  rmSync(infoPath(instance), { force: true })
  // Own settings file: tests never see (or touch) the user's settings.
  const env = {
    ...process.env,
    TIE_INSTANCE: instance,
    TIE_BACKGROUND: '1',
    TIE_CWD: ROOT,
    TIE_SETTINGS: join(ROOT, 'tmp', `${instance}.settings.json`),
    TIE_DEBUG_PORT: String(await freePort()),
    TIE_SCALE: process.env.TIE_SCALE || '2', // like a retina Mac
  }
  // Trace folder (TIE_RUN_DIR): app log with all debug tags + Electron stderr, kept after the run.
  const runDir = opts.runDir
  if (runDir) {
    mkdirSync(runDir, { recursive: true })
    env.TIE_LOG = join(runDir, 'app.log')
    env.TIE_DEBUG = process.env.TIE_DEBUG || '*'
  }
  delete env.TIE_SOCKET
  delete env.TIE_TILE
  delete env.ELECTRON_RUN_AS_NODE
  mkdirSync(join(ROOT, 'tmp'), { recursive: true })
  rmSync(env.TIE_SETTINGS, { force: true })
  if (opts.settings) writeFileSync(env.TIE_SETTINGS, typeof opts.settings === 'string' ? opts.settings : JSON.stringify(opts.settings))
  const errFile = runDir ? join(runDir, 'electron.log') : join(ROOT, 'tmp', `${instance}.stderr`)
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
    if (!runDir) rmSync(errFile, { force: true })
    rmSync(env.TIE_SETTINGS, { force: true })
  }
  return { instance, stop }
}
