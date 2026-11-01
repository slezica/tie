// Probe kind (dev builds only): a content frame the harness drives from inside, to attempt
// escapes (sec-content-escape). Root: `--root`, else its cwd. Its one handler: openLink (main allows
// http(s) only).
import { tie } from '../state'
import { frameSurface } from '../frame'
import type { Host, OpenOpts, Surface } from '.'

export function probeKind(host: Host, opts: OpenOpts): Surface {
  return frameSurface(host, {
    viewer: 'probe',
    root: opts.root || host.cwd(),
    title: 'probe',
    icon: 'probe',
    handlers: { openLink: (r) => tie.openExternal(r.url) },
  })
}
