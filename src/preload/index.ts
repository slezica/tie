import { contextBridge, ipcRenderer, webUtils } from 'electron'

export interface Settings {
  shell: string
  theme: string
  lineHeight: number
  fontFamily: string
  fontSize: number
  cellWidth: number
  borderless: boolean
  tabBar: 'top' | 'bottom'
  shelfStyle: 'normal' | 'compact'
  terminalTitle: 'auto' | 'command' | 'directory'
  warnPasteControl: boolean
  warnPasteRun: boolean
  confirmExternal: boolean
  allowExternalControl: boolean
}

type DataCb = (id: number, data: string) => void
type ExitCb = (id: number, code: number) => void
type ProcCb = (id: number, name: string) => void
// File content for a viewer (policy payload): text, bytes, or nothing (the viewer loads it by URL).
export type DocBody = { text?: string; bytes?: Uint8Array }
type RpcCb = (reqId: number, method: string, params: unknown) => void

const api = {
  info: () => ipcRenderer.invoke('app:info'),
  ready: () => ipcRenderer.send('renderer:ready'),
  quit: () => ipcRenderer.send('app:quit'),
  // Main validates the scheme (http/https only).
  openExternal: (url: string) => ipcRenderer.send('external:open', url),
  // Absolute path of a dropped file ('' if not a real file).
  pathForFile: (f: File): string => webUtils.getPathForFile(f),
  settings: {
    get: (): Promise<{ settings: Settings; defaults: { shell: string }; path: string; error: string | null }> => ipcRenderer.invoke('settings:get'),
    set: (patch: Partial<Settings>): Promise<{ ok: true; settings: Settings } | { ok: false; errors: { field: keyof Settings | 'file'; message: string }[] }> =>
      ipcRenderer.invoke('settings:set', patch),
    previewBorderless: (on: boolean) => ipcRenderer.send('window:borderless-preview', on),
    onOpen: (cb: () => void) => {
      ipcRenderer.on('settings:open', () => cb())
    },
  },
  // Content tiles (sandboxed frames): main registers `root` under a fresh token, returns the frame URL.
  content: {
    // Document kinds (html) also name the page (path relative to the root).
    open: (root: string, kind: string, page?: string): Promise<{ token: string; url: string } | { error: string }> => ipcRenderer.invoke('content:open', root, kind, page),
    close: (token: string) => ipcRenderer.send('content:close', token),
    // Watchdog: frame stopped answering. Main kills its process (if it holds nothing else), then closes.
    kill: (token: string) => ipcRenderer.send('content:kill', token),
    // Documents (main watches their frames and folders): committed navigation (URL path), failed
    // navigation, folder changed.
    onNavigated: (cb: (token: string, path: string) => void) => {
      ipcRenderer.on('content:navigated', (_e, token, path) => cb(token, path))
    },
    onNavFailed: (cb: (token: string, url: string) => void) => {
      ipcRenderer.on('content:navfailed', (_e, token, url) => cb(token, url))
    },
    onChanged: (cb: (token: string) => void) => {
      ipcRenderer.on('content:changed', (_e, token) => cb(token))
    },
  },
  // Files in viewer tiles (file view). Main checks paths, reads and watches. Read-only: no writes.
  doc: {
    // Main: exists, regular file, its kind (or `kind`, if allowed), size cap.
    viewer: (path: string, kind?: string): Promise<{ kind: string; path: string } | { error: string }> => ipcRenderer.invoke('doc:viewer', path, kind),
    // As `kind` (the tile's; main checks the file may be shown so). Body per the kind's payload.
    open: (path: string, kind: string): Promise<({ id: number; kind: string; rev: string } & DocBody) | { error: string }> => ipcRenderer.invoke('doc:open', path, kind),
    close: (id: number) => ipcRenderer.send('doc:close', id),
    // File template: any file (its kind decided after, as for tie open).
    pick: (defaultPath: string | undefined): Promise<string | null> => ipcRenderer.invoke('doc:pick', defaultPath),
    onChange: (cb: (id: number, p: ({ rev: string } & DocBody) | { missing: true }) => void) => {
      ipcRenderer.on('doc:changed', (_e, id, p) => cb(id, p))
    },
  },
  // Browser tiles: main's reports about guests (by guest webContents id); downloads asked (the user
  // confirms in the UI) and allowed once.
  guest: {
    onUnresponsive: (cb: (id: number) => void) => {
      ipcRenderer.on('guest:unresponsive', (_e, id) => cb(id))
    },
    onDownload: (cb: (d: { guest: number; url: string; name: string; bytes: number }) => void) => {
      ipcRenderer.on('guest:download', (_e, d) => cb(d))
    },
    // A guest's popup (window.open, target=_blank): a link out, confirmed like any other.
    onPopup: (cb: (p: { guest: number; url: string }) => void) => {
      ipcRenderer.on('guest:popup', (_e, p) => cb(p))
    },
    download: (url: string, guest: number) => ipcRenderer.send('guest:download-ok', url, guest),
  },
  // Shortcuts are matched in main (before-input-event); actions arrive here. `suspend`: a text field
  // or modal has focus, its keys stay its own.
  keys: {
    onAction: (cb: (action: string) => void) => {
      ipcRenderer.on('keys:action', (_e, action) => cb(action))
    },
    suspend: (on: boolean) => ipcRenderer.send('keys:suspend', on),
  },
  log: (tag: string, ...args: unknown[]) => ipcRenderer.send('log', tag, ...args),
  pty: {
    spawn: (o: { cmd?: string; cwd?: string; cols: number; rows: number; env: Record<string, string> }): Promise<number | { error: string }> =>
      ipcRenderer.invoke('pty:spawn', o),
    write: (id: number, data: string) => ipcRenderer.send('pty:write', id, data),
    resize: (id: number, cols: number, rows: number) => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id: number) => ipcRenderer.send('pty:kill', id),
    cwd: (id: number): Promise<string | null> => ipcRenderer.invoke('pty:cwd', id),
    onData: (cb: DataCb) => {
      ipcRenderer.on('pty:data', (_e, id, d) => cb(id, d))
    },
    onExit: (cb: ExitCb) => {
      ipcRenderer.on('pty:exit', (_e, id, c) => cb(id, c))
    },
    onProcess: (cb: ProcCb) => {
      ipcRenderer.on('pty:process', (_e, id, n) => cb(id, n))
    },
    onCwd: (cb: (id: number, cwd: string) => void) => {
      ipcRenderer.on('pty:cwd', (_e, id, cwd) => cb(id, cwd))
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
