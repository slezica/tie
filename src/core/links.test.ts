import { describe, it, expect } from 'vitest'
import { classifyLink, externalParts } from './links'

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
  it('other files: kind by extension, else null (decided by content)', () => {
    expect(classifyLink('img/a.PNG', from)).toEqual({ type: 'file', path: '/docs/my notes/img/a.PNG', hash: '', kind: 'image' })
    expect(classifyLink('script.sh', from)).toEqual({ type: 'file', path: '/docs/my notes/script.sh', hash: '', kind: null })
    expect(classifyLink('img/', from)).toEqual({ type: 'file', path: '/docs/my notes/img/', hash: '', kind: null })
  })
  it('refuses other schemes, hosts, junk', () => {
    for (const href of ['file:///etc/hosts.md', 'javascript:alert(1)', 'JavaScript:x', 'mailto:a@b.c', 'smb://h/s.md', 'x-app://run', 'data:text/html,x', '//evil.com/x.md', '', '   ', 'a%00.md', 'bad%zz.md', 'https://', 'tie-content://abc/x.md'])
      expect(classifyLink(href, from).type).toBe('refused')
    for (const href of [42, null, undefined, {}]) expect(classifyLink(href, from).type).toBe('refused')
  })
})

describe('externalParts', () => {
  it('splits the site address from the rest', () => {
    expect(externalParts('https://example.com/a/b?q=1#h')).toEqual({ origin: 'https://example.com', tail: '/a/b?q=1#h', user: '' })
    expect(externalParts('http://example.com:8080')).toEqual({ origin: 'http://example.com:8080', tail: '/', user: '' })
  })
  it('names the real site when text sits before an @', () => {
    expect(externalParts('https://google.com@evil.com/')).toEqual({ origin: 'https://evil.com', tail: '/', user: 'google.com' })
    expect(externalParts('https://a:b@evil.com/x')).toEqual({ origin: 'https://evil.com', tail: '/x', user: 'a:b' })
  })
  it('follows the parser, not the string', () => {
    expect(externalParts('https:example.com/x')).toEqual({ origin: 'https://example.com', tail: '/x', user: '' })
    expect(externalParts('HTTPS://EXAMPLE.com/X')).toEqual({ origin: 'https://example.com', tail: '/X', user: '' })
  })
  it('refuses what externalUrl refuses', () => {
    expect(externalParts('file:///etc/passwd')).toBeNull()
    expect(externalParts('nope')).toBeNull()
    expect(externalParts(5)).toBeNull()
  })
})
