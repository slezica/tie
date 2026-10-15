import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFileSync, rmSync } from 'node:fs'
import { instance, socketPath, infoPath, logPath, debugPort, debugTags, log } from './env'
import { initPty } from './pty'
import { startSocket } from './socket'
import { harden, setShellUrl, openExternal } from './security'
import { getSettings, setSettings, defaultShell, settingsPath, validateSettings, settingsFileError } from './settings'

const dev = !app.isPackaged
app.setName('Tie')
// TIE_BACKGROUND=1 (harness instances): offscreen rendering, no visible window, no dock icon,
// never takes focus. Driven entirely over the debugging port.
const background = !!process.env.TIE_BACKGROUND

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
// Put on PATH in Tie terminals: the repo's bin/ in dev; Tie.app/Contents/Resources/bin when installed.
const binDir = app.isPackaged ? join(process.resourcesPath, 'bin') : join(app.getAppPath(), 'bin')

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
ipcMain.handle('pty:cwd', (_e, id: number) => pty.cwd(id))
ipcMain.handle('app:info', () => ({ instance, socket: socketPath, home: app.getPath('home'), cwd: process.env.TIE_CWD || app.getPath('home'), debugTags }))
ipcMain.handle('settings:get', () => ({ settings: getSettings(), defaults: { shell: defaultShell() }, path: settingsPath, error: settingsFileError() }))
ipcMain.handle('settings:set', (_e, patch) => {
  const fileError = settingsFileError()
  const errors = fileError ? [{ field: 'file', message: fileError }] : validateSettings(patch)
  if (errors.length) return { ok: false, errors }
  const settings = setSettings(patch)
  applyWindowSettings()
  return { ok: true, settings }
})
ipcMain.on('app:quit', () => app.quit())
ipcMain.on('external:open', (_e, url: unknown) => openExternal(url))
ipcMain.on('log', (_e, tag: string, ...args: unknown[]) => log(tag, ...args))

// Borderless: hide the traffic lights (title bar is already hidden; the top bar stays draggable).
function applyWindowSettings() {
  if (process.platform === 'darwin' && win && !win.isDestroyed()) win.setWindowButtonVisibility(!getSettings().borderless)
}
ipcMain.on('window:borderless-preview', (_e, on: boolean) => {
  if (process.platform === 'darwin') win?.setWindowButtonVisibility(!on)
})

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay()
  // Borderless at creation: frameless with square corners (macOS only allows that when frameless,
  // and only at creation). Toggling later hides the traffic lights live; corners follow on restart.
  const frame = getSettings().borderless
    ? { frame: false, roundedCorners: false }
    : { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 12, y: 10 } }
  win = new BrowserWindow({
    ...workArea,
    ...frame,
    backgroundColor: '#1b1e23', // ≈ Tie Dark app background, avoids a flash at startup
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      // Harness: TIE_SCALE sets the offscreen device scale (default 1x; real Macs are 2x).
      offscreen: background ? { deviceScaleFactor: Number(process.env.TIE_SCALE) || 1 } : false,
      backgroundThrottling: !background,
    },
  })
  // A (re)load (e.g. dev HMR) starts a fresh UI with no tiles: drop the old ptys.
  // SECURITY: on commit (`did-navigate`), not `did-start-loading`: the latter also fires for
  // navigations the guards then block, so hostile content could kill every terminal.
  win.webContents.on('did-navigate', () => {
    if (pty.count()) {
      log('pty', 'page reload, killing', pty.count())
      pty.killAll()
    }
  })
  applyWindowSettings()
  win.once('ready-to-show', () => !background && win?.show())
  win.on('close', () => !quitting && app.quit())
  win.on('closed', () => (win = null))
  if (process.env.ELECTRON_RENDERER_URL) {
    setShellUrl(process.env.ELECTRON_RENDERER_URL)
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    const file = join(import.meta.dirname, '../renderer/index.html')
    setShellUrl(pathToFileURL(file).href)
    win.loadFile(file)
  }
}

function setMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        role: 'appMenu',
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => win?.webContents.send('settings:open') },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          // ⌘Q shown but not registered: the UI handles it (hold-to-quit while tiles are open).
          { label: 'Quit Tie', accelerator: 'CmdOrCtrl+Q', registerAccelerator: false, click: () => app.quit() },
        ],
      },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: dev ? [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' }] : [{ role: 'togglefullscreen' }],
      },
      // No windowMenu: its cmd+w would close the single window.
    ]),
  )
}

harden()

app.whenReady().then(async () => {
  if (background && process.platform === 'darwin') app.setActivationPolicy('accessory')
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
