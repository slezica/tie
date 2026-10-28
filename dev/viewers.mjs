// Content viewers (src/viewers/<kind>.html|ts) → out/viewers: classic IIFE scripts (opaque-origin
// frames can't load modules from tie-content), the html copied as-is, prebuilt assets (mermaid),
// and the html bootstrap (inlined into html documents by main; ASCII-only). Used by the build
// (electron.vite.config.ts) and by `--watch` (tie-dev run --hot): rebuilds the changed kind so a
// dev instance's frames reload (main watches out/viewers; docs/HARNESS.md "Hot").
import { build } from 'vite'
import { copyFileSync, mkdirSync, readdirSync, watch } from 'node:fs'
import { resolve, basename, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(ROOT, 'src/viewers')
const OUT = resolve(ROOT, 'out/viewers')
const require = createRequire(import.meta.url)
// Mermaid: the "tiny" IIFE (no mindmap, architecture, KaTeX), pinned in package.json.
const ASSETS = { 'markdown-mermaid.js': require.resolve('@mermaid-js/tiny') }
const BOOTSTRAP = 'html-bootstrap'

// Every kind with a viewer page (the policy table's viewer kinds have one each; probe is dev-only).
export const allKinds = () => readdirSync(SRC).filter((f) => f.endsWith('.html')).map((f) => basename(f, '.html'))

const lib = (entry, name, fileName, extra = {}) =>
  build({
    configFile: false,
    logLevel: 'warn',
    ...extra,
    build: { outDir: OUT, emptyOutDir: false, lib: { entry: resolve(SRC, `${entry}.ts`), formats: ['iife'], name, fileName: () => fileName } },
  })

export async function buildViewer(kind) {
  mkdirSync(OUT, { recursive: true })
  await lib(kind, 'viewer', `${kind}.js`)
  copyFileSync(resolve(SRC, `${kind}.html`), resolve(OUT, `${kind}.html`))
}

export async function buildBootstrap() {
  mkdirSync(OUT, { recursive: true })
  await lib(BOOTSTRAP, 'tieBootstrap', `${BOOTSTRAP}.js`, { esbuild: { charset: 'ascii' } })
}

export async function buildViewers(kinds = allKinds()) {
  for (const kind of kinds) await buildViewer(kind)
  for (const [name, from] of Object.entries(ASSETS)) copyFileSync(from, resolve(OUT, name))
  await buildBootstrap()
}

// Watch src/viewers: a kind's own files rebuild that kind; shared modules rebuild every kind.
// Debounced; builds never overlap (a change during a build queues one more pass).
export function watchViewers(kinds = allKinds(), log = (m) => console.log(m)) {
  let pending = new Set()
  let timer = null
  let running = false
  const run = async () => {
    if (running) return
    running = true
    const batch = [...pending]
    pending = new Set()
    const t0 = Date.now()
    try {
      const all = batch.includes('*') || batch.includes(BOOTSTRAP)
      for (const kind of all ? kinds : batch) await buildViewer(kind)
      if (all || batch.includes(BOOTSTRAP)) await buildBootstrap()
      log(`viewers: rebuilt ${all ? 'all' : batch.join(', ')} (${Date.now() - t0} ms)`)
    } catch (e) {
      log(`viewers: build failed: ${e.message ?? e}`)
    }
    running = false
    if (pending.size) schedule()
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(run, 150)
  }
  watch(SRC, (_ev, file) => {
    if (!file) return
    const name = basename(String(file)).replace(/\.(html|ts)$/, '')
    if (!/\.(html|ts)$/.test(String(file)) || name.endsWith('.d')) return
    pending.add(kinds.includes(name) ? name : name === BOOTSTRAP ? BOOTSTRAP : '*')
    schedule()
  })
  log(`viewers: watching ${SRC}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--watch')) watchViewers()
  else await buildViewers()
}
