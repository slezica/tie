import { describe, it, expect } from 'vitest'
import { classifyLink } from './markdown'

describe('classifyLink', () => {
  const from = '/docs/my notes/plan.md'
  it('anchors stay in the page', () => {
    expect(classifyLink('#setup', from)).toEqual({ type: 'anchor', hash: '#setup' })
  })
  it('http(s) go out', () => {
    expect(classifyLink('https://example.com/a?b#c', from)).toEqual({ type: 'external', url: 'https://example.com/a?b#c' })
    expect(classifyLink('HTTP://x.org', from)).toEqual({ type: 'external', url: 'http://x.org/' })
  })
  it('relative markdown resolves against the file, decoded', () => {
    expect(classifyLink('other.md', from)).toEqual({ type: 'markdown', path: '/docs/my notes/other.md', hash: '' })
    expect(classifyLink('../up%20one.md#part', from)).toEqual({ type: 'markdown', path: '/docs/up one.md', hash: '#part' })
    expect(classifyLink('./sub/x.markdown?q=1', from)).toEqual({ type: 'markdown', path: '/docs/my notes/sub/x.markdown', hash: '' })
    expect(classifyLink('/abs/y.md', from)).toEqual({ type: 'markdown', path: '/abs/y.md', hash: '' })
    expect(classifyLink('../../../../z.md', from)).toEqual({ type: 'markdown', path: '/z.md', hash: '' })
  })
  it('special characters in the current path do not leak into the result', () => {
    expect(classifyLink('b.md', '/d/a#1?x%41.md')).toEqual({ type: 'markdown', path: '/d/b.md', hash: '' })
  })
  it('relative non-markdown files are files (ignored by the kind)', () => {
    expect(classifyLink('script.sh', from)).toEqual({ type: 'file', path: '/docs/my notes/script.sh' })
    expect(classifyLink('img/', from)).toEqual({ type: 'file', path: '/docs/my notes/img/' })
  })
  it('refuses other schemes, hosts, junk', () => {
    for (const href of ['file:///etc/hosts.md', 'javascript:alert(1)', 'JavaScript:x', 'mailto:a@b.c', 'smb://h/s.md', 'x-app://run', 'data:text/html,x', '//evil.com/x.md', '', '   ', 'a%00.md', 'bad%zz.md', 'https://', 'tie-content://abc/x.md'])
      expect(classifyLink(href, from).type).toBe('refused')
    for (const href of [42, null, undefined, {}]) expect(classifyLink(href, from).type).toBe('refused')
  })
})
