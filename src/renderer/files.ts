// Files from outside (Finder drops on the board): opened in their viewer where they land, like a
// template dropped there. No viewer: a modal says so (failures stay visible). docs/MARKDOWN.md.
import { S, tie, debug, type Kind } from './state'
import { openTile, besidePlacement } from './ops'
import { placementAt } from './drag'
import { infoDialog } from './dialog'

export async function dropFiles(paths: string[], x: number, y: number) {
  const failed: string[] = []
  for (const path of paths) {
    const v = await tie.doc.viewer(path) // main: exists, regular file, has a viewer
    if ('error' in v) {
      failed.push(v.error)
      continue
    }
    debug('markdown', 'drop', v.path)
    openTile(v.kind as Kind, placementAt(x, y) ?? besidePlacement(S.active), { path: v.path })
  }
  if (failed.length) await infoDialog("Can't open", [...new Set(failed)].join('\n'))
}
