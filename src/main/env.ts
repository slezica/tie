// Instance identity and paths. Each TIE_INSTANCE gets its own socket, lock, debug port, log, settings.
// Installed app = `default`; dev runs (repo checkout) = `dev`, so both can run side by side.
import { app } from 'electron'
import { mkdirSync, appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const instance = process.env.TIE_INSTANCE || (app.isPackaged ? 'default' : 'dev')
export const stateDir = join(homedir(), '.tie')
export const logDir = join(stateDir, 'log')
mkdirSync(logDir, { recursive: true })

export const socketPath = join(stateDir, `${instance}.sock`)
export const infoPath = join(stateDir, `${instance}.json`)
export const logPath = join(logDir, `${instance}.log`)

// Port per instance name; tie-dev and the harness pass a free one (TIE_DEBUG_PORT).
function hash(s: string) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}
export const debugPort = Number(process.env.TIE_DEBUG_PORT) || 9300 + (hash(instance) % 600)

// TIE_DEBUG=layout,shelf,pty (or "*") enables tagged logs to logPath.
const tags = new Set((process.env.TIE_DEBUG || '').split(',').filter(Boolean))
export const debugTags = [...tags]
export function log(tag: string, ...args: unknown[]) {
  if (!tags.has(tag) && !tags.has('*')) return
  const line = `${new Date().toISOString()} [${tag}] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`
  try {
    appendFileSync(logPath, line)
  } catch {}
}
