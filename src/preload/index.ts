import { contextBridge, ipcRenderer } from 'electron'

export interface Settings {
  shell: string
  theme: string
  lineHeight: number
  fontFamily: string
  fontSize: number
  cellWidth: number
}

type DataCb = (id: number, data: string) => void
type ExitCb = (id: number, code: number) => void
type ProcCb = (id: number, name: string) => void
type RpcCb = (reqId: number, method: string, params: unknown) => void

const api = {
  info: () => ipcRenderer.invoke('app:info'),
  ready: () => ipcRenderer.send('renderer:ready'),
  settings: {
    get: (): Promise<{ settings: Settings; defaults: { shell: string }; path: string }> => ipcRenderer.invoke('settings:get'),
    set: (patch: Partial<Settings>): Promise<{ ok: true; settings: Settings } | { ok: false; errors: { field: keyof Settings; message: string }[] }> =>
      ipcRenderer.invoke('settings:set', patch),
    onOpen: (cb: () => void) => {
      ipcRenderer.on('settings:open', () => cb())
    },
  },
  log: (tag: string, ...args: unknown[]) => ipcRenderer.send('log', tag, ...args),
  pty: {
    spawn: (o: { cmd?: string; cwd?: string; cols: number; rows: number; env: Record<string, string> }): Promise<number | { error: string }> =>
      ipcRenderer.invoke('pty:spawn', o),
    write: (id: number, data: string) => ipcRenderer.send('pty:write', id, data),
    resize: (id: number, cols: number, rows: number) => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id: number) => ipcRenderer.send('pty:kill', id),
    onData: (cb: DataCb) => {
      ipcRenderer.on('pty:data', (_e, id, d) => cb(id, d))
    },
    onExit: (cb: ExitCb) => {
      ipcRenderer.on('pty:exit', (_e, id, c) => cb(id, c))
    },
    onProcess: (cb: ProcCb) => {
      ipcRenderer.on('pty:process', (_e, id, n) => cb(id, n))
    },
  },
  rpc: {
    onRequest: (cb: RpcCb) => {
      ipcRenderer.on('rpc:request', (_e, reqId, method, params) => cb(reqId, method, params))
    },
    reply: (reqId: number, error: string | null, result: unknown) => ipcRenderer.send('rpc:reply', reqId, error, result),
  },
}

export type TieApi = typeof api
contextBridge.exposeInMainWorld('tie', api)
