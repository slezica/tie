import { describe, it, expect } from 'vitest'
import { extOf, fileKind, extsOf, noViewer, sniff, SNIFF_BYTES } from './kinds'

describe('fileKind', () => {
  it('maps markdown extensions, any case', () => {
    for (const p of ['/a/b.md', '/a/B.MD', '/a/c.markdown', '/x y/z.Markdown']) expect(fileKind(p)).toBe('markdown')
  })
  it('nothing else (no viewer yet)', () => {
    for (const p of ['/a/b.txt', '/a/md', '/a/.md', '/a/b.md.bak', '/a/b.mdx', '/a/b', '/a/b.constructor', '/a/b.__proto__']) expect(fileKind(p)).toBe(null)
  })
  it('names the extension when refusing', () => {
    expect(extOf('/a/b.TXT')).toBe('.txt')
    expect(noViewer('/a/b.TXT')).toBe('No viewer for .txt')
    expect(noViewer('/a/Makefile')).toBe('No viewer for "Makefile"')
  })
  it('extensions per kind (picker filters)', () => {
    expect(extsOf('markdown')).toEqual(['.md', '.markdown'])
    expect(extsOf('probe')).toEqual([])
  })
})

describe('sniff', () => {
  const b = (s: string) => new TextEncoder().encode(s)
  it('UTF-8 without NUL is text', () => {
    for (const s of ['', 'hello\n', 'ñandú — 日本語 🎉', '#!/bin/sh\necho hi\n']) expect(sniff(b(s))).toBe('text')
  })
  it('NUL or invalid UTF-8 is binary', () => {
    expect(sniff(b('abc\0def'))).toBe('binary')
    expect(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('binary') // PNG
    expect(sniff(new Uint8Array([0x61, 0xff, 0x62]))).toBe('binary')
    expect(sniff(new Uint8Array([0xc3]))).toBe('binary') // whole file ends mid-sequence
  })
  it('a prefix cut mid-sequence is still text; only the first SNIFF_BYTES count', () => {
    const e = b('é') // 2 bytes
    expect(sniff(e.subarray(0, 1), 100)).toBe('text')
    const big = new Uint8Array(SNIFF_BYTES + 10).fill(0x61)
    big[SNIFF_BYTES + 5] = 0
    expect(sniff(big)).toBe('text')
  })
})
