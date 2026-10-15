import { describe, it, expect } from 'vitest'
import { isShellSender, externalUrl } from './security'

const shell = 'file:///Applications/Tie.app/Contents/Resources/app.asar/out/renderer/index.html'

describe('isShellSender', () => {
  it('accepts the shell main frame', () => {
    expect(isShellSender({ url: shell, parent: null }, shell)).toBe(true)
    expect(isShellSender({ url: shell + '#x', parent: null }, shell)).toBe(true)
    // Dev server: env URL may lack the trailing slash the frame reports.
    expect(isShellSender({ url: 'http://localhost:5173/', parent: null }, 'http://localhost:5173')).toBe(true)
  })
  it('rejects subframes, other pages, missing frames', () => {
    expect(isShellSender({ url: shell, parent: {} }, shell)).toBe(false)
    expect(isShellSender({ url: 'http://127.0.0.1:1/', parent: null }, shell)).toBe(false)
    expect(isShellSender({ url: 'file:///tmp/evil.html', parent: null }, shell)).toBe(false)
    expect(isShellSender(null, shell)).toBe(false)
    expect(isShellSender({ url: shell, parent: null }, '')).toBe(false)
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
