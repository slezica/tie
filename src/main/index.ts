import { app, BrowserWindow, Menu, screen, session } from 'electron'
import { join } from 'node:path'
import { writeFileSync, rmSync } from 'node:fs'
import { instance, socketPath, infoPath, logPath, debugPort, debugTags, log, PRIVATE } from './env'
import { initPty } from './pty'
import { startSocket } from './socket'
import { harden, setShellUrl, openExternal, shellIpc, serveShell, SHELL_URL, SHELL_PARTITION, noNetwork, noWebRtcUdp } from './security'
import { initKeys, setKeysSuspended } from './keys'
import { openContent, closeContent, killContent, clearContent, serveContent, initContent } from './content'
import { fileViewer, openDoc, closeDoc, clearDocs, pickFile, setNextPick, type DocPush } from './docs'
import { initBrowserSession, noDownloads, guestMethod } from './guest'
import { getSettings, setSettings, defaultShell, settingsPath, validateSettings, settingsFileError } from './settings'

const dev = !app.isPackaged
app.setName('Tie')
// TIE_BACKGROUND=1 (harness instances): offscreen rendering, no visible window, no dock icon,
// never takes focus. Driven entirely over the debugging port.
// TIE_BACKGROUND=hidden: a real (not offscreen) window that is never shown. Input routes like a
// visible window (into content frames), which offscreen rendering doesn't do.
const background = !!process.env.TIE_BACKGROUND
const offscreen = background && process.env.TIE_BACKGROUND !== 'hidden'

// Per-instance user data, so instances don't share the single-instance lock.
app.setPath('userData', join(app.getPath('appData'), `tie-${instance}`))
if (dev) app.commandLine.appendSwitch('remote-debugging-port', String(debugPort))
// SECURITY: a cross-origin iframe may call window.focus() / el.focus() and take the focus (and the
// keyboard) at any time. Blink can refuse focus from a frame without transient user activation when
// the frame's permissions policy disallows `focus-without-user-activation` (content iframes:
// frame.ts `allow`); the check is behind this runtime feature.
app.commandLine.appendSwitch('enable-blink-features', 'BlockingFocusWithoutUserActivation')

if (!app.requestSingleInstanceLock()) {
  console.error(`tie: instance "${instance}" already running`)
  app.exit(1)
}

let win: BrowserWindow | null = null
const ipc = shellIpc(() => win)
let quitting = false
const pty = initPty(() => (win && !win.isDestroyed() ? win.webContents : null))
// Put on PATH in Tie terminals: the repo's bin/ in dev; Tie.app/Contents/Resources/bin when installed.
const binDir = app.isPackaged ? join(process.resourcesPath, 'bin') : join(app.getAppPath(), 'bin')

// Renderer RPC: socket calls forwarded to renderer, replies matched by id.
// Calls wait until the renderer has registered its driver.
let rendererReady: () => void
const ready = new Promise<void>((r) => (rendererReady = r))
ipc.on('renderer:ready', () => rendererReady())

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
ipc.on('rpc:reply', (_e, reqId: number, error: string | null, result: unknown) => {
  const p = pending.get(reqId)
  if (!p) return
  pending.delete(reqId)
  if (error) p.reject(new Error(error))
  else p.resolve(result)
})

ipc.handle('pty:spawn', (_e, o) => {
  const env = { ...o.env, TIE_SOCKET: socketPath, TIE_INSTANCE: instance, PATH: `${binDir}:${process.env.PATH ?? ''}` }
  return pty.spawn({ ...o, env })
})
ipc.on('pty:write', (_e, id: number, data: string) => pty.write(id, data))
ipc.on('pty:resize', (_e, id: number, cols: number, rows: number) => pty.resize(id, cols, rows))
ipc.on('pty:kill', (_e, id: number) => pty.kill(id))
ipc.handle('pty:cwd', (_e, id: number) => pty.cwd(id))
ipc.handle('app:info', () => ({ instance, socket: socketPath, home: app.getPath('home'), cwd: process.env.TIE_CWD || app.getPath('home'), debugTags, dev }))
ipc.handle('settings:get', () => ({ settings: getSettings(), defaults: { shell: defaultShell() }, path: settingsPath, error: settingsFileError() }))
ipc.handle('settings:set', (_e, patch) => {
  const fileError = settingsFileError()
  const errors = fileError ? [{ field: 'file', message: fileError }] : validateSettings(patch)
  if (errors.length) return { ok: false, errors }
  const settings = setSettings(patch)
  applyWindowSettings()
  return { ok: true, settings }
})
ipc.handle('content:open', (_e, root: unknown, kind: unknown, page: unknown, scripts: unknown) => openContent(root, kind, page, scripts === true))
ipc.on('content:close', (_e, token: unknown) => closeContent(token))
ipc.on('content:kill', (_e, token: unknown) => killContent(token, win?.webContents.mainFrame ?? null))
const pushDoc = (id: number, p: DocPush) => win?.webContents.send('doc:changed', id, p)
ipc.handle('doc:viewer', (_e, path: unknown, kind: unknown) => fileViewer(path, kind ?? undefined))
ipc.handle('doc:open', (_e, path: unknown, kind: unknown) => openDoc(path, kind, pushDoc))
ipc.on('doc:close', (_e, id: unknown) => closeDoc(id))
ipc.handle('doc:pick', (_e, defaultPath: unknown) => pickFile(win, defaultPath))
ipc.on('keys:suspend', (_e, on: unknown) => setKeysSuspended(on))
ipc.on('app:quit', () => app.quit())
ipc.on('external:open', (_e, url: unknown) => openExternal(url))
ipc.on('log', (_e, tag: string, ...args: unknown[]) => log(tag, ...args))

// Borderless: hide the traffic lights (title bar is already hidden; the top bar stays draggable).
function applyWindowSettings() {
  if (process.platform === 'darwin' && win && !win.isDestroyed()) win.setWindowButtonVisibility(!getSettings().borderless)
}
ipc.on('window:borderless-preview', (_e, on: boolean) => {
  if (process.platform === 'darwin') win?.setWindowButtonVisibility(!on)
})

function createWindow(ses: Electron.Session) {
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
      session: ses, // in-memory (security.ts SHELL_PARTITION): content storage never on disk
      sandbox: true,
      contextIsolation: true,
      // Harness: TIE_SCALE sets the offscreen device scale (default 1x; real Macs are 2x).
      offscreen: offscreen ? { deviceScaleFactor: Number(process.env.TIE_SCALE) || 1 } : false,
      backgroundThrottling: !background,
      webviewTag: true, // browser tiles: guests attach only through attachGuest (guest.ts)
    },
  })
  // A (re)load (e.g. dev HMR) starts a fresh UI with no tiles: drop the old ptys and content tokens.
  // SECURITY: on commit (`did-navigate`), not `did-start-loading`: the latter also fires for
  // navigations the guards then block, so hostile content could kill every terminal.
  win.webContents.on('did-navigate', () => {
    clearContent()
    clearDocs()
    if (pty.count()) {
      log('pty', 'page reload, killing', pty.count())
      pty.killAll()
    }
  })
  noWebRtcUdp(win.webContents)
  initKeys(win, (action) => win?.webContents.send('keys:action', action))
  initContent(win.webContents, (channel, ...args) => win?.webContents.send(channel, ...args))
  applyWindowSettings()
  win.once('ready-to-show', () => !background && win?.show())
  win.on('close', () => !quitting && app.quit())
  win.on('closed', () => (win = null))
  if (process.env.ELECTRON_RENDERER_URL) {
    setShellUrl(process.env.ELECTRON_RENDERER_URL)
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    setShellUrl(SHELL_URL)
    win.loadURL(SHELL_URL)
  }
}

// Dev builds only, answered by main (harness): `frames` (tie-dev frames), `input`: a key or mouse
// event through webContents.sendInputEvent. Unlike CDP input, it passes before-input-event like
// real keys (shortcuts live there). `pick {path}`: the next file picker's answer in harness
// instances (null = cancel; docs.ts). `guest {action}`: browser guests (guest.ts).
const devMethods: Record<string, (params: unknown) => unknown> = {
  frames: () => frameTree(),
  input: (params) => win?.webContents.sendInputEvent(params as Electron.KeyboardInputEvent),
  pick: (params) => setNextPick((params as { path?: unknown } | null)?.path),
  guest: (params) => guestMethod(params, shellSession), // browser guests (guest.ts)
}
let shellSession: Electron.Session | null = null

// The window's frame tree; content frames should be out-of-process.
function frameTree() {
  const top = win?.webContents.mainFrame
  if (!top) return []
  return top.framesInSubtree.map((f) => ({ url: f.url, origin: f.origin, pid: f.osProcessId, outOfProcess: f.osProcessId !== top.osProcessId, depth: depth(f) }))
}
const depth = (f: Electron.WebFrameMain): number => (f.parent ? 1 + depth(f.parent) : 0)

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
  const ses = session.fromPartition(SHELL_PARTITION)
  serveShell(ses, join(import.meta.dirname, '../renderer'))
  serveContent(ses)
  await noNetwork(ses, dev ? process.env.ELECTRON_RENDERER_URL : undefined)
  noDownloads(ses)
  shellSession = ses
  initBrowserSession()
  createWindow(ses)
  startSocket(socketPath, (method, params) => (dev && method in devMethods ? Promise.resolve(devMethods[method](params)) : callRenderer(method, params)))
  await ready
  writeFileSync(infoPath, JSON.stringify({ pid: process.pid, instance, socket: socketPath, debugPort: dev ? debugPort : null, log: logPath }), { mode: PRIVATE })
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
