import { describe, it, expect } from 'vitest'
import { POLICY, CONTENT_KINDS, policyOf, viewerKinds, contentCsp, documentCsp } from './policy'

const tok = '0123456789abcdef0123456789abcdef'

// The table, row by row: what each content kind may do. A change here is a security change.
describe('policy table', () => {
  it('kinds', () => {
    expect(CONTENT_KINDS).toEqual(['markdown', 'text', 'image', 'hex', 'html', 'probe'])
    expect(viewerKinds(false)).toEqual(['markdown', 'text', 'image', 'hex'])
    expect(viewerKinds(true)).toEqual(['markdown', 'text', 'image', 'hex', 'probe'])
  })
  it('viewers: scripts only (opaque origin; no same-origin, popups, top navigation, forms, modals, downloads), exact viewer URL, no bootstrap', () => {
    for (const k of viewerKinds(true)) {
      expect(POLICY[k].sandbox).toEqual(['allow-scripts'])
      expect(POLICY[k].nav).toBe('viewer-exact')
      expect(POLICY[k].bootstrap).toBe(false)
    }
  })
  it('documents: html only; scripts + own origin, nothing else (no popups, top navigation, forms, modals, downloads)', () => {
    expect(CONTENT_KINDS.filter((k) => POLICY[k].page === 'document')).toEqual(['html'])
    expect(POLICY.html).toEqual({ page: 'document', sandbox: ['allow-scripts', 'allow-same-origin'], styles: 'inline', nav: 'within-root', assets: [], payload: 'none', maxBytes: 10 * 1024 * 1024, bootstrap: true, dev: false })
  })
  it('markdown: viewer, inline styles, mermaid asset, text up to 8 MB', () => {
    expect(POLICY.markdown).toEqual({ page: 'viewer', sandbox: ['allow-scripts'], styles: 'inline', nav: 'viewer-exact', assets: ['markdown-mermaid.js'], payload: 'text', maxBytes: 8 * 1024 * 1024, bootstrap: false, dev: false })
  })
  it('text: viewer, nonce styles, text up to 10 MB', () => {
    expect(POLICY.text).toEqual({ page: 'viewer', sandbox: ['allow-scripts'], styles: 'nonce', nav: 'viewer-exact', assets: [], payload: 'text', maxBytes: 10 * 1024 * 1024, bootstrap: false, dev: false })
  })
  it('image: viewer, nonce styles, nothing over the port (img from its token), up to 50 MB', () => {
    expect(POLICY.image).toEqual({ page: 'viewer', sandbox: ['allow-scripts'], styles: 'nonce', nav: 'viewer-exact', assets: [], payload: 'none', maxBytes: 50 * 1024 * 1024, bootstrap: false, dev: false })
  })
  it('hex: viewer, nonce styles, bytes up to 16 MB', () => {
    expect(POLICY.hex).toEqual({ page: 'viewer', sandbox: ['allow-scripts'], styles: 'nonce', nav: 'viewer-exact', assets: [], payload: 'bytes', maxBytes: 16 * 1024 * 1024, bootstrap: false, dev: false })
  })
  it('probe: dev only, nonce styles, no assets, no file', () => {
    expect(POLICY.probe).toEqual({ page: 'viewer', sandbox: ['allow-scripts'], styles: 'nonce', nav: 'viewer-exact', assets: [], payload: 'none', maxBytes: 0, bootstrap: false, dev: true })
  })
  it('lookup: own rows only', () => {
    expect(policyOf('markdown')).toBe(POLICY.markdown)
    for (const k of ['constructor', '__proto__', 'toString', 'hasOwnProperty', '', 'nope', 'browser', 42, null]) expect(policyOf(k)).toBe(null)
  })
})

describe('contentCsp', () => {
  it('markdown: exact', () => {
    expect(contentCsp(POLICY.markdown, 'N0NCE', tok)).toBe(
      `default-src 'none'; script-src 'nonce-N0NCE'; style-src 'unsafe-inline'; img-src tie-content://${tok}; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`,
    )
  })
  it('text, image, hex: exact (as probe: nonce styles)', () => {
    for (const k of ['text', 'image', 'hex'] as const)
      expect(contentCsp(POLICY[k], 'N0NCE', tok)).toBe(
        `default-src 'none'; script-src 'nonce-N0NCE'; style-src 'nonce-N0NCE'; img-src tie-content://${tok}; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`,
      )
  })
  it('probe: exact', () => {
    expect(contentCsp(POLICY.probe, 'N0NCE', tok)).toBe(
      `default-src 'none'; script-src 'nonce-N0NCE'; style-src 'nonce-N0NCE'; img-src tie-content://${tok}; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`,
    )
  })
  it('html: the document CSP, exact', () => {
    const csp = "default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' data: blob:; img-src 'self' data: blob:; font-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"
    expect(documentCsp(true, 'N0NCE')).toBe(csp)
    expect(contentCsp(POLICY.html, 'N0NCE', tok)).toBe(csp)
  })
  it('html with scripts off: only the bootstrap (nonce) may run, the rest unchanged', () => {
    const off = documentCsp(false, 'N0NCE')
    expect(off).toBe(documentCsp(true, 'N0NCE').replace("script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'", "script-src 'nonce-N0NCE'"))
    expect(off).not.toMatch(/unsafe-inline' 'unsafe-eval|script-src 'self'/)
  })
  it('document CSP: no remote source anywhere (only self, data:, blob:, keywords)', () => {
    for (const scripts of [true, false]) {
      for (const d of documentCsp(scripts, 'N0NCE').split('; ')) for (const src of d.split(' ').slice(1)) expect(src).toMatch(/^('self'|'none'|'unsafe-inline'|'unsafe-eval'|'wasm-unsafe-eval'|'nonce-N0NCE'|data:|blob:)$/)
      expect(documentCsp(scripts, 'N0NCE')).not.toMatch(/\*|https?:|tie:|ws:|wss:/)
    }
  })
  it('every viewer row: nothing by default, scripts by nonce only, images own token only, nothing remote', () => {
    for (const k of viewerKinds(true)) {
      const csp = contentCsp(POLICY[k], 'N0NCE', tok)
      expect(csp).toMatch(/^default-src 'none'; script-src 'nonce-N0NCE'; /)
      expect(csp).not.toMatch(/unsafe-eval|wasm|'self'|\*|https?:|data:|blob:|strict-dynamic|worker-src|connect-src|font-src/)
      expect(csp).toContain(`img-src tie-content://${tok};`)
      for (const d of ["frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) expect(csp).toContain(d)
    }
  })
})
