// Content frame → host requests: typed verbs, pure validators (renderer-safe, unit-tested).
// docs/TILES.md. Main re-validates meaning (e.g. openExternal's scheme check).

export type Request =
  | { verb: 'ready' }
  | { verb: 'pong'; n: number } // answer to the host's watchdog ping n (frame.ts)
  | { verb: 'openLink'; url: string } // external URL (probe)
  | { verb: 'followLink'; href: string; newTile: boolean } // a link as written in the document (markdown)
  | { verb: 'hover'; href: string } // pointer over a link ('' = left): the host shows its real target in the link strip
export type Verb = Request['verb']

const MAX_URL = 4096

type Data = Record<string, unknown>
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const int = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max

// Per verb: allowed keys besides `verb`, and the check building the request from them.
// `gesture`: acts outside the frame on the user's behalf (opens): the host accepts it only
// while the frame has focus (the user just clicked in it).
const VERBS: { [V in Verb]: { keys: string[]; gesture?: true; build: (d: Data) => Extract<Request, { verb: V }> | null } } = {
  ready: { keys: [], build: () => ({ verb: 'ready' }) },
  pong: { keys: ['n'], build: (d) => (int(d.n, Number.MAX_SAFE_INTEGER) ? { verb: 'pong', n: d.n } : null) },
  openLink: { keys: ['url'], gesture: true, build: (d) => (str(d.url, MAX_URL) ? { verb: 'openLink', url: d.url } : null) },
  followLink: {
    keys: ['href', 'newTile'],
    gesture: true,
    build: (d) => (str(d.href, MAX_URL) && typeof d.newTile === 'boolean' ? { verb: 'followLink', href: d.href, newTile: d.newTile } : null),
  },
  hover: { keys: ['href'], build: (d) => (str(d.href, MAX_URL) ? { verb: 'hover', href: d.href } : null) },
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

// SECURITY: verbs that act for the user (open a link) need a user gesture. No verb writes anything:
// content tiles are read-only (a write-shaped message is an unknown verb, dropped).
export function needsGesture(verb: Verb): boolean {
  return !!VERBS[verb].gesture
}
