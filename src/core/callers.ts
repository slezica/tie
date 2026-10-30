// Control socket callers (main/socket.ts): who is on the other end, from kernel facts only.
// SECURITY: a caller is a tile's when its process descends from that tile's pty (the shell Tie
// spawned) and runs as Tie's user. Nothing the caller sends (TIE_TILE, params.caller) counts.

export interface Peer {
  pid: number
  uid: number
}

export type Caller = { kind: 'tile'; tile: string } | { kind: 'external' } | { kind: 'refused'; why: string }

export const MAX_HOPS = 64

// peer: from the socket (null = unknown). uid: Tie's. parentOf: ppid, null if the process is gone.
// ptyTiles: pty pid → tile id.
export function callerTile(peer: Peer | null, uid: number, parentOf: (pid: number) => number | null, ptyTiles: Map<number, string>): Caller {
  if (!peer) return { kind: 'refused', why: 'unknown peer' }
  if (peer.uid !== uid) return { kind: 'refused', why: `uid ${peer.uid} is not ${uid}` }
  let pid: number | null = peer.pid
  for (let hop = 0; hop <= MAX_HOPS && pid !== null && pid > 1; hop++) {
    const tile = ptyTiles.get(pid)
    if (tile) return { kind: 'tile', tile }
    pid = parentOf(pid)
  }
  return { kind: 'external' }
}

// `tie replace` (CLI.md): the caller's terminal gives its place to the opened tile.
// SECURITY: kernel facts only, and only the caller's own terminal (the lineage tile's pty). tie must
// run straight in that shell (peer's parent = the pty process: nothing in between, like an editor,
// would lose its terminal), and the shell must run nothing else (busy, TERMINALS.md, tie aside).
// busy(ignore): the pty's busy state ignoring that pid, with its other children.
export type ReplaceBlock = { why: 'under'; pid: number | null } | { why: 'busy'; pid: number | null }

export function replaceBlock(peer: number, pty: number, parentOf: (pid: number) => number | null, busy: (ignore: number) => { busy: boolean; others: number[] }): ReplaceBlock | null {
  const parent = parentOf(peer)
  if (parent !== pty) return { why: 'under', pid: parent }
  const b = busy(peer)
  return b.busy ? { why: 'busy', pid: b.others[0] ?? null } : null
}
