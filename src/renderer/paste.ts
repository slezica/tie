// Guarded paste into terminal tiles: cmd+V / menu paste and OS drops (paths, text). SECURITY.md.
import { S, tie, type Tile } from './state'
import { activate } from './ops'
import { confirmDialog } from './dialog'
import { pasteRisks, showControls, shellQuote } from '@core/paste'

// SECURITY: every paste into a terminal goes through here, never straight to xterm. Control
// characters and would-run newlines ask first (settings can turn each check off: then raw).
// "Paste anyway" sends the text unmodified.
export async function pasteInto(t: Tile, text: string) {
  if (!text || t.pty === null) return
  const { settings } = await tie.settings.get()
  const risks = pasteRisks(text, t.term.modes.bracketedPasteMode)
  const warn = { control: risks.control && settings.warnPasteControl, run: risks.run && settings.warnPasteRun }
  if ((warn.control || warn.run) && !(await confirmPaste(text, warn))) return
  if (S.tiles.get(t.id) !== t) return // closed while asking
  t.term.paste(text)
}

function confirmPaste(text: string, warn: { control: boolean; run: boolean }): Promise<boolean> {
  const item = (key: string, msg: string) => {
    const p = document.createElement('p')
    p.textContent = msg
    p.dataset.warning = key
    return p
  }
  const warnings: HTMLElement[] = []
  if (warn.control) warnings.push(item('control', 'Contains control characters (shown in red, as ^X). They can end the paste early, or act as keys in the running program.'))
  if (warn.run) warnings.push(item('run', 'Contains line breaks, and the running program would execute each line on paste.'))
  // Preview: control characters as red symbols. Text nodes only (never markup from the paste).
  const preview = document.createElement('pre')
  preview.className = 'preview'
  const clipped = text.length > 2000 ? text.slice(0, 2000) : text
  for (const part of clipped.split(/([\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]+)/)) {
    if (!part) continue
    const shown = showControls(part)
    if (shown === part) preview.append(part)
    else preview.append(Object.assign(document.createElement('span'), { className: 'ctl', textContent: shown }))
  }
  if (clipped !== text) preview.append('\n…')
  return confirmDialog({ cls: 'paste-warning', title: 'Paste into terminal?', body: [...warnings, preview], confirm: 'Paste anyway' })
}

const terminalAt = (target: EventTarget | null) => {
  const id = (target as Element | null)?.closest?.('.tile')?.getAttribute('data-id')
  const t = id ? S.tiles.get(id) : undefined
  return t?.kind === 'terminal' ? t : undefined
}

// SECURITY: capture phase on the tile layer: xterm's own paste handler (unguarded) never sees it.
export function initPaste() {
  document.getElementById('tiles')!.addEventListener(
    'paste',
    (e) => {
      const t = terminalAt(e.target)
      if (!t) return
      e.preventDefault()
      e.stopPropagation()
      pasteInto(t, e.clipboardData?.getData('text/plain') ?? '')
    },
    true,
  )
}

// OS drop on a terminal: files → shell-quoted paths; else a link or text. Elsewhere: nothing.
// (Navigation-on-drop is already refused globally, main.ts.)
export function dropOnTerminal(e: DragEvent) {
  const t = terminalAt(e.target)
  const dt = e.dataTransfer
  if (!t || !dt) return
  const files = [...dt.files].map((f) => tie.pathForFile(f)).filter(Boolean)
  const link = dt.getData('text/uri-list').split(/\r?\n/).find((l) => l && !l.startsWith('#'))
  const text = files.length ? files.map(shellQuote).join(' ') + ' ' : link || dt.getData('text/plain')
  if (!text) return
  activate(t.id)
  pasteInto(t, text)
}
