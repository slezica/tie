// SVG icons: title-bar buttons (ICON), built-in tile / template glyphs (GLYPH), program → glyph table.
// All 16-unit line icons in currentColor. Custom icons (tie icon, menu) are user text, not these.

const svg = (body: string) =>
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

export const ICON = {
  // Arrows joining at the center / parting from it, horizontally (rotated with a vertical title).
  collapse: svg('<path d="M1.5 8h5M4.5 5.5L7 8l-2.5 2.5M14.5 8h-5M11.5 5.5L9 8l2.5 2.5"/>'),
  expand: svg('<path d="M6.5 8H1.5M4 5.5L1.5 8 4 10.5M9.5 8h5M12 5.5L14.5 8 12 10.5"/>'),
  zoom: svg('<path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5L9 7M2.5 13.5L7 9"/>'),
  unzoom: svg('<path d="M13 3L9 7M9 3.5V7h3.5M3 13l4-4M7 12.5V9H3.5"/>'),
  close: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
  back: svg('<path d="M10 3.5L5.5 8l4.5 4.5"/>'),
  forward: svg('<path d="M6 3.5l4.5 4.5L6 12.5"/>'),
  reload: svg('<path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M13 2.5v3h-3"/>'),
}

// Built-in icons of tiles (Surface.icon()) and shelf templates.
export const GLYPH = {
  terminal: svg('<path d="M3 4.5L6.5 8 3 11.5M8.5 12H13"/>'),
  folder: svg('<path d="M1.5 4.5a1 1 0 0 1 1-1h3.5L7.5 5h6a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/>'),
  browser: svg('<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c-3.2 3.4-3.2 8.6 0 12M8 2c3.2 3.4 3.2 8.6 0 12"/>'),
  // Files
  markdown: svg('<rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/><path d="M4 10V6l2 2 2-2v4M11 6v4M9.5 8.5L11 10l1.5-1.5"/>'),
  text: svg('<path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M9.5 1.5v3h3M5.5 8h5M5.5 10.5h5"/>'),
  image: svg('<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><circle cx="10.5" cy="5.5" r="1"/><path d="M2.5 12l3.5-4 3 3 2-2 2.5 2.5"/>'),
  hex: svg('<path d="M6.5 2.5L5 13.5M11 2.5L9.5 13.5M3 6h10.5M2.5 10H13"/>'),
  html: svg('<path d="M5 4.5L1.5 8 5 11.5M11 4.5L14.5 8 11 11.5M9.5 3l-3 10"/>'),
  // Programs (PROGRAMS)
  editor: svg('<path d="M10.5 2.5l3 3L6 13H3v-3z"/><path d="M9 4l3 3"/>'),
  runtime: svg('<path d="M8 1.5l5.6 3.25v6.5L8 14.5l-5.6-3.25v-6.5z"/>'),
  package: svg('<path d="M2.5 5L8 2l5.5 3v6L8 14l-5.5-3z"/><path d="M2.5 5L8 8l5.5-3M8 8v6"/>'),
  python: svg('<path d="M7 7.5H4.5a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2H9a2 2 0 0 1 2 2V7M9 8.5h2.5a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9"/>'),
  git: svg('<circle cx="5" cy="3.5" r="1.5"/><circle cx="5" cy="12.5" r="1.5"/><circle cx="11" cy="5" r="1.5"/><path d="M5 5v6M11 6.5c0 2.5-6 2-6 4.5"/>'),
  remote: svg('<rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>'),
  monitor: svg('<path d="M1.5 8.5h3l2-5 3 9 2-4h3"/>'),
  pager: svg('<path d="M3 3.5h10M3 6.5h10M3 9.5h10M3 12.5h6"/>'),
  ai: svg('<path d="M8 1.5c.6 3.4 3.1 5.9 6.5 6.5-3.4.6-5.9 3.1-6.5 6.5-.6-3.4-3.1-5.9-6.5-6.5 3.4-.6 5.9-3.1 6.5-6.5z"/>'),
  build: svg('<circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>'),
  container: svg('<path d="M8 2l6 3-6 3-6-3z"/><path d="M2 8l6 3 6-3M2 11l6 3 6-3"/>'),
  database: svg('<ellipse cx="8" cy="4" rx="5" ry="2"/><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2"/>'),
  probe: svg('<path d="M6 1.5v5L2.6 12.8a1 1 0 0 0 .9 1.7h9a1 1 0 0 0 .9-1.7L10 6.5v-5M5 1.5h6M4.5 10h7"/>'),
}
export type Glyph = keyof typeof GLYPH

// What a title bar, shelf item, tab or drag ghost shows: a built-in glyph, or user text (custom icon).
export type Icon = { glyph: Glyph } | { text: string }

const PROGRAMS: Record<string, Glyph> = {
  vim: 'editor', nvim: 'editor', vi: 'editor', nano: 'editor', hx: 'editor',
  node: 'runtime', bun: 'runtime', deno: 'runtime',
  npm: 'package', pnpm: 'package', yarn: 'package', npx: 'package',
  python: 'python', python3: 'python', ipython: 'python', uv: 'python',
  git: 'git', lazygit: 'git', tig: 'git',
  ssh: 'remote', mosh: 'remote',
  top: 'monitor', htop: 'monitor', btop: 'monitor',
  less: 'pager', tail: 'pager', more: 'pager', man: 'pager',
  claude: 'ai', codex: 'ai',
  cargo: 'build', rustc: 'build', go: 'build', make: 'build',
  docker: 'container',
  psql: 'database', sqlite3: 'database', redis: 'database',
}

export const SHELLS = new Set(['zsh', 'bash', 'fish', 'sh', 'nu', 'login', '-zsh', '-bash'])

// Shell or unknown program: the terminal glyph.
export function iconFor(proc?: string): Glyph {
  if (!proc) return 'terminal'
  // Case-folded: macOS framework Python runs as "Python".
  const base = proc.split('/').pop()!.replace(/^-/, '').replace(/[0-9.]+$/, '').toLowerCase()
  return PROGRAMS[proc] || PROGRAMS[base] || 'terminal'
}

// Glyphs are our markup; custom icons are user text (CLI, menu): escaped, never markup.
export function iconHtml(icon: Icon): string {
  if ('glyph' in icon) return `<span class="glyph">${GLYPH[icon.glyph]}</span>`
  return `<span class="emoji">${icon.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`
}
