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
  it('dirOf, withinRoot', () => {
    expect(dirOf('/a/b.md')).toBe('/a')
    expect(dirOf('/b.md')).toBe('/')
    expect(withinRoot('/a', '/a/b c/d.md')).toBe('/b%20c/d.md')
    expect(withinRoot('/', '/x.md')).toBe('/x.md')
  })
})
