export function peerOf(fd: number): { pid: number; uid: number } | null
export function parentOf(pid: number): number | null
export function childrenOf(pid: number): number[] | null
export function nameOf(pid: number): string | null
