import { describe, it, expect } from 'vitest'
import { isUiSender, externalUrl, sameDocument, resolveInside } from './security'

// The UI's URL (main/security.ts UI_URL). Its file:// form (before tie://app) stays a case below:
// isUiSender compares URLs, whatever the scheme.
const shell = 'tie://app/index.html'
const fileShell = 'file:///Applications/Tie.app/Contents/Resources/app.asar/out/renderer/index.html'

describe('isUiSender', () => {
  it('accepts the UI main frame', () => {
    expect(isUiSender({ url: shell, parent: null }, shell)).toBe(true)
    expect(isUiSender({ url: shell + '#x', parent: null }, shell)).toBe(true)
    // Dev server: env URL may lack the trailing slash the frame reports.
    expect(isUiSender({ url: 'http://localhost:5173/', parent: null }, 'http://localhost:5173')).toBe(true)
    expect(isUiSender({ url: fileShell, parent: null }, fileShell)).toBe(true)
  })
  it('rejects subframes, other pages, missing frames', () => {
    expect(isUiSender({ url: shell, parent: {} }, shell)).toBe(false)
    expect(isUiSender({ url: 'http://127.0.0.1:1/', parent: null }, shell)).toBe(false)
    expect(isUiSender({ url: 'file:///tmp/evil.html', parent: null }, shell)).toBe(false)
    expect(isUiSender({ url: fileShell, parent: null }, shell)).toBe(false)
    expect(isUiSender({ url: 'tie://app/other.html', parent: null }, shell)).toBe(false)
    expect(isUiSender({ url: 'tie://app/index.html?x', parent: null }, shell)).toBe(false)
    expect(isUiSender({ url: 'tie://other/index.html', parent: null }, shell)).toBe(false)
    expect(isUiSender({ url: 'tie-content://0123456789abcdef0123456789abcdef/index.html', parent: null }, shell)).toBe(false)
    expect(isUiSender(null, shell)).toBe(false)
    expect(isUiSender({ url: shell, parent: null }, '')).toBe(false)
  })
})

describe('externalUrl', () => {
  it('allows http(s), normalized', () => {
    expect(externalUrl('https://example.com/a b')).toBe('https://example.com/a%20b')
    expect(externalUrl('HTTP://Example.com')).toBe('http://example.com/')
    expect(externalUrl('https:example.com')).toBe('https://example.com/') // the URL parser fills in //
    expect(externalUrl(' https://a.b ')).toBe('https://a.b/')
    expect(externalUrl('http://[::1]:8080/x')).toBe('http://[::1]:8080/x')
    // userinfo kept (the confirm dialog shows the whole URL; the site is the host after @)
    expect(externalUrl('https://user:pw@a.b/x')).toBe('https://user:pw@a.b/x')
  })
  it('scheme tricks the URL parser undoes are judged after parsing', () => {
    expect(externalUrl('ht\ttps://a.b')).toBe('https://a.b/') // tabs / newlines dropped: still https
    expect(externalUrl('java\nscript:alert(1)')).toBe(null)
    expect(externalUrl('JAVASCRIPT:alert(1)')).toBe(null)
    expect(externalUrl(' javascript:alert(1)')).toBe(null)
  })
  it('refuses every other scheme and junk', () => {
    for (const u of ['file:///etc/hosts', 'smb://host/share', 'javascript:alert(1)', 'mailto:a@b', 'x-app://run?cmd=id', 'vscode://x', 'tie://app/index.html', 'data:text/html,x', 'ftp://a.b/', 'http://', '//evil.com', 'https://a.b:99999', 'not a url', '', null, 42, undefined, { href: 'https://a.b' }])
      expect(externalUrl(u)).toBe(null)
  })
})

describe('sameDocument', () => {
  it('same URL up to the fragment, normalized', () => {
    expect(sameDocument(shell, shell)).toBe(true)
    expect(sameDocument(shell + '#tab', shell)).toBe(true)
    expect(sameDocument('http://localhost:5173/', 'http://localhost:5173')).toBe(true)
    expect(sameDocument('HTTP://LOCALHOST:5173/#x', 'http://localhost:5173/')).toBe(true)
  })
  it('anything else is another document', () => {
    expect(sameDocument('tie://app/index.html?x', shell)).toBe(false)
    expect(sameDocument('tie://app/other.html', shell)).toBe(false)
    expect(sameDocument('http://127.0.0.1:1/', shell)).toBe(false)
    expect(sameDocument('http://localhost:5174/', 'http://localhost:5173/')).toBe(false)
    expect(sameDocument('not a url#x', 'not a url')).toBe(true) // unparsable: compared without the fragment
  })
  it('no UI URL yet: nothing matches', () => {
    expect(sameDocument('', '')).toBe(false)
    expect(sameDocument(shell, '')).toBe(false)
  })
})

describe('resolveInside', () => {
  const root = '/app/out/renderer'
  it('resolves files under root', () => {
    expect(resolveInside(root, '/index.html')).toBe('/app/out/renderer/index.html')
    expect(resolveInside(root, '/assets/a%20b.js')).toBe('/app/out/renderer/assets/a b.js')
    expect(resolveInside(root, '/')).toBe('/app/out/renderer/index.html')
  })
  it('refuses anything escaping root', () => {
    for (const p of ['/../main/index.js', '/..%2f..%2fetc%2fhosts', '/%2e%2e/%2e%2e/etc/hosts', '/a/../../x', '/..%5c..%5cetc', '/%252e%252e/x', '/x%00.html', '/%E0%A4%A', '/../renderer-evil/x'])
      expect(resolveInside(root, p), p).toBe(null)
  })
})
