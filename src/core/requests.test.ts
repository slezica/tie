import { describe, it, expect } from 'vitest'
import { parseRequest } from './requests'

describe('parseRequest', () => {
  it('accepts known verbs with valid args, as fresh objects', () => {
    expect(parseRequest({ verb: 'ready' })).toEqual({ verb: 'ready' })
    const m = { verb: 'openLink', url: 'https://example.com' }
    const r = parseRequest(m)
    expect(r).toEqual(m)
    expect(r).not.toBe(m)
  })
  it('drops unknown verbs, extra keys, wrong types', () => {
    for (const m of [
      { verb: 'spawn', cmd: 'id' },
      { verb: 'toString' },
      { verb: '__proto__' },
      { verb: 'ready', extra: 1 },
      { verb: 'openLink' },
      { verb: 'openLink', url: 42 },
      { verb: 'openLink', url: 'https://x', cmd: 'id' },
      { verb: 'openLink', url: 'https://x/' + 'a'.repeat(5000) },
    ])
      expect(parseRequest(m)).toBe(null)
  })
  it('drops non-plain data', () => {
    for (const m of [null, undefined, 'ready', 42, ['ready'], new Date(), Object.create({ verb: 'ready' }), Object.assign(Object.create(null), { verb: 'ready' }), JSON.parse('{"__proto__": {"verb": "ready"}}')])
      expect(parseRequest(m)).toBe(null)
  })
})
