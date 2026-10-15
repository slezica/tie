import { describe, it, expect } from 'vitest'
import { pasteRisks, showControls, shellQuote } from './paste'

describe('pasteRisks', () => {
  it('flags control characters, not tab/newline/CR', () => {
    expect(pasteRisks('a\tb\nc\r', true).control).toBe(false)
    for (const c of ['\x1b[201~', '\x03', '\x00', '\x7f', '\x9b', '\x08']) expect(pasteRisks(`x${c}y`, true).control, JSON.stringify(c)).toBe(true)
  })
  it('flags newlines only when bracketed paste is off', () => {
    expect(pasteRisks('a\nb', false).run).toBe(true)
    expect(pasteRisks('a\rb', false).run).toBe(true)
    expect(pasteRisks('ls\n', false).run).toBe(true)
    expect(pasteRisks('a\nb', true).run).toBe(false)
    expect(pasteRisks('one line', false).run).toBe(false)
  })
})

describe('showControls', () => {
  it('caret notation for control characters, keeps tab/newline', () => {
    expect(showControls('a\x1b[0m\x03\x7f\x9b\x00\tz\n')).toBe('a^[[0m^C^?<9B>^@\tz\n')
  })
})

describe('shellQuote', () => {
  it('single-quotes, escaping quotes', () => {
    expect(shellQuote('/a b/c.txt')).toBe("'/a b/c.txt'")
    expect(shellQuote("/it's")).toBe("'/it'\\''s'")
    expect(shellQuote('/$(touch x)`y`;z')).toBe("'/$(touch x)`y`;z'")
  })
})
