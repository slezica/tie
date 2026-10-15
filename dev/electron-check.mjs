// Electron version check: pinned (package.json, exact) vs npm dist-tags.
// Exit 1: behind the latest patch of our major. Newer major: info only. npm unreachable: warning.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './lib.mjs'

const warnings = []
const warn = (msg) => (warnings.push(msg), console.log(`WARNING ${msg}`))
const finish = (code) => {
  // Repeated at the end so they're seen.
  if (warnings.length) console.log(`warnings:\n${warnings.map((w) => `  ${w}`).join('\n')}`)
  process.exit(code)
}

// ELECTRON_CHECK_PINNED: pretend-pinned version, to test this script.
const pinned = process.env.ELECTRON_CHECK_PINNED || JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).devDependencies?.electron
if (!/^\d+\.\d+\.\d+$/.test(pinned ?? '')) {
  console.log(`electron must be pinned to an exact version in package.json (got ${pinned})`)
  process.exit(1)
}
const major = pinned.split('.')[0]

let tags
try {
  tags = JSON.parse(execFileSync('npm', ['view', 'electron', 'dist-tags', '--json'], { encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'ignore'] }))
} catch (e) {
  warn(`can't reach npm, electron version not checked (${e.code || e.message.split('\n')[0]})`)
  finish(0)
}
const line = tags[`${major}-x-y`]
const cmp = (a, b) => a.split('.').map(Number).reduce((d, x, i) => d || x - Number(b.split('.')[i]), 0)
if (!line) warn(`no ${major}-x-y tag on npm: line unknown or retired`)
else if (cmp(pinned, line) < 0) console.log(`electron ${pinned}: behind, latest ${major}.x is ${line}`)
else console.log(`electron ${pinned}: up to date (latest ${major}.x)`)
const latest = tags.latest
if (latest && Number(latest.split('.')[0]) > Number(major)) console.log(`info: newer major ${latest}`)
finish(line && cmp(pinned, line) < 0 ? 1 : 0)
