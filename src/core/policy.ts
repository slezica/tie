// Content kinds: the one security table. Every kind rendered in a content frame has a row here;
// the frame host (renderer/frame.ts: sandbox), the content protocol (main/content.ts: viewer
// files, CSP, nav lock, dev-only kinds), file opening (main/docs.ts: payload, size cap) and the
// viewer build (electron.vite.config.ts) read it. Pure, renderer-safe, unit-tested.
// docs/TILES.md "Policy", docs/SECURITY.md.

export const CONTENT_SCHEME = 'tie-content'

export type ContentKind = 'markdown' | 'probe' // later: text, image, hex (viewers), html (document)

export interface ContentPolicy {
  // Who makes the page: a Tie viewer (out/viewers/<kind>.html|js, our code, nonce'd). P3 adds
  // 'document' (the file is the page).
  page: 'viewer'
  // iframe sandbox tokens. Viewers: 'allow-scripts' only (opaque origin).
  sandbox: readonly string[]
  // style-src: 'nonce' (viewer's own <style nonce>), or 'inline' (any inline CSS, no nonce beside
  // it: CSP3 would ignore 'unsafe-inline' next to a nonce).
  styles: 'nonce' | 'inline'
  // Frame nav lock (main/content.ts contentFrameAllowed): 'viewer-exact' = only the token's exact
  // viewer URL. P3 adds 'within-root'.
  nav: 'viewer-exact'
  // Extra viewer files served under /_tie/ to this kind only (out/viewers/<name>).
  assets: readonly string[]
  // What the host sends the viewer from the file: 'text' (UTF-8), or nothing ('none'). P2 adds 'bytes'.
  payload: 'text' | 'none'
  // Largest file the kind opens (main/docs.ts; over it: error). 0 for kinds without a file.
  maxBytes: number
  // Dev builds only (harness kinds).
  dev: boolean
}

const MB = 1024 * 1024

// SECURITY: the reviewable table. Every row: scripts by nonce only, opaque origin (no
// allow-same-origin: the frame can't reach the shell, its storage, or another tile), no popups,
// top navigation, forms, modals, downloads. Changing a row changes what content can do.
export const POLICY: { readonly [K in ContentKind]: ContentPolicy } = {
  // Markdown: inline styles for Mermaid's SVG (<style>, style attributes; docs/MARKDOWN.md
  // "Diagrams"). The diagram library is a lazy asset.
  markdown: { page: 'viewer', sandbox: ['allow-scripts'], styles: 'inline', nav: 'viewer-exact', assets: ['markdown-mermaid.js'], payload: 'text', maxBytes: 8 * MB, dev: false },
  // Probe: harness kind (escape tests, sec-content-escape). Dev builds only.
  probe: { page: 'viewer', sandbox: ['allow-scripts'], styles: 'nonce', nav: 'viewer-exact', assets: [], payload: 'none', maxBytes: 0, dev: true },
}

export const CONTENT_KINDS = Object.keys(POLICY) as ContentKind[]

export function policyOf(kind: unknown): ContentPolicy | null {
  return typeof kind === 'string' && Object.hasOwn(POLICY, kind) ? POLICY[kind as ContentKind] : null
}

// Kinds whose viewer exists in this build (dev-only rows only in dev builds).
export function viewerKinds(dev: boolean): ContentKind[] {
  return CONTENT_KINDS.filter((k) => POLICY[k].page === 'viewer' && (dev || !POLICY[k].dev))
}

// SECURITY: content documents load nothing by default. Scripts: only the viewer's own, by a nonce
// minted per response (root files can never run as scripts, even with an injected <script>).
// Images: only from the tile's own token (no remote: tracking, LAN requests). No frames, forms,
// <base>, plugins, workers, connections.
// Styles: by nonce, or for 'inline' rows any inline CSS (`<style>` elements, style attributes)
// instead, never a stylesheet from anywhere (no host sources: no network). No nonce there: next to
// a nonce, 'unsafe-inline' is ignored (CSP3), for elements and attributes alike. Acceptable: inline
// CSS can only restyle the tile; its url()s are still bound by img-src (own token) and font-src
// (none); scripts stay nonce-only.
export function contentCsp(p: ContentPolicy, nonce: string, token: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    p.styles === 'inline' ? "style-src 'unsafe-inline'" : `style-src 'nonce-${nonce}'`,
    `img-src ${CONTENT_SCHEME}://${token}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
}
