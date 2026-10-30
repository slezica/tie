import { describe, expect, it } from 'vitest'
import { ID_ALPHABET, randomId } from './ids'

describe('randomId', () => {
  it('prefix + 6 chars of the alphabet, no 0 1 l o', () => {
    expect(ID_ALPHABET).toHaveLength(32)
    expect(ID_ALPHABET).not.toMatch(/[01lo]/)
    for (let i = 0; i < 200; i++) expect(randomId('t')).toMatch(/^t[abcdefghijkmnpqrstuvwxyz23456789]{6}$/)
  })
  it('regenerates on collision', () => {
    const seen: string[] = []
    const id = randomId('s', (x) => (seen.push(x), seen.length < 3))
    expect(seen).toHaveLength(3)
    expect(id).toBe(seen[2])
  })
  it('spreads over the alphabet', () => {
    const chars = new Set([...Array(500)].flatMap(() => [...randomId('t').slice(1)]))
    expect(chars.size).toBe(32)
  })
})
