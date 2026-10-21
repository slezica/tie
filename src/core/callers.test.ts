import { describe, it, expect } from 'vitest'
import { callerTile, MAX_HOPS } from './callers'

// Process tree: 1 ← 100 (Tie) ← 200 (pty of t1) ← 300 (node: tie) ; 1 ← 400 (other app)
const tree: Record<number, number> = { 100: 1, 200: 100, 300: 200, 400: 1 }
const parentOf = (pid: number) => tree[pid] ?? null
const ptys = new Map([[200, 't1']])

describe('callerTile', () => {
  it('descendant of a pty, same uid: that tile', () => {
    expect(callerTile({ pid: 300, uid: 501 }, 501, parentOf, ptys)).toEqual({ kind: 'tile', tile: 't1' })
  })
  it('the pty process itself', () => {
    expect(callerTile({ pid: 200, uid: 501 }, 501, parentOf, ptys)).toEqual({ kind: 'tile', tile: 't1' })
  })
  it('same uid, no pty ancestor: external', () => {
    expect(callerTile({ pid: 400, uid: 501 }, 501, parentOf, ptys)).toEqual({ kind: 'external' })
  })
  it('uid mismatch: refused, even under a pty', () => {
    expect(callerTile({ pid: 300, uid: 0 }, 501, parentOf, ptys).kind).toBe('refused')
  })
  it('unknown peer: refused', () => {
    expect(callerTile(null, 501, parentOf, ptys).kind).toBe('refused')
  })
  it('gone process mid-walk: external', () => {
    expect(callerTile({ pid: 999, uid: 501 }, 501, parentOf, ptys)).toEqual({ kind: 'external' })
  })
  it('stops at pid 1 and 0', () => {
    const seen: number[] = []
    const p = (pid: number) => (seen.push(pid), pid === 5 ? 0 : 1)
    expect(callerTile({ pid: 5, uid: 1 }, 1, p, new Map([[0, 'x']]))).toEqual({ kind: 'external' })
    expect(seen).toEqual([5])
  })
  it('loop: bounded, external', () => {
    let calls = 0
    const loop = (pid: number) => (calls++, pid === 10 ? 11 : 10)
    expect(callerTile({ pid: 10, uid: 1 }, 1, loop, ptys)).toEqual({ kind: 'external' })
    expect(calls).toBeLessThanOrEqual(MAX_HOPS + 1)
  })
  it('pty beyond the hop limit: external', () => {
    const deep = (pid: number) => pid + 1 // 10 → 11 → ... ; pty far up
    expect(callerTile({ pid: 10, uid: 1 }, 1, deep, new Map([[10 + MAX_HOPS + 5, 't9']]))).toEqual({ kind: 'external' })
    expect(callerTile({ pid: 10, uid: 1 }, 1, deep, new Map([[10 + MAX_HOPS, 't9']]))).toEqual({ kind: 'tile', tile: 't9' })
  })
})
