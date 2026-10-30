// e2e runner (`tie-dev test --e2e [--jobs N] [names|globs...]`): scenarios on fresh instances, N at
// a time. One run folder: summary.txt (scenario order) + one trace folder per scenario.
// Scenarios exporting `exclusive = true` run alone, after the others (they touch what every
// instance shares, e.g. out/viewers).
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './lib.mjs'

const args = process.argv.slice(2)
let jobs = Number(process.env.TIE_JOBS || 4)
const patterns = []
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--jobs' || a === '-j') jobs = Number(args[++i])
  else if (a.startsWith('--jobs=')) jobs = Number(a.slice(7))
  else if (a.startsWith('-')) (console.error(`unknown option: ${a}`), process.exit(1))
  else patterns.push(a.replace(/^dev\/scenarios\//, '').replace(/\.mjs$/, ''))
}
if (!Number.isInteger(jobs) || jobs < 1) (console.error('--jobs needs a positive integer'), process.exit(1))

// Shell glob (* ? [..]) over scenario names.
const globRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
const dir = join(ROOT, 'dev/scenarios')
const all = readdirSync(dir).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)).sort()
let names = all
if (patterns.length) {
  const res = patterns.map((p) => [p, globRe(p)])
  const none = res.filter(([, re]) => !all.some((n) => re.test(n))).map(([p]) => p)
  if (none.length) (console.error(`no scenario matches: ${none.join(' ')}`), process.exit(1))
  names = all.filter((n) => res.some(([, re]) => re.test(n)))
}
const exclusive = new Set(names.filter((n) => /^export const exclusive = true/m.test(readFileSync(join(dir, `${n}.mjs`), 'utf8'))))

const p2 = (n) => String(n).padStart(2, '0')
const d = new Date()
const run = join(ROOT, 'out/log/runs', `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}-e2e`)
mkdirSync(run, { recursive: true })

const lines = new Map()
let fail = 0
const one = (name) =>
  new Promise((resolve) => {
    const t0 = Date.now()
    const child = spawn(process.execPath, [join(ROOT, 'dev/drive.mjs'), join(dir, `${name}.mjs`)], { cwd: ROOT, env: { ...process.env, TIE_RUN_DIR: join(run, name) }, stdio: 'ignore' })
    child.on('exit', (code) => {
      const secs = ((Date.now() - t0) / 1000).toFixed(1)
      let line = code === 0 ? `ok   ${name} (${secs}s)` : `FAIL ${name} (${secs}s) (${join(run, name)}/)`
      if (code !== 0) fail = 1
      const log = join(run, name, 'drive.log')
      const leaked = existsSync(log) ? Number(/^ptys=(\d+)/m.exec(readFileSync(log, 'utf8'))?.[1] ?? 0) : 0
      if (leaked > 0) line += ` (ptys +${leaked})`
      lines.set(name, line)
      console.log(line)
      resolve()
    })
  })

const t0 = Date.now()
const queue = names.filter((n) => !exclusive.has(n))
await Promise.all(
  Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    while (queue.length) await one(queue.shift())
  }),
)
for (const n of names.filter((n) => exclusive.has(n))) await one(n)

writeFileSync(join(run, 'summary.txt'), names.map((n) => lines.get(n)).join('\n') + '\n')
const failed = names.filter((n) => lines.get(n).startsWith('FAIL')).length
console.log(`${names.length - failed}/${names.length} passed, ${Math.round((Date.now() - t0) / 1000)}s, jobs ${jobs}`)
console.log(`trace: ${run}`)
process.exit(fail)
