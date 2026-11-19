import { describe, it, expect } from 'vitest'
import { guestNavAllowed, guestSrc, locationUrl, popupUrl, downloadName, uniqueName, pageTitle, BROWSER_PARTITION } from './guest'

describe('guestNavAllowed', () => {
  it('main frame: http(s) with a host, about:blank', () => {
    for (const u of ['https://example.com/', 'http://127.0.0.1:8080/x?y#z', 'HTTPS://A.B', 'about:blank']) expect(guestNavAllowed(u, true)).toBe(true)
  })
  it('main frame: nothing else', () => {
    for (const u of ['file:///etc/hosts', 'tie://app/index.html', 'tie-content://abc/x.html', 'chrome://gpu', 'devtools://devtools/x', 'javascript:alert(1)', 'data:text/html,x', 'blob:https://a.b/1', 'about:srcdoc', 'mailto:a@b.c', 'x-app://run', 'https://', ''])
      expect(guestNavAllowed(u, true)).toBe(false)
  })
  it('subframes: also about:, data:, blob:', () => {
    for (const u of ['https://a.b/', 'about:blank', 'about:srcdoc', 'data:text/html,x', 'blob:https://a.b/1']) expect(guestNavAllowed(u, false)).toBe(true)
    for (const u of ['file:///etc/hosts', 'tie://app/', 'tie-content://abc/', 'chrome://gpu', 'javascript:x', 'mailto:a@b.c']) expect(guestNavAllowed(u, false)).toBe(false)
  })
  it('non-strings refused', () => expect(guestNavAllowed(undefined as unknown as string, true)).toBe(false))
  it('edge forms', () => {
    // userinfo, IPv6, ports: still http(s) with a host
    for (const u of ['https://user:pw@example.com/', 'http://[::1]:8080/', 'https://a.b:443/']) expect(guestNavAllowed(u, true)).toBe(true)
    // main frame about:blank only as exactly that (a fragment or query makes it another URL)
    for (const u of ['about:blank#x', 'about:blank?x', 'ABOUT:BLANK', 'about:blank/']) expect(guestNavAllowed(u, true)).toBe(false)
    // unparsable or hostless http(s): refused; scheme matched on the raw string (a tab or a space
    // before it is no http)
    for (const u of ['https://a.b:99999/', 'ht\ttps://a.b', ' https://a.b']) expect(guestNavAllowed(u, true), u).toBe(false)
    // the URL parser supplies a host where it can (http:///x → http://x/): http(s), allowed
    expect(guestNavAllowed('http:///x', true)).toBe(true)
    // case-insensitive scheme for subframes too
    expect(guestNavAllowed('DATA:text/html,x', false)).toBe(true)
    expect(guestNavAllowed('FILE:///etc/hosts', false)).toBe(false)
  })
})

describe('guestSrc', () => {
  it('normalizes http(s), keeps about:blank', () => {
    expect(guestSrc('https://Example.com')).toBe('https://example.com/')
    expect(guestSrc('about:blank')).toBe('about:blank')
  })
  it('refuses the rest', () => {
    for (const u of ['', 'file:///x', 'tie://app/', 'javascript:1', 'about:srcdoc', 'https://', 42, null]) expect(guestSrc(u)).toBe(null)
  })
  it('edge forms', () => {
    expect(guestSrc('https://user:pw@a.b/x')).toBe('https://user:pw@a.b/x') // userinfo kept
    expect(guestSrc('http://[::1]:8080')).toBe('http://[::1]:8080/')
    for (const u of ['about:blank#x', ' https://a.b', 'https://a.b:99999', 'data:text/html,x', 'blob:https://a.b/1']) expect(guestSrc(u), u).toBe(null)
  })
})

describe('locationUrl', () => {
  it('http(s) as typed', () => {
    expect(locationUrl('http://localhost:3000/a')).toBe('http://localhost:3000/a')
    expect(locationUrl('  https://example.com/x?q=1#h  ')).toBe('https://example.com/x?q=1#h')
  })
  it('bare host[/path] → https://', () => {
    expect(locationUrl('example.com')).toBe('https://example.com/')
    expect(locationUrl('example.com/docs?a=1')).toBe('https://example.com/docs?a=1')
    expect(locationUrl('localhost:8080/x')).toBe('https://localhost:8080/x')
    expect(locationUrl('localhost')).toBe('https://localhost/')
    expect(locationUrl('127.0.0.1:5000')).toBe('https://127.0.0.1:5000/')
  })
  it('no search, no other schemes', () => {
    for (const t of ['', '   ', 'how to cook', 'word', 'file:///etc/hosts', 'javascript:alert(1)', 'mailto:a@b.c', 'tie://app/', 'chrome://gpu', 'data:text/html,x', 'about:srcdoc'])
      expect(locationUrl(t)).toBe(null)
  })
  it('about:blank', () => expect(locationUrl('about:blank')).toBe('about:blank'))
  it('edge forms', () => {
    expect(locationUrl('user@example.com')).toBe('https://user@example.com/') // userinfo: a host after @
    expect(locationUrl('[::1]:8080')).toBe('https://[::1]:8080/')
    expect(locationUrl('HTTP://A.B')).toBe('http://a.b/')
    expect(locationUrl('http:a')).toBe('http://a/') // typed scheme: as the URL parser reads it
    for (const t of ['about:blank#x', 'localhost:99999', 'https://', 'example.com\tx']) expect(locationUrl(t), t).toBe(null)
  })
})

describe('popupUrl', () => {
  it('http(s) with a host goes to the confirm; everything else is blocked', () => {
    expect(popupUrl('https://a.b/x')).toBe('https://a.b/x')
    expect(popupUrl('http://a.b')).toBe('http://a.b/')
    for (const u of ['about:blank', 'file:///x', 'mailto:a@b.c', 'javascript:x', '', 'https://', 'about:blank#x', 'data:text/html,x', 'blob:https://a.b/1', 'tie://app/']) expect(popupUrl(u)).toBe(null)
    expect(popupUrl('https://user:pw@a.b/x')).toBe('https://user:pw@a.b/x') // whole URL to the confirm
  })
})

describe('downloads', () => {
  it('file names: base name, no controls or hidden files, never empty', () => {
    expect(downloadName('report.pdf')).toBe('report.pdf')
    expect(downloadName('../../etc/passwd')).toBe('passwd')
    expect(downloadName('a\\b\\c.txt')).toBe('c.txt')
    expect(downloadName('.bashrc')).toBe('bashrc')
    expect(downloadName('x\x00y\nz:w.txt')).toBe('x_y_z_w.txt')
    expect(downloadName('name. ')).toBe('name')
    expect(downloadName('')).toBe('download')
    expect(downloadName('...')).toBe('download')
    expect(downloadName(undefined)).toBe('download')
    const long = downloadName('a'.repeat(500) + '.tar.gz')
    expect(long.length).toBe(200)
    expect(long.endsWith('.gz')).toBe(true)
  })
  it('unique names', () => {
    const taken = new Set(['a.txt', 'a (1).txt', 'b'])
    expect(uniqueName('c.txt', (n) => taken.has(n))).toBe('c.txt')
    expect(uniqueName('a.txt', (n) => taken.has(n))).toBe('a (2).txt')
    expect(uniqueName('b', (n) => taken.has(n))).toBe('b (1)')
  })
})

describe('misc', () => {
  it('titles are bounded text', () => {
    expect(pageTitle('  Hi\nthere  ')).toBe('Hi there')
    expect(pageTitle('x'.repeat(500)).length).toBe(200)
    expect(pageTitle(5)).toBe('')
  })
  it('partition is persistent and not the default session', () => expect(BROWSER_PARTITION).toBe('persist:browser'))
})
