// Instance identity and paths. Each TIE_INSTANCE gets its own socket, lock, debug port, log.
import { mkdirSync, appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const instance = process.env.TIE_INSTANCE || 'default'
export const stateDir = join(homedir(), '.tie')
mkdirSync(stateDir, { recursive: true })

export const socketPath = join(stateDir, `${instance}.sock`)
export const infoPath = join(stateDir, `${instance}.json`)
export const logPath = join(stateDir, `${instance}.log`)

// Stable port per instance name, overridable.
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
