// Content roots in the UI (DIRECTORIES.md): the pure rule (`@core/roots`) plus the question about
// `/`: a frame rooted at `/` can read any file the user can. The user decides (record 2026-11-13).
import { dirOf, rootFor } from '@core/roots'
import { choiceDialog } from './dialog'
import { debug } from './state'
import { untrusted } from '@core/log'

// The root to show `path` under, or null (the user stopped). `current`: this tile's root now
// (navigation); `explicit`: `tie add --root`.
export async function resolveRoot(cwd: string, path: string, current?: string | null, explicit?: string | null): Promise<string | null> {
  const root = rootFor(cwd, path, current, explicit)
  if (root !== '/') return root
  const p = (text: string, cls = '') => Object.assign(document.createElement('p'), { textContent: text, className: cls })
  const choice = await choiceDialog({
    cls: 'root-slash',
    title: 'Open with the whole disk readable?',
    body: [p('This file would be shown with / as its root: the document could show any file you can read.'), p(path, 'url')],
    choices: [
      { label: 'Stop', value: 'stop' },
      { label: 'Use file directory', value: 'dir', secondary: true },
      { label: 'Open anyway', value: 'open', secondary: true },
    ],
  })
  debug('security', 'root / choice', choice, untrusted(path))
  if (choice === 'open') return '/'
  if (choice === 'dir' && dirOf(path) !== '/') return dirOf(path)
  return null
}
