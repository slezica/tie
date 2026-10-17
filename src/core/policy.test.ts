import { describe, it, expect } from 'vitest'
import { POLICY, CONTENT_KINDS, policyOf, viewerKinds, contentCsp } from './policy'

const tok = '0123456789abcdef0123456789abcdef'

// The table, row by row: what each content kind may do. A change here is a security change.
describe('policy table', () => {
  it('kinds', () => {
    expect(CONTENT_KINDS).toEqual(['markdown', 'probe'])
    expect(viewerKinds(false)).toEqual(['markdown'])
    expect(viewerKinds(true)).toEqual(['markdown', 'probe'])
  })
  it('sandbox: scripts only, every row (opaque origin; no same-origin, popups, top navigation, forms, modals, downloads)', () => {
    for (const k of CONTENT_KINDS) expect(POLICY[k].sandbox).toEqual(['allow-scripts'])
  })
  it('nav rule: exact viewer URL, every row', () => {
    for (const k of CONTENT_KINDS) expect(POLICY[k].nav).toBe('viewer-exact')
  })
  it('markdown: viewer, inline styles, mermaid asset, text up to 8 MB', () => {
    expect(POLICY.markdown).toEqual({ page: 'viewer', sandbox: ['allow-scripts'], styles: 'inline', nav: 'viewer-exact', assets: ['markdown-mermaid.js'], payload: 'text', maxBytes: 8 * 1024 * 1024, dev: false })
  })
  it('probe: dev only, nonce styles, no assets, no file', () => {
    expect(POLICY.probe).toEqual({ page: 'viewer', sandbox: ['allow-scripts'], styles: 'nonce', nav: 'viewer-exact', assets: [], payload: 'none', maxBytes: 0, dev: true })
  })
  it('lookup: own rows only', () => {
    expect(policyOf('markdown')).toBe(POLICY.markdown)
    for (const k of ['constructor', '__proto__', 'toString', 'hasOwnProperty', '', 'text', 42, null]) expect(policyOf(k)).toBe(null)
  })
})

describe('contentCsp', () => {
  it('markdown: exact', () => {
    expect(contentCsp(POLICY.markdown, 'N0NCE', tok)).toBe(
      `default-src 'none'; script-src 'nonce-N0NCE'; style-src 'unsafe-inline'; img-src tie-content://${tok}; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`,
    )
  })
  it('probe: exact', () => {
    expect(contentCsp(POLICY.probe, 'N0NCE', tok)).toBe(
      `default-src 'none'; script-src 'nonce-N0NCE'; style-src 'nonce-N0NCE'; img-src tie-content://${tok}; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`,
    )
  })
  it('every row: nothing by default, scripts by nonce only, images own token only, nothing remote', () => {
    for (const k of CONTENT_KINDS) {
      const csp = contentCsp(POLICY[k], 'N0NCE', tok)
      expect(csp).toMatch(/^default-src 'none'; script-src 'nonce-N0NCE'; /)
      expect(csp).not.toMatch(/unsafe-eval|wasm|'self'|\*|https?:|data:|blob:|strict-dynamic|worker-src|connect-src|font-src/)
      expect(csp).toContain(`img-src tie-content://${tok};`)
      for (const d of ["frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) expect(csp).toContain(d)
    }
  })
})
