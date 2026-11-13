// Content frame roots (DIRECTORIES.md, record 2026-11-13): what a content tile's frame may read.
// Pure rule, unit-tested; the UI (renderer/roots.ts) asks about `/`.

export const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/')) || '/'

// `path` is strictly under `dir` (`/` holds everything).
export const contains = (dir: string, path: string) => dir === '/' || path.startsWith(dir + '/')

// The root for showing `path`: the current root while it still holds the file (navigation keeps it),
// else the context tile's cwd when that holds the file, else the file's own folder. `explicit`
// (`tie add --root`): that, when it holds the file.
export function rootFor(cwd: string, path: string, current?: string | null, explicit?: string | null): string {
  if (explicit && contains(explicit, path)) return explicit
  if (current && contains(current, path)) return current
  if (contains(cwd, path)) return cwd
  return dirOf(path)
}

// The file's path within `root`, as a URL path on the frame's token (each segment encoded).
export const withinRoot = (root: string, path: string) =>
  '/' +
  path
    .slice(root === '/' ? 1 : root.length + 1)
    .split('/')
    .map(encodeURIComponent)
    .join('/')
