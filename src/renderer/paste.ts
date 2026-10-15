// Guarded paste: cmd+V / menu paste and OS drops, routed to the tile's kind (Surface.paste/drop).
// SECURITY.md.
import { S, tie } from './state'
import { confirmDialog } from './dialog'
import { pasteRisks, showControls } from '@core/paste'

export interface PasteTarget {
  bracketed: boolean // program enabled bracketed paste (newlines won't run)
  alive(): boolean
  write(text: string): void
}

// SECURITY: every paste into a terminal goes through here, never straight to xterm. Control
// characters and would-run newlines ask first (settings can turn each check off: then raw).
// "Paste anyway" sends the text unmodified.
export async function pasteInto(text: string, to: PasteTarget) {
  if (!text) return
  const { settings } = await tie.settings.get()
  const risks = pasteRisks(text, to.bracketed)
  const warn = { control: risks.control && settings.warnPasteControl, run: risks.run && settings.warnPasteRun }
  if ((warn.control || warn.run) && !(await confirmPaste(text, warn))) return
  if (!to.alive()) return // closed while asking
  to.write(text)
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

const tileAt = (target: EventTarget | null) => {
  const id = (target as Element | null)?.closest?.('.tile')?.getAttribute('data-id')
  return id ? S.tiles.get(id) : undefined
}

// SECURITY: capture phase on the tile layer: xterm's own paste handler (unguarded) never sees it.
// Pastes on a tile go to its kind (nothing if it takes none).
export function initPaste() {
  document.getElementById('tiles')!.addEventListener(
    'paste',
    (e) => {
      const t = tileAt(e.target)
      if (!t) return
      e.preventDefault()
      e.stopPropagation()
      t.surface.paste?.(e.clipboardData?.getData('text/plain') ?? '')
    },
    true,
  )
}

// OS drop on a tile: its kind decides (terminal: paths or text, guarded). Elsewhere: nothing.
// (Navigation-on-drop is already refused globally, main.ts.)
export function dropOnTile(e: DragEvent) {
  const t = tileAt(e.target)
  if (t && e.dataTransfer) t.surface.drop?.(e.dataTransfer)
}
