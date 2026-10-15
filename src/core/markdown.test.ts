import { describe, it, expect } from 'vitest'
import { extOf, viewerFor, noViewer, classifyLink, toggleTaskLine, applyToggle } from './markdown'

describe('viewerFor', () => {
  it('maps markdown extensions, any case', () => {
    for (const p of ['/a/b.md', '/a/B.MD', '/a/c.markdown', '/x y/z.Markdown']) expect(viewerFor(p)).toBe('markdown')
  })
  it('nothing else', () => {
    for (const p of ['/a/b.txt', '/a/md', '/a/.md', '/a/b.md.bak', '/a/b.mdx', '/a/b']) expect(viewerFor(p)).toBe(null)
  })
  it('names the extension when refusing', () => {
    expect(extOf('/a/b.TXT')).toBe('.txt')
    expect(noViewer('/a/b.TXT')).toBe('No viewer for .txt')
    expect(noViewer('/a/Makefile')).toBe('No viewer for "Makefile"')
  })
})

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

describe('task toggles', () => {
  it('toggles list items with a task box', () => {
    expect(toggleTaskLine('- [ ] buy milk')).toBe('- [x] buy milk')
    expect(toggleTaskLine('- [x] done')).toBe('- [ ] done')
    expect(toggleTaskLine('  * [X] nested')).toBe('  * [ ] nested')
    expect(toggleTaskLine('12. [ ] numbered')).toBe('12. [x] numbered')
    expect(toggleTaskLine('3) [ ] paren\r')).toBe('3) [x] paren\r')
    expect(toggleTaskLine('> - [ ] quoted')).toBe('> - [x] quoted')
    expect(toggleTaskLine('+ [ ]')).toBe('+ [x]')
  })
  it('refuses lines that are not task items', () => {
    for (const l of ['[ ] no bullet', '-[ ] no space', '- [] empty', '- [y] other', '- [ ]x glued', 'text - [ ] later', '']) expect(toggleTaskLine(l)).toBe(null)
  })
  it('applies only when the line still says what the viewer saw', () => {
    const text = '# T\n- [ ] a\n- [x] b\r\n'
    expect(applyToggle(text, 1, '- [ ] a')).toEqual({ text: '# T\n- [x] a\n- [x] b\r\n' })
    expect(applyToggle(text, 2, '- [x] b\r')).toEqual({ text: '# T\n- [ ] a\n- [ ] b\r\n' })
    expect(applyToggle(text, 1, '- [x] a')).toEqual({ error: 'line changed' })
    expect(applyToggle(text, 0, '# T')).toEqual({ error: 'not a task' })
    for (const line of [-1, 4, 99, 1.5, NaN]) expect(applyToggle(text, line, '- [ ] a')).toEqual({ error: 'no such line' })
  })
})
