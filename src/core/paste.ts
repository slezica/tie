// Pure paste/drop checks (renderer-safe: no Node imports, unit-tested).
// SECURITY: pasted text is untrusted (web pages hide text in copies). Control characters (C0 except
// tab/newline/CR, DEL, C1) can end a bracketed paste early (`ESC[201~`), drive line editors and
// TUIs (ESC, ^C). Newlines run commands when the program hasn't enabled bracketed paste.
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/
export function pasteRisks(text: string, bracketed: boolean): { control: boolean; run: boolean } {
  return { control: CONTROL.test(text), run: !bracketed && /[\r\n]/.test(text) }
}

// Control characters in caret notation (ESC → ^[, ^C, DEL → ^?; C1 → <9B>), for previews.
export function showControls(text: string): string {
  return text.replace(new RegExp(CONTROL.source, 'g'), (c) => {
    const n = c.charCodeAt(0)
    if (n < 0x20) return '^' + String.fromCharCode(n + 64)
    if (n === 0x7f) return '^?'
    return `<${n.toString(16).toUpperCase()}>`
  })
}

// SECURITY: dropped file names are untrusted (`$(...)`, `;`, quotes). Single quotes stop all shell
// expansion; a quote inside becomes '\''. Control characters are left for the paste guard.
export function shellQuote(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`
}
