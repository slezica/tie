// Run a Playwright scenario against a fresh (default) or running (--attach) instance.
// Scenario = module exporting `async (ctx, helpers)`; from file, dev/scenarios name, or stdin (-).
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, appendFileSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, sleep, tie, connectPage, launch, plainLog, leftovers, leakedPtys } from './lib.mjs'
import * as helpers from './helpers.mjs'

const args = process.argv.slice(2)
const attach = args.includes('--attach')
const keep = args.includes('--keep')
const spec = args.find((a) => !a.startsWith('--'))
if (!spec) {
  console.error('usage: drive <scenario|-> [--attach] [--keep]')
  process.exit(1)
}

let file
let name
if (spec === '-') {
  name = 'stdin'
  const src = readFileSync(0, 'utf8')
  file = join(ROOT, 'tmp', `stdin-${process.pid}.mjs`)
  mkdirSync(join(ROOT, 'tmp'), { recursive: true })
  // Bare statements become the scenario body; helpers are in scope. Inner block: user code may
  // redeclare any wrapper name (const h = ..., const list = ...).
  const body = /export\s+default/.test(src) ? src : `export default async (ctx, h) => {\n const { ${Object.keys(helpers).join(', ')} } = h\n{\n${src}\n}\n}`
  writeFileSync(file, body)
} else {
  const named = join(ROOT, 'dev/scenarios', `${spec}.mjs`)
  file = existsSync(named) ? named : resolve(spec)
  name = basename(file, '.mjs')
}

// Scenario modules may export `settings` to pre-seed a fresh instance, `hiddenWindow` for a real
// (never shown) window instead of offscreen, `env` for extra environment.
let mod
try {
  mod = await import(pathToFileURL(file).href)
} finally {
  if (spec === '-') rmSync(file, { force: true }) // also on SyntaxError
}
// Every run leaves a trace folder: out/log/runs/<time>-<name>/ (or TIE_RUN_DIR from tie-dev test --e2e).
const d = new Date()
const p2 = (n) => String(n).padStart(2, '0')
const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}` // local time
const runDir = process.env.TIE_RUN_DIR || join(ROOT, 'out/log/runs', `${stamp}-${name}`)
mkdirSync(runDir, { recursive: true })
// Mirror the runner's own output (results, shot paths, errors) into the trace.
for (const k of ['log', 'error']) {
  const orig = console[k].bind(console)
  console[k] = (...a) => {
    appendFileSync(join(runDir, 'drive.log'), (k === 'error' ? 'ERROR ' : '') + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n')
    orig(...a)
  }
}
let fresh = null
try {
  fresh = attach ? null : await launch(undefined, { settings: mod.settings, hiddenWindow: mod.hiddenWindow, env: mod.env, runDir })
} catch (e) {
  console.error(e.stack || e.message)
  appendFileSync(join(runDir, 'drive.log'), 'exit=1\n')
  process.stderr.write(`trace: ${runDir}\n`)
  process.exit(1)
}
const instance = fresh?.instance ?? (process.env.TIE_INSTANCE || 'dev')
const shotDir = join(runDir, 'shots')
rmSync(shotDir, { recursive: true, force: true })
mkdirSync(shotDir, { recursive: true })

let browser
let code = 0
try {
  const conn = await connectPage(instance)
  browser = conn.browser
  const page = conn.page
  await page.waitForSelector('.tab') // booted (first render; the boot terminal may already be gone: quit-empty)
  await sleep(500)
  let n = 0
  const ctx = {
    page,
    instance,
    sleep,
    tie: (...a) => tie(instance, ...a),
    shot: async (label) => {
      const p = join(shotDir, `${String(++n).padStart(2, '0')}-${label}.png`)
      await page.screenshot({ path: p, scale: 'css' })
      console.log(p)
      return p
    },
    log: (...a) => console.log(...a),
    runDir,
    // The app log as a human reads it (<untrusted> markers removed, escapes undone: core/log.ts); rawLog: the file.
    appLog: () => plainLog(existsSync(join(runDir, 'app.log')) ? readFileSync(join(runDir, 'app.log'), 'utf8') : ''),
    rawLog: () => (existsSync(join(runDir, 'app.log')) ? readFileSync(join(runDir, 'app.log'), 'utf8') : ''),
  }
  const result = await mod.default(ctx, helpers)
  if (result !== undefined) console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
} catch (e) {
  console.error(e.stack || e.message)
  code = 1
} finally {
  await browser?.close().catch(() => {})
  if (fresh && !keep) {
    await fresh.stop()
    // ptys left behind after the instance is gone: its terminal processes still alive (a leak in
    // Tie) or stuck spawn-helpers (the wedge, `tie-dev ptys`). This instance's only: parallel runs.
    let left = leftovers(instance)
    for (let i = 0; i < 20 && left.length; i++) (await sleep(100), (left = leftovers(instance)))
    const leaked = leakedPtys(left)
    appendFileSync(join(runDir, 'drive.log'), `ptys=${leaked}\n` + left.map((p) => `  left: ${p.pid} ${p.tty} ${p.command.slice(0, 80)}\n`).join(''))
    if (leaked > 0) console.error(`ptys leaked: +${leaked}`)
  }
  if (fresh && keep) console.log(`kept instance: ${instance}`)
  appendFileSync(join(runDir, 'drive.log'), `exit=${code}\n`)
  process.stderr.write(`trace: ${runDir}\n`)
}
process.exit(code)
