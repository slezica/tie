import { describe, it, expect } from 'vitest'
import { isUiSender, externalUrl, resolveInside } from './security'

const shell = 'file:///Applications/Tie.app/Contents/Resources/app.asar/out/renderer/index.html'

describe('isUiSender', () => {
  it('accepts the UI main frame', () => {
    expect(isUiSender({ url: shell, parent: null }, shell)).toBe(true)
    expect(isUiSender({ url: shell + '#x', parent: null }, shell)).toBe(true)
    // Dev server: env URL may lack the trailing slash the frame reports.
    expect(isUiSender({ url: 'http://localhost:5173/', parent: null }, 'http://localhost:5173')).toBe(true)
  })
  it('rejects subframes, other pages, missing frames', () => {
    expect(isUiSender({ url: shell, parent: {} }, shell)).toBe(false)
    expect(isUiSender({ url: 'http://127.0.0.1:1/', parent: null }, shell)).toBe(false)
    expect(isUiSender({ url: 'file:///tmp/evil.html', parent: null }, shell)).toBe(false)
    expect(isUiSender(null, shell)).toBe(false)
    expect(isUiSender({ url: shell, parent: null }, '')).toBe(false)
  })
})

describe('externalUrl', () => {
  it('allows http(s), normalized', () => {
    expect(externalUrl('https://example.com/a b')).toBe('https://example.com/a%20b')
    expect(externalUrl('HTTP://Example.com')).toBe('http://example.com/')
  })
  it('refuses every other scheme and junk', () => {
    for (const u of ['file:///etc/hosts', 'smb://host/share', 'javascript:alert(1)', 'mailto:a@b', 'x-app://run?cmd=id', 'vscode://x', 'not a url', '', null, 42])
      expect(externalUrl(u)).toBe(null)
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
