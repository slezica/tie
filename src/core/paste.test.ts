import { describe, it, expect } from 'vitest'
import { pasteRisks, showControls, shellQuote } from './paste'

describe('pasteRisks', () => {
  it('flags control characters, not tab/newline/CR', () => {
    expect(pasteRisks('a\tb\nc\r', true).control).toBe(false)
    for (const c of ['\x1b[201~', '\x03', '\x00', '\x7f', '\x9b', '\x08']) expect(pasteRisks(`x${c}y`, true).control, JSON.stringify(c)).toBe(true)
  })
  it('C1 range edges flagged; NBSP, emoji, empty text are not risks', () => {
    for (const c of ['\x80', '\x9f', '\x0b', '\x0c', '\x1f']) expect(pasteRisks(c, true).control, JSON.stringify(c)).toBe(true)
    for (const t of ['\xa0', '🙂', 'é', '']) expect(pasteRisks(t, false), JSON.stringify(t)).toEqual({ control: false, run: false })
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
    expect(showControls('\x80\x1f\r')).toBe('<80>^_\r')
  })
})

describe('shellQuote', () => {
  it('single-quotes, escaping quotes', () => {
    expect(shellQuote('/a b/c.txt')).toBe("'/a b/c.txt'")
    expect(shellQuote("/it's")).toBe("'/it'\\''s'")
    expect(shellQuote('/$(touch x)`y`;z')).toBe("'/$(touch x)`y`;z'")
    expect(shellQuote('')).toBe("''")
    expect(shellQuote("''")).toBe("''\\'''\\'''")
    expect(shellQuote('/a\nrm -rf ~')).toBe("'/a\nrm -rf ~'") // newline stays inside the quotes (the paste guard flags it)
  })
})
