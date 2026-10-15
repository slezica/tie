// Checks a packaged Tie.app: Electron fuses as expected, then a smoke launch (boots, CLI answers).
// Usage: node dev/package-check.mjs [path/to/Tie.app]
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, sleep, infoPath } from './lib.mjs'

const app = process.argv[2] || join(ROOT, 'out/package/mac-arm64/Tie.app')
let failed = false
const fail = (msg) => ((failed = true), console.log(`FAIL ${msg}`))

// SECURITY: fuses are baked into the binary; these must hold for every package.
// RunAsNode stays on: the bundled CLI launcher (resources/bin/tie) runs Tie as Node.
const EXPECTED = {
  RunAsNode: 'Enabled',
  EnableCookieEncryption: 'Enabled',
  EnableNodeOptionsEnvironmentVariable: 'Disabled', // NODE_OPTIONS=--require evil.js
  EnableNodeCliInspectArguments: 'Disabled', // --inspect / SIGUSR1: attach a debugger = run code
  EnableEmbeddedAsarIntegrityValidation: 'Enabled', // tampered app.asar refuses to load
  OnlyLoadAppFromAsar: 'Enabled', // no loading a planted app/ folder instead
  GrantFileProtocolExtraPrivileges: 'Disabled', // file:// pages can't read other files
}
const out = execFileSync('npx', ['@electron/fuses', 'read', '--app', app], { cwd: ROOT, encoding: 'utf8' })
const actual = Object.fromEntries([...out.matchAll(/^\s+(\w+) is (\w+)/gm)].map((m) => [m[1], m[2]]))
for (const [k, v] of Object.entries(EXPECTED)) {
  if (actual[k] === v) console.log(`ok   fuse ${k} ${v}`)
  else fail(`fuse ${k}: ${actual[k]} (want ${v})`)
}

// Smoke: packaged app boots in the background and answers the bundled CLI.
const instance = `pkg-${process.pid}`
const settings = join(ROOT, 'tmp', `${instance}.settings.json`)
const log = join(ROOT, 'tmp', `${instance}.log`)
const env = { ...process.env, TIE_INSTANCE: instance, TIE_BACKGROUND: '1', TIE_SETTINGS: settings, TIE_LOG: log, TIE_DEBUG: 'security,app' }
delete env.TIE_SOCKET
delete env.TIE_TILE
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(join(app, 'Contents/MacOS/Tie'), ['-ApplePersistenceIgnoreState', 'YES'], { env, stdio: 'ignore' })
try {
  for (let i = 0; i < 100 && !existsSync(infoPath(instance)); i++) await sleep(100)
  if (!existsSync(infoPath(instance))) fail('packaged app did not start')
  else {
    const list = JSON.parse(execFileSync(join(app, 'Contents/Resources/bin/tie'), ['list', '--json'], { env, encoding: 'utf8' }))
    if (list.tiles?.length === 1) console.log('ok   smoke: boots, CLI answers')
    else fail(`smoke: unexpected list ${JSON.stringify(list)}`)
    // Markdown viewer is packaged (not a dev-only viewer): a file opens without error.
    const md = join(ROOT, 'tmp', `${instance}.md`)
    writeFileSync(md, '# smoke\n')
    const tie = (...a) => JSON.parse(execFileSync(join(app, 'Contents/Resources/bin/tie'), [...a, '--json'], { env, encoding: 'utf8' }))
    const id = tie('open', md).id
    let t
    for (let i = 0; i < 30 && !t?.doc; i++) (await sleep(100), (t = tie('list').tiles.find((x) => x.id === id)))
    rmSync(md, { force: true })
    if (t?.doc && !t.error) console.log('ok   smoke: markdown opens')
    else fail(`smoke: markdown tile ${JSON.stringify(t)}`)
    const refused = (existsSync(log) ? readFileSync(log, 'utf8') : '').match(/\[security\].*/g) || []
    if (refused.length) fail(`smoke: security log not empty:\n  ${refused.join('\n  ')}`)
  }
} finally {
  child.kill('SIGTERM')
  for (let i = 0; i < 50 && existsSync(infoPath(instance)); i++) await sleep(100)
  rmSync(settings, { force: true })
  if (!failed) rmSync(log, { force: true })
  else console.log(`log: ${log}`)
}
process.exit(failed ? 1 : 0)
