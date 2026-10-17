import { describe, it, expect } from 'vitest'
import { isToken, parseContentUrl, viewerUrl, viewerFile, contentFile, isInside, routeContent, navAllowed } from './content'

const tok = '0123456789abcdef0123456789abcdef'

describe('isToken', () => {
  it('accepts 32 lowercase hex', () => expect(isToken(tok)).toBe(true))
  it('refuses anything else', () => {
    for (const t of ['', 'abc', tok.toUpperCase(), tok + '0', tok.slice(1) + 'g', 'app', null, 42, {}]) expect(isToken(t)).toBe(false)
  })
})

describe('parseContentUrl', () => {
  it('splits token and path', () => {
    expect(parseContentUrl(`tie-content://${tok}/a/b.png`)).toEqual({ token: tok, path: '/a/b.png' })
    expect(parseContentUrl(`tie-content://${tok}/_tie/probe.html?x#y`)).toEqual({ token: tok, path: '/_tie/probe.html' })
  })
  it('refuses other schemes, bad tokens, junk', () => {
    for (const u of [`tie://${tok}/a`, `http://${tok}/a`, 'tie-content://app/a', `tie-content://${tok}:1/a`, `tie-content://u@${tok}/a`, 'nope', ''])
      expect(parseContentUrl(u)).toBe(null)
  })
})

describe('viewerUrl', () => {
  it('is the kind page under /_tie/', () => expect(viewerUrl(tok, 'probe')).toBe(`tie-content://${tok}/_tie/probe.html`))
})

describe('viewerFile', () => {
  it("serves only the kind's own page and script", () => {
    expect(viewerFile('probe', '/_tie/probe.html')).toBe('probe.html')
    expect(viewerFile('probe', '/_tie/probe.js')).toBe('probe.js')
  })
  it('refuses other kinds, other names, traversal, non-viewer paths', () => {
    for (const p of ['/_tie/markdown.js', '/_tie/markdown-mermaid.js', '/_tie/probe.css', '/_tie/../probe.js', '/_tie/%2e%2e/probe.js', '/_tie/probe.html/', '/_tie/sub/probe.js', '/probe.js', '/_tie/', '/_tie'])
      expect(viewerFile('probe', p)).toBe(null)
  })
  it("serves a kind's listed assets to that kind only", () => {
    expect(viewerFile('markdown', '/_tie/markdown-mermaid.js')).toBe('markdown-mermaid.js')
    for (const p of ['/_tie/probe.js', '/_tie/markdown-mermaid.js/', '/_tie/markdown-mermaid.js.map', '/_tie/mermaid.js', '/_tie/markdown-mermaid.css', '/_tie/MARKDOWN-MERMAID.JS'])
      expect(viewerFile('markdown', p)).toBe(null)
    for (const kind of ['probe', 'constructor', '__proto__', 'toString', 'hasOwnProperty', '']) expect(viewerFile(kind, '/_tie/markdown-mermaid.js')).toBe(null)
  })
  it('kinds without a policy row get nothing', () => {
    for (const kind of ['text', 'constructor', '__proto__', '']) expect(viewerFile(kind, `/_tie/${kind}.html`)).toBe(null)
  })
})

describe('contentFile', () => {
  const root = '/Users/me/notes'
  it('resolves files under root', () => {
    expect(contentFile(root, '/a.md')).toBe('/Users/me/notes/a.md')
    expect(contentFile(root, '/img/a%20b.png')).toBe('/Users/me/notes/img/a b.png')
  })
  it('refuses root itself (no index, no listing)', () => {
    for (const p of ['/', '', '/.', '/img/..']) expect(contentFile(root, p)).toBe(null)
  })
  it('refuses traversal, encodings, backslashes, NUL', () => {
    for (const p of ['/../secret', '/..%2fsecret', '/%2e%2e/secret', '/%252e%252e/secret', '/..%5csecret', '/a%00.md', '/%E0%A4%A'])
      expect(contentFile(root, p)).toBe(null)
  })
  it('keeps /_tie/ for viewers: never a root file', () => {
    expect(contentFile(root, '/_tie/probe.js')).toBe(null)
    expect(contentFile(root, '/_tie')).toBe(null)
  })
})

describe('isInside', () => {
  it('only strict descendants', () => {
    expect(isInside('/r', '/r/a')).toBe(true)
    expect(isInside('/r', '/r/a/b')).toBe(true)
    expect(isInside('/r', '/r')).toBe(false)
    expect(isInside('/r', '/r2/a')).toBe(false)
    expect(isInside('/r', '/etc/passwd')).toBe(false)
  })
})

describe('navAllowed', () => {
  it("viewer-exact: the kind's viewer page, exactly", () => {
    for (const kind of ['markdown', 'probe']) expect(navAllowed(kind, tok, `tie-content://${tok}/_tie/${kind}.html`)).toBe(true)
  })
  it('nothing else: other pages, tokens, kinds, root files, queries, unknown kinds', () => {
    const other = '1'.repeat(32)
    for (const u of [`tie-content://${tok}/_tie/markdown.html`, `tie-content://${other}/_tie/probe.html`, `tie-content://${tok}/_tie/probe.js`, `tie-content://${tok}/page.html`, `tie-content://${tok}/_tie/probe.html?x`, `tie-content://${tok}/_tie/probe.html#x`, 'http://x/'])
      expect(navAllowed('probe', tok, u)).toBe(false)
    for (const kind of ['', 'constructor', '__proto__', 'text']) expect(navAllowed(kind, tok, `tie-content://${tok}/_tie/${kind}.html`)).toBe(false)
  })
})

describe('routeContent', () => {
  const entry = { root: '/Users/me/notes', kind: 'probe' }
  const lookup = (t: string) => (t === tok ? entry : undefined)
  it('viewer files, then root files', () => {
    expect(routeContent(`tie-content://${tok}/_tie/probe.js`, lookup)).toEqual({ viewer: 'probe.js', entry })
    expect(routeContent(`tie-content://${tok}/a.png`, lookup)).toEqual({ file: '/Users/me/notes/a.png', entry })
  })
  it('refuses unknown tokens, foreign viewer files, root itself, traversal', () => {
    const other = '1'.repeat(32)
    for (const u of [`tie-content://${other}/a.png`, `tie-content://${tok}/_tie/markdown.js`, `tie-content://${tok}/`, `tie-content://${tok}/..%2fsecret`, 'tie://app/index.html'])
      expect(routeContent(u, lookup)).toBe(null)
  })
})
