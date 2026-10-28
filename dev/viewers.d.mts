// Types for dev/viewers.mjs (imported by electron.vite.config.ts).
export function allKinds(): string[]
export function buildViewer(kind: string): Promise<void>
export function buildBootstrap(): Promise<void>
export function buildViewers(kinds?: string[]): Promise<void>
export function watchViewers(kinds?: string[], log?: (m: string) => void): void
