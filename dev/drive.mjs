// Run a Playwright scenario against a fresh (default) or running (--attach) instance.
// Scenario = module exporting `async (ctx, helpers)`; from file, dev/scenarios name, or stdin (-).
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, sleep, tie, connectPage, launch } from './lib.mjs'
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
  // Bare statements become the scenario body; helpers are in scope.
  const body = /export\s+default/.test(src) ? src : `export default async (ctx, h) => {\n const { ${Object.keys(helpers).join(', ')} } = h\n${src}\n}`
  writeFileSync(file, body)
} else {
  const named = join(ROOT, 'dev/scenarios', `${spec}.mjs`)
  file = existsSync(named) ? named : resolve(spec)
  name = basename(file, '.mjs')
}

// Scenario modules may export `settings` to pre-seed a fresh instance.
const mod = await import(pathToFileURL(file).href)
const fresh = attach ? null : await launch(undefined, { settings: mod.settings })
const instance = fresh?.instance ?? (process.env.TIE_INSTANCE || 'default')
const shotDir = join(ROOT, 'tmp/shots', name)
rmSync(shotDir, { recursive: true, force: true })
mkdirSync(shotDir, { recursive: true })

let browser
let code = 0
try {
  const conn = await connectPage(instance)
  browser = conn.browser
  const page = conn.page
  await page.waitForSelector('.tile')
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
  }
  const result = await mod.default(ctx, helpers)
  if (result !== undefined) console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
} catch (e) {
  console.error(e.stack || e.message)
  code = 1
} finally {
  await browser?.close().catch(() => {})
  if (spec === '-') rmSync(file, { force: true })
  if (fresh && !keep) await fresh.stop()
  if (fresh && keep) console.log(`kept instance: ${instance}`)
}
process.exit(code)
