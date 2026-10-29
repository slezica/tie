import { describe, it, expect } from 'vitest'
import { callerTile, replaceBlock, MAX_HOPS } from './callers'

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

describe('replaceBlock', () => {
  // 200 = pty of t1 (shell); 300 = tie, direct child; 310 = tie under 305 (sh), under the shell.
  const t: Record<number, number> = { 200: 100, 300: 200, 305: 200, 310: 305 }
  const par = (pid: number) => t[pid] ?? null
  const idle = () => ({ busy: false, others: [] })
  it('direct child of an idle shell: ok', () => {
    expect(replaceBlock(300, 200, par, idle)).toBeNull()
  })
  it('under another process: that process', () => {
    expect(replaceBlock(310, 200, par, idle)).toEqual({ why: 'under', pid: 305 })
  })
  it('the pty process itself (exec): under its parent', () => {
    expect(replaceBlock(200, 200, par, idle)).toEqual({ why: 'under', pid: 100 })
  })
  it('gone process: under unknown', () => {
    expect(replaceBlock(999, 200, par, idle)).toEqual({ why: 'under', pid: null })
  })
  it('busy, tie ignored: the first other child', () => {
    let ignored = 0
    const busy = (ignore: number) => ((ignored = ignore), { busy: true, others: [400, 401] })
    expect(replaceBlock(300, 200, par, busy)).toEqual({ why: 'busy', pid: 400 })
    expect(ignored).toBe(300)
  })
  it('busy without other children (--cmd pty): unknown process', () => {
    expect(replaceBlock(300, 200, par, () => ({ busy: true, others: [] }))).toEqual({ why: 'busy', pid: null })
  })
  it('lineage checked before busy', () => {
    expect(replaceBlock(310, 200, par, () => ({ busy: true, others: [305] }))).toEqual({ why: 'under', pid: 305 })
  })
})
