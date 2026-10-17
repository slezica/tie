// Markdown kind: a live, read-only view of a .md file. A file view (fileview.ts) with the markdown
// viewer (src/viewers/markdown.ts). docs/MARKDOWN.md.
import { fileView } from '../fileview'
import type { Host, OpenOpts, Surface } from '.'

export const markdownKind = (host: Host, opts: OpenOpts): Surface => fileView(host, opts, { kind: 'markdown', icon: '📝' })
