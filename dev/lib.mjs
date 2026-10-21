// Shared harness utilities: instance info, tie CLI wrapper, CDP page connection, fresh instances.
import { spawn, execFile } from 'node:child_process'
import { existsSync, readFileSync, rmSync, openSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer, connect as netConnect } from 'node:net'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// Skip macOS 'reopen windows?' prompt after a crash; it blocks app launch indefinitely.
export const ELECTRON_ARGS = ['.', '-ApplePersistenceIgnoreState', 'YES']

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// A log line as a human reads it: <untrusted> markers removed, \uXXXX escapes undone. Mirrors
// src/core/log.ts plainLog (the harness can't import TypeScript).
export const plainLog = (text) => text.replaceAll('<untrusted>', '').replaceAll('</untrusted>', '').replace(/\\u([0-9a-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))

export const stateDir = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'tie')
export const infoPath = (instance) => join(stateDir, `${instance}.json`)
// Electron profile of an instance (main: app userData = <appData>/tie-<instance>). Fresh harness
// instances remove theirs on stop.
export const userDataPath = (instance) => join(homedir(), 'Library/Application Support', `tie-${instance}`)
// Browser downloads of a fresh harness instance (TIE_DOWNLOADS, dev builds only): never the user's
// ~/Downloads. Removed on stop.
export const downloadsPath = (instance) => join(ROOT, 'tmp', `${instance}.downloads`)

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

// Socket errors for toolkit commands: the message alone, exit 1 (e.g. 'External control is off':
// a user-run instance only answers external callers like tie-dev with the setting on).
export function fail(e) {
  console.error(e.message)
  process.exit(1)
}

// Raw socket call (JSON-RPC) to an instance; for methods bin/tie doesn't expose (dev `input`).
export function rpc(instance, method, params = {}) {
  return new Promise((resolve, reject) => {
    const c = netConnect(readInfo(instance).socket)
    let buf = ''
    c.on('error', reject)
    c.on('connect', () => c.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) + '\n'))
    c.on('data', (d) => {
      buf += d
      if (!buf.includes('\n')) return
      c.end()
      const msg = JSON.parse(buf.slice(0, buf.indexOf('\n')))
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
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

// opts.settings: pre-seed the instance's settings file (object, merged over the seed
// { allowExternalControl: true }; or raw string e.g. malformed JSON, written as-is).
// opts.hiddenWindow: never-shown real window instead of offscreen (input reaches content frames).
// opts.env: extra environment (scenario `export const env`).
export async function launch(instance = `drive-${process.pid}`, opts = {}) {
  rmSync(infoPath(instance), { force: true })
  // Own settings file: tests never see (or touch) the user's settings.
  const env = {
    ...process.env,
    TIE_INSTANCE: instance,
    TIE_BACKGROUND: opts.hiddenWindow ? 'hidden' : '1',
    TIE_CWD: ROOT,
    TIE_SETTINGS: join(ROOT, 'tmp', `${instance}.settings.json`),
    TIE_DOWNLOADS: downloadsPath(instance),
    TIE_DEBUG_PORT: String(await freePort()),
    TIE_SCALE: process.env.TIE_SCALE || '2', // like a retina Mac
    ...opts.env,
  }
  // Trace folder (TIE_RUN_DIR): app log with all debug tags + Electron stderr, kept after the run.
  const runDir = opts.runDir
  if (runDir) {
    mkdirSync(runDir, { recursive: true })
    env.TIE_LOG = join(runDir, 'app.log')
    env.TIE_DEBUG = opts.env?.TIE_DEBUG ?? (process.env.TIE_DEBUG || '*') // scenario env wins (sec-log: debug off)
  }
  delete env.TIE_SOCKET
  delete env.TIE_TILE
  delete env.ELECTRON_RUN_AS_NODE
  mkdirSync(join(ROOT, 'tmp'), { recursive: true })
  rmSync(env.TIE_SETTINGS, { force: true })
  // The harness drives Tie from outside (not from a Tie terminal): external control seeded on.
  // Scenario settings win (seed first); a raw string is written as-is (no seed).
  const seeded = typeof opts.settings === 'string' ? opts.settings : JSON.stringify({ allowExternalControl: true, ...opts.settings })
  writeFileSync(env.TIE_SETTINGS, seeded)
  const errFile = runDir ? join(runDir, 'electron.log') : join(ROOT, 'tmp', `${instance}.stderr`)
  const err = openSync(errFile, 'w')
  const bin = join(ROOT, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
  // Electron's binary is downloaded by `install-electron` (our postinstall), not by its package.
  if (!existsSync(bin)) throw new Error(`no Electron binary at ${bin}: run npm install (postinstall downloads it)`)
  const child = spawn(bin, ELECTRON_ARGS, { cwd: ROOT, env, stdio: ['ignore', err, err] })
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
    rmSync(env.TIE_DOWNLOADS, { recursive: true, force: true })
    rmSync(userDataPath(instance), { recursive: true, force: true })
  }
  return { instance, stop }
}
