// Probe kind (dev builds only): a content frame the harness drives from inside, to attempt
// escapes (sec-content-escape). Root: the open's cwd. Its one handler: openLink (main allows
// http(s) only).
import { S, tie } from '../state'
import { frameSurface } from '../frame'
import type { Host, OpenOpts, Surface } from '.'

export function probeKind(host: Host, opts: OpenOpts): Surface {
  return frameSurface(host, {
    viewer: 'probe',
    root: opts.cwd || S.cwd,
    title: 'probe',
    icon: '🧪',
    handlers: { openLink: (r) => tie.openExternal(r.url) },
  })
}
