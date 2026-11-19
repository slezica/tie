// bin/tie argument errors (CLI.md): refused before any connection. Run as a subprocess with
// TIE_SOCKET naming a path that doesn't exist: a call that got as far as connecting would fail with
// "cannot reach Tie" instead (the control case shows it does).
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const TIE = fileURLToPath(new URL('../../bin/tie', import.meta.url))
const SOCKET = join(tmpdir(), `tie-cli-test-${process.pid}-missing.sock`)

function tie(...args: string[]) {
  const env: Record<string, string | undefined> = { ...process.env, TIE_SOCKET: SOCKET }
  delete env.TIE_TILE
  const r = spawnSync(process.execPath, [TIE, ...args], { env, encoding: 'utf8', timeout: 10000 })
  return { code: r.status, out: r.stdout, err: r.stderr.trim() }
}

const refused = (args: string[], msg: string) => {
  const r = tie(...args)
  expect(r.err).toBe(`tie: ${msg}`)
  expect(r.code).toBe(1)
  expect(r.out).toBe('')
}

describe('bin/tie argument errors', () => {
  it('control: a valid command reaches for the socket', () => {
    const r = tie('list')
    expect(r.code).toBe(1)
    expect(r.err).toBe(`tie: cannot reach Tie at ${SOCKET} (ENOENT)`)
  })

  it('unknown command', () => {
    refused(['open', 'x.md'], 'unknown command: open (commands: list, add, replace, close, move, focus, set, ping; see tie --help)')
    refused(['title', '--title', 'x'], 'unknown command: title (commands: list, add, replace, close, move, focus, set, ping; see tie --help)')
  })

  it('unknown option, or an option of another command', () => {
    refused(['add', 'terminal', '--bogus', '1'], 'unknown option --bogus for add (see tie --help)')
    refused(['close', '--clear'], 'unknown option --clear for close (see tie --help)')
    refused(['l', '--tile', 't1'], 'unknown option --tile for list (see tie --help)') // aliases checked as their command
    refused(['set', '--swap', 't1', '--title', 'x'], 'unknown option --swap for set (see tie --help)')
  })

  it('unexpected argument', () => {
    refused(['list', 'x'], 'unexpected argument: x')
    refused(['ping', 't1'], 'unexpected argument: t1') // no positional ids: --tile
    refused(['add', 'terminal', 'x'], 'unexpected argument: x')
    refused(['add', 'a.md', 'b.md', 'c.md'], 'unexpected argument: c.md')
    refused(['replace', 'browser', 'x', 'y'], 'unexpected argument: y')
  })

  it('missing value', () => {
    refused(['add', 'terminal', '--cmd'], 'missing value for --cmd')
    refused(['move', '--at'], 'missing value for --at')
    refused(['set', '--title'], 'missing value for --title')
  })

  it('set needs a field', () => {
    refused(['set', '--tile', 't1'], 'set needs --title or --icon')
  })

  it('--help, -h, no arguments: the listing, every section, exit 0', () => {
    const sections = ['USAGE', 'DESCRIPTION', 'TILE KINDS', 'TILE IDS', 'PLACEMENT (add, move)', 'BEHAVIOR', 'OUTPUT AND EXIT STATUS', 'ENVIRONMENT', 'EXAMPLES']
    const help = tie('--help')
    expect(help.code).toBe(0)
    expect(help.err).toBe('')
    const heads = help.out.split('\n').filter((l) => /^[A-Z][A-Z ]*[A-Z]( \(.*\))?$/.test(l))
    expect(heads).toEqual(sections) // in this order, nothing else at column 0 in capitals
    expect(help.out.startsWith('tie - control Tie')).toBe(true)
    for (const args of [['-h'], [], ['add', '--help'], ['nope', '--help']]) {
      const r = tie(...args)
      expect(r.code).toBe(0)
      expect(r.out).toBe(help.out)
    }
  })
})
