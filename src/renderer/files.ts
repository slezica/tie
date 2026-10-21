// Files from outside (Finder drops on the board): opened in their kind where they land, like a
// template dropped there. Not openable (folder, too large...): a modal says so (failures stay
// visible). docs/INPUT.md.
import { S, tie, debug, type Kind } from './state'
import { untrusted } from '@core/log'
import { openTile, besidePlacement } from './ops'
import { placementAt } from './drag'
import { infoDialog } from './dialog'

export async function dropFiles(paths: string[], x: number, y: number) {
  const failed: string[] = []
  for (const path of paths) {
    const v = await tie.doc.viewer(path) // main: exists, regular file, its kind, size cap
    if ('error' in v) {
      failed.push(v.error)
      continue
    }
    debug('files', 'drop', v.kind, untrusted(v.path))
    openTile(v.kind as Kind, placementAt(x, y) ?? besidePlacement(S.active), { path: v.path })
  }
  if (failed.length) await infoDialog("Can't open", [...new Set(failed)].join('\n'))
}
