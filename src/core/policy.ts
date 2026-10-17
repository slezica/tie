// Content kinds: the one security table. Every kind rendered in a content frame has a row here;
// the frame host (renderer/frame.ts: sandbox, navigation), the content protocol (main/content.ts:
// viewer files, documents, CSP, nav lock, bootstrap, storage, dev-only kinds), file opening
// (main/docs.ts: payload, size cap) and the viewer build (electron.vite.config.ts) read it. Pure,
// renderer-safe, unit-tested. docs/TILES.md "Policy", docs/SECURITY.md.

export const CONTENT_SCHEME = 'tie-content'

export type ContentKind = 'markdown' | 'text' | 'image' | 'hex' | 'html' | 'probe'

export interface ContentPolicy {
  // Who makes the page: a Tie viewer (out/viewers/<kind>.html|js, our code, nonce'd), or the file
  // itself ('document': html; its scripts run, on its own token origin, with documentCsp).
  page: 'viewer' | 'document'
  // iframe sandbox tokens. Viewers: 'allow-scripts' only (opaque origin). Documents: plus
  // 'allow-same-origin' (origin = their own token, never the shell's).
  sandbox: readonly string[]
  // style-src: 'nonce' (viewer's own <style nonce>), or 'inline' (any inline CSS, no nonce beside
  // it: CSP3 would ignore 'unsafe-inline' next to a nonce).
  styles: 'nonce' | 'inline'
  // Frame nav lock (main/content.ts contentFrameAllowed): 'viewer-exact' = only the token's exact
  // viewer URL; 'within-root' = .html/.htm documents of the token's root (not /_tie/).
  nav: 'viewer-exact' | 'within-root'
  // Extra viewer files served under /_tie/ to this kind only (out/viewers/<name>).
  assets: readonly string[]
  // What the host sends the viewer from the file over the port: 'text' (UTF-8), 'bytes' (raw,
  // transferred), or nothing ('none': the viewer loads the file from its own token, e.g. <img>).
  payload: 'text' | 'bytes' | 'none'
  // Largest file the kind opens (main/docs.ts; over it: error). 0 for kinds without a file.
  maxBytes: number
  // Main injects the html bootstrap (handshake, pong, link and window.open requests) first in the
  // document's <head> (documents only).
  bootstrap: boolean
  // Dev builds only (harness kinds).
  dev: boolean
}

const MB = 1024 * 1024

// SECURITY: the reviewable table. Viewer rows: scripts by nonce only, opaque origin (no
// allow-same-origin: the frame can't reach the shell, its storage, or another tile). The document
// row (html): the file's own scripts, on its own token origin (cross-origin to the shell and every
// other tile: allow-same-origin can't lift its sandbox), no network (documentCsp). Every row: no
// popups, top navigation, forms, modals, downloads. Changing a row changes what content can do.
export const POLICY: { readonly [K in ContentKind]: ContentPolicy } = {
  // Markdown: inline styles for Mermaid's SVG (<style>, style attributes; docs/MARKDOWN.md
  // "Diagrams"). The diagram library is a lazy asset.
  markdown: { page: 'viewer', sandbox: ['allow-scripts'], styles: 'inline', nav: 'viewer-exact', assets: ['markdown-mermaid.js'], payload: 'text', maxBytes: 8 * MB, bootstrap: false, dev: false },
  // Text: any UTF-8 file (sniffed), highlighted by extension, shown literally (docs/VIEWERS.md).
  text: { page: 'viewer', sandbox: ['allow-scripts'], styles: 'nonce', nav: 'viewer-exact', assets: [], payload: 'text', maxBytes: 10 * MB, bootstrap: false, dev: false },
  // Image: the viewer shows the file as an <img> from its own token (img-src); SVG stays inert
  // (images never run scripts or load anything).
  image: { page: 'viewer', sandbox: ['allow-scripts'], styles: 'nonce', nav: 'viewer-exact', assets: [], payload: 'none', maxBytes: 50 * MB, bootstrap: false, dev: false },
  // Hex: any file, bytes transferred over the port (no copy into strings).
  hex: { page: 'viewer', sandbox: ['allow-scripts'], styles: 'nonce', nav: 'viewer-exact', assets: [], payload: 'bytes', maxBytes: 16 * MB, bootstrap: false, dev: false },
  // Html: the file is the page (scripts on, local only). Served by the protocol with documentCsp and
  // the bootstrap; navigates within its folder; storage cleared on close. docs/VIEWERS.md "Html".
  html: { page: 'document', sandbox: ['allow-scripts', 'allow-same-origin'], styles: 'inline', nav: 'within-root', assets: [], payload: 'none', maxBytes: 10 * MB, bootstrap: true, dev: false },
  // Probe: harness kind (escape tests, sec-content-escape). Dev builds only.
  probe: { page: 'viewer', sandbox: ['allow-scripts'], styles: 'nonce', nav: 'viewer-exact', assets: [], payload: 'none', maxBytes: 0, bootstrap: false, dev: true },
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
  if (p.page === 'document') return documentCsp()
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

// SECURITY: html documents (and every file of their root, workers included) run their own scripts,
// isolated on their token origin: inline and eval add nothing there. Everything else is local only:
// 'self' (the token) plus data:/blob: for styles, images, fonts, media; connections only to 'self'.
// No remote source in any directive (no network: no exfiltration, no tracking, no LAN). No frames,
// objects, forms, <base>. WebRTC (STUN/TURN) is outside every CSP directive Chromium enforces:
// blocked for the whole shell session instead (main/security.ts noNetwork).
export function documentCsp(): string {
  return [
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline' data: blob:",
    "img-src 'self' data: blob:",
    "font-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ')
}
