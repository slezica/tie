// Title-bar SVG icons and program → emoji table.

const svg = (body: string) =>
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

export const ICON = {
  collapse: svg('<path d="M4 6l4 4 4-4"/>'),
  expand: svg('<path d="M6 4l4 4-4 4"/>'),
  zoom: svg('<path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5L9 7M2.5 13.5L7 9"/>'),
  unzoom: svg('<path d="M13 3L9 7M9 3.5V7h3.5M3 13l4-4M7 12.5V9H3.5"/>'),
  close: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
}

const PROGRAMS: Record<string, string> = {
  vim: '📝', nvim: '📝', vi: '📝', nano: '📝', hx: '📝',
  node: '🟩', bun: '🥟', deno: '🦕', npm: '📦', pnpm: '📦', yarn: '📦', npx: '📦',
  python: '🐍', python3: '🐍', ipython: '🐍', uv: '🐍',
  git: '🌿', lazygit: '🌿', tig: '🌿',
  ssh: '🔐', mosh: '🔐',
  top: '📊', htop: '📊', btop: '📊',
  less: '📜', tail: '📜', more: '📜', man: '📜',
  claude: '✳️', codex: '🤖',
  cargo: '🦀', rustc: '🦀', go: '🐹', make: '🛠️', docker: '🐳',
  psql: '🐘', sqlite3: '🗄️', redis: '🗄️',
}

export const SHELLS = new Set(['zsh', 'bash', 'fish', 'sh', 'nu', 'login', '-zsh', '-bash'])

// Empty string = default terminal glyph.
export function iconFor(proc?: string): string {
  if (!proc) return ''
  const base = proc.split('/').pop()!.replace(/^-/, '').replace(/[0-9.]+$/, '')
  return PROGRAMS[proc] || PROGRAMS[base] || ''
}
