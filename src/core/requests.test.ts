import { describe, it, expect } from 'vitest'
import { parseRequest, needsGesture, type Verb } from './requests'

describe('parseRequest', () => {
  it('accepts known verbs with valid args, as fresh objects', () => {
    expect(parseRequest({ verb: 'ready' })).toEqual({ verb: 'ready' })
    expect(parseRequest({ verb: 'pong', n: 7 })).toEqual({ verb: 'pong', n: 7 })
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
      { verb: 'pong' },
      { verb: 'pong', n: -1 },
      { verb: 'pong', n: 1.5 },
      { verb: 'pong', n: '1' },
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

describe('markdown verbs', () => {
  it('followLink: href + newTile', () => {
    expect(parseRequest({ verb: 'followLink', href: 'b.md', newTile: true })).toEqual({ verb: 'followLink', href: 'b.md', newTile: true })
    for (const m of [
      { verb: 'followLink', href: 'b.md' },
      { verb: 'followLink', href: 'b.md', newTile: 'yes' },
      { verb: 'followLink', href: 7, newTile: false },
      { verb: 'followLink', href: 'x'.repeat(5000), newTile: false },
      { verb: 'followLink', href: 'b.md', newTile: false, path: '/etc' },
    ])
      expect(parseRequest(m)).toBe(null)
  })
  it('read-only: no write verbs (task toggles removed)', () => {
    for (const m of [
      { verb: 'toggleTask', line: 3, expected: '- [ ] a', rev: '0123456789abcdef' },
      { verb: 'writeFile', path: '/tmp/x', text: 'x' },
      { verb: 'saveDoc', text: 'x' },
    ])
      expect(parseRequest(m)).toBe(null)
  })
  it('gesture verbs: link opens', () => {
    expect(['ready', 'pong', 'openLink', 'followLink'].filter((v) => needsGesture(v as Verb))).toEqual(['openLink', 'followLink'])
  })
})
