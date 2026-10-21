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
