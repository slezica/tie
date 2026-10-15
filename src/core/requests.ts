// Content frame → host requests: typed verbs, pure validators (renderer-safe, unit-tested).
// docs/TILES.md. Main re-validates meaning (e.g. openExternal's scheme check).

export type Request = { verb: 'ready' } | { verb: 'openLink'; url: string }
export type Verb = Request['verb']

const MAX_URL = 4096

type Data = Record<string, unknown>
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max

// Per verb: allowed keys besides `verb`, and the check building the request from them.
const VERBS: { [V in Verb]: { keys: string[]; build: (d: Data) => Extract<Request, { verb: V }> | null } } = {
  ready: { keys: [], build: () => ({ verb: 'ready' }) },
  openLink: { keys: ['url'], build: (d) => (str(d.url, MAX_URL) ? { verb: 'openLink', url: d.url } : null) },
}

// SECURITY: frame messages are untrusted (any script in the frame can post anything). Only plain
// objects (no prototype tricks), only own keys, a known verb, exactly its keys, valid values.
// Returns a fresh object (never the posted one), or null: dropped.
export function parseRequest(data: unknown): Request | null {
  if (typeof data !== 'object' || data === null || Object.getPrototypeOf(data) !== Object.prototype) return null
  const d = data as Data
  const verb = Object.hasOwn(d, 'verb') ? d.verb : undefined
  if (typeof verb !== 'string' || !Object.hasOwn(VERBS, verb)) return null
  const spec = VERBS[verb as Verb]
  const keys = Object.keys(d)
  if (keys.length !== spec.keys.length + 1 || !spec.keys.every((k) => Object.hasOwn(d, k))) return null
  return spec.build(d)
}
