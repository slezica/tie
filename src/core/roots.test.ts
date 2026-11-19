import { describe, expect, it } from 'vitest'
import { contains, dirOf, rootFor, withinRoot } from './roots'

describe('roots', () => {
  it('contains: strict descendants, / holds everything', () => {
    expect(contains('/a', '/a/b')).toBe(true)
    expect(contains('/a', '/a')).toBe(false)
    expect(contains('/a', '/ab/c')).toBe(false)
    expect(contains('/', '/x')).toBe(true)
  })
  it('rootFor: current, then cwd, then the folder', () => {
    expect(rootFor('/p', '/p/docs/a.md')).toBe('/p')
    expect(rootFor('/p', '/q/a.md')).toBe('/q')
    expect(rootFor('/p', '/q/a.md', '/q')).toBe('/q')
    expect(rootFor('/p', '/p/docs/a.md', '/q')).toBe('/p') // left the current root: the rule again
    expect(rootFor('/p', '/p/docs/sub/a.md', '/p/docs')).toBe('/p/docs') // still inside: kept
    expect(rootFor('/', '/x/a.md')).toBe('/')
    expect(rootFor('/p', '/a.md')).toBe('/')
  })
  it('rootFor: an explicit root wins when it holds the file', () => {
    expect(rootFor('/p', '/p/docs/a.md', null, '/p/docs')).toBe('/p/docs')
    expect(rootFor('/p', '/p/docs/a.md', '/p', '/p/docs')).toBe('/p/docs')
    expect(rootFor('/p', '/q/a.md', null, '/p/docs')).toBe('/q')
  })
  it('rootFor: a name prefix is not containment (/p vs /pq)', () => {
    expect(rootFor('/p', '/pq/a.md')).toBe('/pq') // cwd /p doesn't hold /pq/a.md
    expect(rootFor('/x', '/pq/a.md', '/p')).toBe('/pq') // current /p not kept
    expect(rootFor('/x', '/pq/a.md', null, '/p')).toBe('/pq') // explicit /p ignored
  })
  it('rootFor: / as current or explicit holds everything; empty values are absent', () => {
    expect(rootFor('/p', '/q/a.md', '/')).toBe('/')
    expect(rootFor('/p', '/q/a.md', null, '/')).toBe('/')
    expect(rootFor('/p', '/p/a.md', '', '')).toBe('/p')
    expect(rootFor('/p', '/q/a.md', undefined, undefined)).toBe('/q')
  })
  it('withinRoot: each segment encoded (#, ?, %, unicode), never re-rooted', () => {
    expect(withinRoot('/r', '/r/a#b/c?d.md')).toBe('/a%23b/c%3Fd.md')
    expect(withinRoot('/r', '/r/100%.md')).toBe('/100%25.md')
    expect(withinRoot('/r', '/r/ñ/é.md')).toBe('/%C3%B1/%C3%A9.md')
    expect(withinRoot('/r/s', '/r/s/t/u.md')).toBe('/t/u.md')
  })
  it('dirOf, withinRoot', () => {
    expect(dirOf('/a/b.md')).toBe('/a')
    expect(dirOf('/b.md')).toBe('/')
    expect(withinRoot('/a', '/a/b c/d.md')).toBe('/b%20c/d.md')
    expect(withinRoot('/', '/x.md')).toBe('/x.md')
  })
})
