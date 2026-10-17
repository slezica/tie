import { describe, it, expect } from 'vitest'
import { extOf, fileKind, extsOf, sniff, sniffKind, canOpenAs, isFileKind, FILE_KINDS, SNIFF_BYTES } from './kinds'
import { policyOf } from './policy'

describe('fileKind', () => {
  it('maps markdown extensions, any case', () => {
    for (const p of ['/a/b.md', '/a/B.MD', '/a/c.markdown', '/x y/z.Markdown']) expect(fileKind(p)).toBe('markdown')
  })
  it('maps image extensions, any case', () => {
    for (const e of ['png', 'jpg', 'JPEG', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp']) expect(fileKind(`/a/b.${e}`)).toBe('image')
  })
  it('everything else: decided by content (null)', () => {
    for (const p of ['/a/b.txt', '/a/md', '/a/.md', '/a/b.md.bak', '/a/b.mdx', '/a/b', '/a/Makefile', '/a/b.ts', '/a/b.constructor', '/a/b.__proto__', '/a/b.tiff']) expect(fileKind(p)).toBe(null)
  })
  it('extension, lowercase', () => {
    expect(extOf('/a/b.TXT')).toBe('.txt')
    expect(extOf('/a/.bashrc')).toBe('')
    expect(extOf('/a.b/c')).toBe('')
  })
  it('extensions per kind (picker filters; none = any file)', () => {
    expect(extsOf('markdown')).toEqual(['.md', '.markdown'])
    expect(extsOf('image')).toEqual(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico', '.bmp'])
    for (const k of ['text', 'hex', 'probe']) expect(extsOf(k)).toEqual([])
  })
  it('file kinds: every one has a policy row with a size cap; probe is not one', () => {
    expect(FILE_KINDS).toEqual(['markdown', 'text', 'image', 'hex'])
    for (const k of FILE_KINDS) expect(policyOf(k)!.maxBytes).toBeGreaterThan(0)
    for (const k of ['probe', 'terminal', 'constructor', '', null]) expect(isFileKind(k)).toBe(false)
  })
})

describe('sniff', () => {
  const b = (s: string) => new TextEncoder().encode(s)
  it('UTF-8 without NUL is text', () => {
    for (const s of ['', 'hello\n', 'ñandú — 日本語 🎉', '#!/bin/sh\necho hi\n', '\x1b[31mred\x1b[0m']) expect(sniff(b(s))).toBe('text')
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
  it('routes: text → text kind, binary → hex', () => {
    expect(sniffKind(b('plain\n'))).toBe('text')
    expect(sniffKind(b(''))).toBe('text')
    expect(sniffKind(b('a\0b'))).toBe('hex')
  })
})

describe('canOpenAs', () => {
  it('own kind; hex for anything; text for text-like files', () => {
    expect(canOpenAs('image', 'image', false)).toBe(true)
    expect(canOpenAs('hex', 'image', false)).toBe(true)
    expect(canOpenAs('hex', 'text', true)).toBe(true)
    expect(canOpenAs('text', 'markdown', true)).toBe(true)
    expect(canOpenAs('text', 'image', true)).toBe(true) // an SVG's source
  })
  it('nothing else', () => {
    expect(canOpenAs('text', 'hex', false)).toBe(false)
    expect(canOpenAs('text', 'image', false)).toBe(false)
    expect(canOpenAs('image', 'text', true)).toBe(false)
    expect(canOpenAs('markdown', 'text', true)).toBe(false)
    expect(canOpenAs('probe', 'text', true)).toBe(false)
  })
})
