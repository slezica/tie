import { describe, expect, it } from 'vitest'
import { compare, depth, merge, rank, score, parseLine, expandDir, joinPath, descendOf } from './picker'

// This repo's `git ls-files`, trimmed: every `reti` match + the `ti` / `tab` / `ter` / `tie` neighbours.
const REPO = `
bin/tie
bin/tie-dev
dev/scenarios/boot-settings.mjs
dev/scenarios/center-displace.mjs
dev/scenarios/center-swap.mjs
dev/scenarios/cli-tabs.mjs
dev/scenarios/sec-socket-external.mjs
dev/scenarios/settings-invalid.mjs
dev/scenarios/settings-malformed.mjs
dev/scenarios/settings.mjs
dev/scenarios/tab-autoscroll.mjs
dev/scenarios/tab-drops.mjs
dev/scenarios/tabs.mjs
dev/scenarios/terminal-fit.mjs
dev/scenarios/terminal.mjs
docs/2026-10-10-tabs-single-renderer.md
docs/2026-10-15-tile-host-plan.md
docs/2026-10-24-terminal-block-glyphs.md
docs/2026-10-28-tile-management.md
docs/TABS.md
docs/TERMINALS.md
docs/TILES.md
resources/bin/tie
src/core/callers.ts
src/core/content.ts
src/core/guest.ts
src/core/ids.ts
src/core/keymap.ts
src/core/kinds.ts
src/core/layout.ts
src/core/links.ts
src/core/log.ts
src/core/paste.ts
src/core/policy.ts
src/core/requests.ts
src/core/security.ts
src/core/watchdog.ts
src/main/settings.ts
src/renderer/appearance.ts
src/renderer/close.ts
src/renderer/dialog.ts
src/renderer/drag.ts
src/renderer/driver.ts
src/renderer/external.ts
src/renderer/files.ts
src/renderer/fileview.ts
src/renderer/frame.ts
src/renderer/guest.ts
src/renderer/icons.ts
src/renderer/index.html
src/renderer/keys.ts
src/renderer/kinds/html.ts
src/renderer/kinds/index.ts
src/renderer/kinds/probe.ts
src/renderer/kinds/terminal.ts
src/renderer/main.ts
src/renderer/menu.ts
src/renderer/nav.ts
src/renderer/ops.ts
src/renderer/paste.ts
src/renderer/prefs.ts
src/renderer/quit.ts
src/renderer/render.ts
src/renderer/settings.ts
src/renderer/shelf.ts
src/renderer/state.ts
src/renderer/style.css
src/renderer/tabs.ts
src/renderer/themes.ts
src/renderer/tile.ts
src/viewers/markdown-it-plugins.d.ts
src/viewers/runtime.ts
`.trim().split('\n')

const at = (path: string, pos: number[]) => pos.map((i) => path[i]).join('')

describe('score', () => {
  it('fzf v1 window, path constants', () => {
    // window `rer/ti` in `renderer/tile`: r 16, e 16+4 (consecutive), gaps -3 -1, t 16+9 (after `/`), i 16+9
    expect(score('reti', 'src/renderer/tile.ts')).toEqual({ score: 82, positions: [9, 10, 13, 14] })
    // start of path = after a delimiter (9, ×2 on the first char)
    expect(score('s', 'src')!.score).toBe(16 + 18)
    expect(score('t', 'a_tile')!.score).toBe(16 + 16) // after `_`: 8
    expect(score('t', 'aTile')!.score).toBe(16 + 14) // camel: 7
    expect(score('t', 'atile')!.score).toBe(16)
    expect(score('x', 'abc')).toBeNull()
    expect(score('ba', 'ab')).toBeNull()
  })
  it('positions index the path, one per query char', () => {
    for (const [q, p] of [['reti', 'src/renderer/tile.ts'], ['tie', 'resources/bin/tie'], ['RT', 'README-TOO.md']]) {
      const r = score(q, p)!
      expect(at(p, r.positions).toLowerCase()).toBe(q.toLowerCase())
    }
  })
  it('smart case', () => {
    expect(score('tile', 'Tile.ts')).not.toBeNull()
    expect(score('Tile', 'tile.ts')).toBeNull()
    expect(score('Tile', 'Tile.ts')).not.toBeNull()
    expect(rank('Tile', ['tile.ts', 'Tile.ts'], 8).map((h) => h.path)).toEqual(['Tile.ts'])
    expect(rank('tile', ['tile.ts', 'Tile.ts'], 8)).toHaveLength(2)
  })
  it('terms: all required, scores summed, positions merged', () => {
    const p = 'src/renderer/tile.ts'
    const r = score('renderer tile', p)!
    expect(r.score).toBe(score('renderer', p)!.score + score('tile', p)!.score)
    expect(r.positions).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16])
    expect(score('renderer tile', 'src/renderer/tabs.ts')).toBeNull()
    expect(score('  tile   ts ', p)!.positions).toEqual([13, 14, 15, 16, 18, 19]) // overlap deduped
    expect(rank('renderer tile', REPO, 8).map((h) => h.path)).toContain('src/renderer/tile.ts')
    expect(rank('renderer tile', REPO, 8).map((h) => h.path)).not.toContain('src/renderer/tabs.ts')
  })
  it('empty query matches everything with score 0', () => {
    expect(score('', 'a/b')).toEqual({ score: 0, positions: [] })
    expect(score('   ', 'a/b')).toEqual({ score: 0, positions: [] })
  })
  it('NFC on both sides; positions in the original string', () => {
    const nfc = 'café.md', nfd = 'café.md'
    for (const q of [nfc.slice(0, 4), nfd.slice(0, 5)]) {
      expect(score(q, nfc)!.positions).toEqual([0, 1, 2, 3])
      expect(score(q, nfd)!.positions).toEqual([0, 1, 2, 3, 4]) // é = e + U+0301, both highlighted
      expect(score(q, nfd)!.score).toBe(score(q, nfc)!.score)
    }
    expect(score('md', nfd)!.positions).toEqual([6, 7]) // shifted back past the combining mark
    expect(score('É', 'ÉTÉ')!.positions).toEqual([0, 1]) // first window, decomposed
  })
})

describe('rank', () => {
  it('reti → src/renderer/tile.ts (as fzf)', () => {
    expect(rank('reti', REPO, 1)[0].path).toBe('src/renderer/tile.ts')
    expect(rank('reti', REPO, 3).map((h) => h.path))
      .toEqual(['src/renderer/tile.ts', 'resources/bin/tie', 'src/renderer/kinds/terminal.ts'])
  })
  it('ties: depth, then length, then path', () => {
    expect(rank('readme', ['a/b/README.md', 'README-long-name.md', 'a/README.md'], 3).map((h) => h.path))
      .toEqual(['README-long-name.md', 'a/README.md', 'a/b/README.md'])
    expect(rank('a', ['xa', 'a', 'b/a'], 3).map((h) => h.path)).toEqual(['a', 'b/a', 'xa'])
    expect(rank('', ['b/c', 'zz', 'b/', 'a'], 4).map((h) => h.path)).toEqual(['a', 'b/', 'zz', 'b/c'])
    expect(depth('src/renderer/')).toBe(1)
    expect(depth('src/renderer/tile.ts')).toBe(2)
  })
  it('top-K = the head of a full sort', () => {
    for (const q of ['', 't', 'reti', 'sts', 'tabs']) {
      const all = rank(q, REPO, REPO.length)
      expect([...all].sort(compare)).toEqual(all)
      for (const k of [1, 3, 8]) expect(rank(q, REPO, k)).toEqual(all.slice(0, k))
    }
    expect(rank('t', REPO, 0)).toEqual([])
  })
  it('merge of streamed chunks = rank of all', () => {
    for (const q of ['', 'reti', 'ts']) {
      let top = rank(q, [], 8)
      for (let i = 0; i < REPO.length; i += 17) top = merge(top, rank(q, REPO.slice(i, i + 17), 8), 8)
      expect(top).toEqual(rank(q, REPO, 8))
    }
  })
  it('50k paths of ~80 chars: fast', () => {
    let seed = 1
    const rnd = (n: number) => ((seed = (seed * 16807) % 2147483647) % n)
    const words = ['src', 'lib', 'node_modules', 'components', 'renderer', 'test', 'utils', 'index', 'main',
      'config', 'docs', 'build', 'assets', 'styles', 'kinds', 'tile', 'state', 'helpers', 'vendor', 'core']
    const paths = Array.from({ length: 50_000 }, () => {
      let p = words[rnd(20)]
      while (p.length < 72) p += '/' + words[rnd(20)] + (rnd(3) ? '' : '-' + words[rnd(20)])
      return p + '.' + ['ts', 'md', 'json', 'css'][rnd(4)]
    })
    rank('reti', paths, 8) // warm up
    const t = performance.now()
    const top = rank('reti', paths, 8)
    expect(performance.now() - t).toBeLessThan(200)
    expect(top).toHaveLength(8)
  })
})

describe('parseLine', () => {
  const home = '/Users/me'
  it('splits at the last slash, expands ~', () => {
    expect(parseLine('~/proj/reti', home)).toEqual({ prefix: '~/proj/', dir: '/Users/me/proj', query: 'reti' })
    expect(parseLine('~/', home)).toEqual({ prefix: '~/', dir: '/Users/me', query: '' })
    expect(parseLine('/', home)).toEqual({ prefix: '/', dir: '/', query: '' })
    expect(parseLine('/etc/hosts', home)).toEqual({ prefix: '/etc/', dir: '/etc', query: 'hosts' })
  })
  it('no slash: under the root', () => {
    expect(parseLine('~', home)).toEqual({ prefix: '', dir: '/', query: '~' })
    expect(parseLine('', home)).toEqual({ prefix: '', dir: '/', query: '' })
    expect(parseLine('src/ti', home)).toEqual({ prefix: 'src/', dir: '/src', query: 'ti' })
  })
  it('~ only as a whole first segment; no $VAR', () => {
    expect(expandDir('~foo/', home)).toBe('/~foo')
    expect(expandDir('/a/~/', home)).toBe('/a/~')
    expect(expandDir('$HOME/', home)).toBe('/$HOME')
  })
  it('normalizes lexically', () => {
    expect(expandDir('/a//b/./c/../', home)).toBe('/a/b')
    expect(expandDir('/../..//', home)).toBe('/')
    expect(expandDir('~/../', home)).toBe('/Users')
  })
})

describe('joinPath, descendOf', () => {
  it('joins', () => {
    expect(joinPath('/', 'a/b.ts')).toBe('/a/b.ts')
    expect(joinPath('/x', 'a/')).toBe('/x/a/')
  })
  it('descends into a dir or a file parent', () => {
    expect(descendOf('src/renderer/')).toBe('src/renderer/')
    expect(descendOf('src/renderer/tile.ts')).toBe('src/renderer/')
    expect(descendOf('a.txt')).toBe('')
  })
})
