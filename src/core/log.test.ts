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
  it('plainLog is the readable inverse for printable text', () => {
    const line = `2026 [security] external open ${formatArg(untrusted('https://x/?q=<b>'))}`
    expect(plainLog(line)).toBe('2026 [security] external open https://x/?q=<b>')
  })
})
