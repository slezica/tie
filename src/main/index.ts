import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron'
import { join } from 'node:path'
import { writeFileSync, rmSync } from 'node:fs'
import { instance, socketPath, infoPath, logPath, debugPort, debugTags, log } from './env'
import { initPty } from './pty'
import { startSocket } from './socket'

const dev = !app.isPackaged

// Per-instance user data, so instances don't share the single-instance lock.
app.setPath('userData', join(app.getPath('appData'), `tie-${instance}`))
if (dev) app.commandLine.appendSwitch('remote-debugging-port', String(debugPort))

if (!app.requestSingleInstanceLock()) {
  console.error(`tie: instance "${instance}" already running`)
  app.exit(1)
}

let win: BrowserWindow | null = null
let quitting = false
const pty = initPty(() => (win && !win.isDestroyed() ? win.webContents : null))
const binDir = join(app.getAppPath(), 'bin')

// Renderer RPC: socket calls forwarded to renderer, replies matched by id.
// Calls wait until the renderer has registered its driver.
let rendererReady: () => void
const ready = new Promise<void>((r) => (rendererReady = r))
ipcMain.on('renderer:ready', () => rendererReady())

let nextReq = 1
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
async function callRenderer(method: string, params: unknown): Promise<unknown> {
  await ready
  return new Promise((resolve, reject) => {
    if (!win) return reject(new Error('no window'))
    const reqId = nextReq++
    pending.set(reqId, { resolve, reject })
    win.webContents.send('rpc:request', reqId, method, params)
    setTimeout(() => {
      if (pending.delete(reqId)) reject(new Error(`timeout: ${method}`))
    }, 10_000)
  })
}
ipcMain.on('rpc:reply', (_e, reqId: number, error: string | null, result: unknown) => {
  const p = pending.get(reqId)
  if (!p) return
  pending.delete(reqId)
  if (error) p.reject(new Error(error))
  else p.resolve(result)
})

ipcMain.handle('pty:spawn', (_e, o) => {
  const env = { ...o.env, TIE_SOCKET: socketPath, TIE_INSTANCE: instance, PATH: `${binDir}:${process.env.PATH ?? ''}` }
  return pty.spawn({ ...o, env })
})
ipcMain.on('pty:write', (_e, id: number, data: string) => pty.write(id, data))
ipcMain.on('pty:resize', (_e, id: number, cols: number, rows: number) => pty.resize(id, cols, rows))
ipcMain.on('pty:kill', (_e, id: number) => pty.kill(id))
ipcMain.handle('app:info', () => ({ instance, socket: socketPath, home: app.getPath('home'), cwd: process.env.TIE_CWD || app.getPath('home'), debugTags }))
ipcMain.on('log', (_e, tag: string, ...args: unknown[]) => log(tag, ...args))

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay()
  win = new BrowserWindow({
    ...workArea,
    backgroundColor: '#000000',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 10 },
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
    },
  })
  // TIE_BACKGROUND=1 (harness instances): show without stealing focus.
  win.once('ready-to-show', () => (process.env.TIE_BACKGROUND ? win?.showInactive() : win?.show()))
  win.on('close', () => !quitting && app.quit())
  win.on('closed', () => (win = null))
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
}

function setMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: dev ? [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' }] : [{ role: 'togglefullscreen' }],
      },
      // No windowMenu: its cmd+w would close the single window.
    ]),
  )
}

app.whenReady().then(async () => {
  setMenu()
  createWindow()
  startSocket(socketPath, callRenderer)
  await ready
  writeFileSync(infoPath, JSON.stringify({ pid: process.pid, instance, socket: socketPath, debugPort: dev ? debugPort : null, log: logPath }))
  log('app', 'ready', { instance, socketPath, debugPort })
})

// Graceful quit: stop ptys and wait for their exit callbacks before Electron tears down.
app.on('before-quit', (e) => {
  if (quitting) return
  e.preventDefault()
  quitting = true
  rmSync(socketPath, { force: true })
  rmSync(infoPath, { force: true })
  // exit (not quit): skips a second quit cycle, ptys are already gone.
  pty.killAll().finally(() => app.exit(0))
})
process.on('SIGTERM', () => app.quit())
process.on('SIGINT', () => app.quit())
