// Checks a packaged Tie.app: Electron fuses as expected, then a smoke launch (boots, CLI answers).
// Usage: node dev/package-check.mjs [path/to/Tie.app]
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { ROOT, sleep, infoPath, userDataPath } from './lib.mjs'

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

// Smoke: packaged app boots in the background and answers the bundled CLI; markdown (+ diagram
// library), html and text tiles open; a browser tile loads a local page.
const instance = `pkg-${process.pid}`
const settings = join(ROOT, 'tmp', `${instance}.settings.json`)
const log = join(ROOT, 'tmp', `${instance}.log`)
const env = { ...process.env, TIE_INSTANCE: instance, TIE_BACKGROUND: '1', TIE_SETTINGS: settings, TIE_LOG: log, TIE_DEBUG: 'security,app,content' }
delete env.TIE_SOCKET
delete env.TIE_TILE
delete env.ELECTRON_RUN_AS_NODE
// The bundled CLI runs from here, not a Tie terminal: an external caller (Settings → Security).
writeFileSync(settings, JSON.stringify({ allowExternalControl: true }))
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
    writeFileSync(md, '# smoke\n\n```mermaid\nflowchart LR\n  A --> B\n```\n')
    const tie = (...a) => JSON.parse(execFileSync(join(app, 'Contents/Resources/bin/tie'), [...a, '--json'], { env, encoding: 'utf8' }))
    const id = tie('open', md).id
    let t
    for (let i = 0; i < 30 && !t?.doc; i++) (await sleep(100), (t = tie('list').tiles.find((x) => x.id === id)))
    if (t?.doc && !t.error) console.log('ok   smoke: markdown opens')
    else fail(`smoke: markdown tile ${JSON.stringify(t)}`)
    // Diagram library packaged and served (lazy: requested only for a document with a diagram).
    const appLog = () => (existsSync(log) ? readFileSync(log, 'utf8') : '')
    for (let i = 0; i < 50 && !/\[content\] viewer markdown-mermaid\.js/.test(appLog()); i++) await sleep(100)
    rmSync(md, { force: true })
    if (/\[content\] viewer markdown-mermaid\.js/.test(appLog())) console.log('ok   smoke: diagram library served')
    else fail('smoke: diagram library not requested')
    // Html (document serving, bootstrap inlined from the packaged viewers) and text (sniffed).
    const html = join(ROOT, 'tmp', `${instance}.html`)
    const txt = join(ROOT, 'tmp', `${instance}-plain`)
    writeFileSync(html, '<!doctype html><title>smoke</title><p>smoke</p>')
    writeFileSync(txt, 'plain\n')
    const hid = tie('open', html).id
    const xid = tie('open', txt).id
    let ht, xt
    for (let i = 0; i < 50 && !(ht?.page?.ready && xt?.doc); i++) (await sleep(100), (ht = tie('list').tiles.find((x) => x.id === hid)), (xt = tie('list').tiles.find((x) => x.id === xid)))
    // Close before removing: the html tile watches its folder (a reload of a removed page logs a refusal).
    for (const id of [hid, xid]) execFileSync(join(app, 'Contents/Resources/bin/tie'), ['close', id], { env })
    rmSync(html, { force: true })
    rmSync(txt, { force: true })
    if (ht?.page?.ready && !ht.error) console.log('ok   smoke: html page loads (bootstrap answered)')
    else fail(`smoke: html tile ${JSON.stringify(ht)}`)
    if (xt?.kind === 'text' && xt.doc && !xt.error) console.log('ok   smoke: text file opens')
    else fail(`smoke: text tile ${JSON.stringify(xt)}`)
    // Browser: a guest attaches (packaged attach guard) and loads a local http page (title).
    const srv = createServer((_q, r) => (r.setHeader('content-type', 'text/html'), r.end('<!doctype html><title>smoke web</title><p>web')))
    await new Promise((r) => srv.listen(0, '127.0.0.1', r))
    try {
      const bid = tie('open', `http://127.0.0.1:${srv.address().port}/`).id
      let bt = null
      for (let i = 0; i < 50 && bt?.title !== 'smoke web'; i++) (await sleep(100), (bt = tie('list').tiles.find((x) => x.id === bid)))
      if (bt?.kind === 'browser' && bt.title === 'smoke web' && !bt.error) console.log('ok   smoke: browser tile loads a local page')
      else fail(`smoke: browser tile ${JSON.stringify(bt)}`)
    } finally {
      srv.closeAllConnections?.()
      srv.close()
    }
    const refused = (existsSync(log) ? readFileSync(log, 'utf8') : '').match(/\[security\].*/g) || []
    if (refused.length) fail(`smoke: security log not empty:\n  ${refused.join('\n  ')}`)
  }
} finally {
  child.kill('SIGTERM')
  for (let i = 0; i < 50 && existsSync(infoPath(instance)); i++) await sleep(100)
  rmSync(settings, { force: true })
  rmSync(userDataPath(instance), { recursive: true, force: true })
  if (!failed) rmSync(log, { force: true })
  else console.log(`log: ${log}`)
}
process.exit(failed ? 1 : 0)
