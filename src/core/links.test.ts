import { describe, it, expect } from 'vitest'
import { classifyLink } from './links'

describe('classifyLink', () => {
  const from = '/docs/my notes/plan.md'
  it('anchors stay in the page', () => {
    expect(classifyLink('#setup', from)).toEqual({ type: 'anchor', hash: '#setup' })
  })
  it('http(s) go out', () => {
    expect(classifyLink('https://example.com/a?b#c', from)).toEqual({ type: 'web', url: 'https://example.com/a?b#c' })
    expect(classifyLink('HTTP://x.org', from)).toEqual({ type: 'web', url: 'http://x.org/' })
  })
  it('relative markdown resolves against the file, decoded', () => {
    expect(classifyLink('other.md', from)).toEqual({ type: 'file', path: '/docs/my notes/other.md', hash: '', kind: 'markdown' })
    expect(classifyLink('../up%20one.md#part', from)).toEqual({ type: 'file', path: '/docs/up one.md', hash: '#part', kind: 'markdown' })
    expect(classifyLink('./sub/x.markdown?q=1', from)).toEqual({ type: 'file', path: '/docs/my notes/sub/x.markdown', hash: '', kind: 'markdown' })
    expect(classifyLink('/abs/y.md', from)).toEqual({ type: 'file', path: '/abs/y.md', hash: '', kind: 'markdown' })
    expect(classifyLink('../../../../z.md', from)).toEqual({ type: 'file', path: '/z.md', hash: '', kind: 'markdown' })
  })
  it('special characters in the current path do not leak into the result', () => {
    expect(classifyLink('b.md', '/d/a#1?x%41.md')).toEqual({ type: 'file', path: '/d/b.md', hash: '', kind: 'markdown' })
  })
  it('other files: no kind (no viewer yet)', () => {
    expect(classifyLink('script.sh', from)).toEqual({ type: 'file', path: '/docs/my notes/script.sh', hash: '', kind: null })
    expect(classifyLink('img/', from)).toEqual({ type: 'file', path: '/docs/my notes/img/', hash: '', kind: null })
  })
  it('refuses other schemes, hosts, junk', () => {
    for (const href of ['file:///etc/hosts.md', 'javascript:alert(1)', 'JavaScript:x', 'mailto:a@b.c', 'smb://h/s.md', 'x-app://run', 'data:text/html,x', '//evil.com/x.md', '', '   ', 'a%00.md', 'bad%zz.md', 'https://', 'tie-content://abc/x.md'])
      expect(classifyLink(href, from).type).toBe('refused')
    for (const href of [42, null, undefined, {}]) expect(classifyLink(href, from).type).toBe('refused')
  })
})
