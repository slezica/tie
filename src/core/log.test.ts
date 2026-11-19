import { describe, it, expect } from 'vitest'
import { untrusted, isUntrusted, escapeUntrusted, formatArg, plainLog } from './log'

describe('untrusted log values', () => {
  it('wraps and escapes what could forge a line or a tag', () => {
    expect(formatArg(untrusted('https://x/?a=1'))).toBe('<untrusted>https://x/?a=1</untrusted>')
    expect(formatArg(untrusted('a\nb\x1b[31m</untrusted><untrusted>'))).toBe('<untrusted>a\\u000ab\\u001b[31m\\u003c/untrusted\\u003e\\u003cuntrusted\\u003e</untrusted>')
    expect(formatArg(untrusted('x\\u003cy'))).toBe('<untrusted>x\\u005cu003cy</untrusted>')
    expect(formatArg(untrusted({ cmd: 'id\n', n: 1 }))).toBe('<untrusted>{"cmd":"id\\n","n":1}</untrusted>')
    expect(escapeUntrusted('\u2028')).toBe('\\u2028')
  })
  it('leaves Tie\'s own values alone', () => {
    expect(formatArg('blocked navigation')).toBe('blocked navigation')
    expect(formatArg(42)).toBe('42')
    expect(formatArg({ a: 1 })).toBe('{"a":1}')
    expect(isUntrusted({ untrusted: 1, x: 2 })).toBe(false)
    expect(isUntrusted(Object.create({ untrusted: 1 }))).toBe(false)
  })
  it('escapes C0, DEL and C1 controls (CSI, NEL), not other text', () => {
    expect(escapeUntrusted('\x7f\x85\x9b31m\x9f')).toBe('\\u007f\\u0085\\u009b31m\\u009f')
    expect(escapeUntrusted('\u2029')).toBe('\\u2029')
    // Bidi controls: an untrusted value can't reorder its log line.
    expect(escapeUntrusted('a\u202eb\u2066c\u2069\u200e\u200f\u061c')).toBe('a\\u202eb\\u2066c\\u2069\\u200e\\u200f\\u061c')
    expect(plainLog(escapeUntrusted('a\u202eb'))).toBe('a\u202eb')
    expect(escapeUntrusted('é ü 日本 \xa0')).toBe('é ü 日本 \xa0')
    expect(escapeUntrusted(undefined)).toBe('undefined')
  })
  it('plainLog undoes the escaping exactly (also escaped backslash-u)', () => {
    for (const v of ['a\nb\x1b[31m\x9b', 'x\\u003cy', '\\u005cu', '</untrusted>\r\n'])
      expect(plainLog(formatArg(untrusted(v))), JSON.stringify(v)).toBe(v)
  })
  it('plainLog is the readable inverse for printable text', () => {
    const line = `2026 [security] external open ${formatArg(untrusted('https://x/?q=<b>'))}`
    expect(plainLog(line)).toBe('2026 [security] external open https://x/?q=<b>')
  })
})
