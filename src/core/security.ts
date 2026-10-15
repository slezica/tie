// Pure security checks (no Electron imports, unit-tested). Used by src/main/security.ts.

// Normalized (URL parse: trailing slash, case), without fragment.
function noHash(u: string): string {
  try {
    const x = new URL(u)
    x.hash = ''
    return x.href
  } catch {
    return u.split('#')[0]
  }
}

// SECURITY: only the shell's own main frame may use IPC (= the pty/settings/app API). Subframes and
// any other page (content tiles, a navigation that slipped through) are refused.
export function isShellSender(frame: { url: string; parent: unknown } | null, shellUrl: string): boolean {
  return !!frame && !!shellUrl && frame.parent === null && noHash(frame.url) === noHash(shellUrl)
}

// SECURITY: schemes handed to the OS. Anything beyond http(s) launches registered apps (smb:, file:,
// custom handlers with argument injection). Returns the normalized URL, or null if refused.
export function externalUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

export function sameDocument(a: string, b: string): boolean {
  return !!b && noHash(a) === noHash(b)
}
