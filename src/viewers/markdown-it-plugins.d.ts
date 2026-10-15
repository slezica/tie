// markdown-it plugins ship no types.
declare module 'markdown-it-footnote' {
  import type { MarkdownIt } from 'markdown-it'
  export default function plugin(md: MarkdownIt): void
}
declare module 'markdown-it-deflist' {
  import type { MarkdownIt } from 'markdown-it'
  export default function plugin(md: MarkdownIt): void
}
declare module 'markdown-it-emoji' {
  import type { MarkdownIt } from 'markdown-it'
  type Options = { defs?: Record<string, string>; shortcuts?: Record<string, string | string[]>; enabled?: string[] }
  export function full(md: MarkdownIt, options?: Options): void
  export function light(md: MarkdownIt, options?: Options): void
  export function bare(md: MarkdownIt, options?: Options): void
}
