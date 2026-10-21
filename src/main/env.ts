// Instance identity and paths. Each TIE_INSTANCE gets its own socket, lock, debug port, log, settings.
// Installed app = `default`; dev runs (repo checkout) = `dev`, so both can run side by side.
import { app } from 'electron'
import { mkdirSync, appendFileSync, existsSync, readdirSync, renameSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { formatArg } from '../core/log'

export const instance = process.env.TIE_INSTANCE || (app.isPackaged ? 'default' : 'dev')
// All state lives in ~/.config/tie (or $XDG_CONFIG_HOME/tie): settings, sockets, info files, logs.
export const stateDir = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'tie')
export const logDir = join(stateDir, 'log')
// SECURITY: the state dir holds the control sockets (= run commands as the user), logs (commands,
// paths, URLs) and settings. Private to the user: 0700 (created or not; ~/.config itself is often
// 0755), and every file Tie writes there is 0600 (PRIVATE). Other local accounts get nothing.
export const PRIVATE = 0o600
mkdirSync(logDir, { recursive: true, mode: 0o700 })
for (const d of [stateDir, logDir]) {
  try {
    chmodSync(d, 0o700)
    for (const f of readdirSync(d, { withFileTypes: true })) if (f.isFile() || f.isSocket()) chmodSync(join(d, f.name), PRIVATE) // files from before this rule
  } catch {}
}

// One-time move of settings from the old ~/.tie (sockets/logs there are disposable).
const oldDir = join(homedir(), '.tie')
if (existsSync(oldDir)) {
  for (const f of readdirSync(oldDir).filter((f) => /^settings(\..+)?\.json$/.test(f))) {
    if (!existsSync(join(stateDir, f))) renameSync(join(oldDir, f), join(stateDir, f))
  }
}

export const socketPath = join(stateDir, `${instance}.sock`)
export const infoPath = join(stateDir, `${instance}.json`)
export const logPath = process.env.TIE_LOG || join(logDir, `${instance}.log`) // TIE_LOG: harness trace folder

// Port per instance name; tie-dev and the harness pass a free one (TIE_DEBUG_PORT).
function hash(s: string) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}
export const debugPort = Number(process.env.TIE_DEBUG_PORT) || 9300 + (hash(instance) % 600)

// TIE_DEBUG=layout,shelf,pty (or "*") enables tagged logs to logPath. SECURITY: the `security`
// tag is always on (every refusal and block is on record); values that aren't Tie's are marked
// <untrusted>…</untrusted> and escaped (core/log.ts `untrusted`).
const tags = new Set((process.env.TIE_DEBUG || '').split(',').filter(Boolean))
export const debugTags = [...tags]
export function log(tag: string, ...args: unknown[]) {
  if (tag !== 'security' && !tags.has(tag) && !tags.has('*')) return
  const line = `${new Date().toISOString()} [${tag}] ${args.map(formatArg).join(' ')}\n`
  try {
    appendFileSync(logPath, line, { mode: PRIVATE })
  } catch {}
}
