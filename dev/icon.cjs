// Renders the placeholder app icon (build/icon.png, 1024x1024) with Electron itself.
// Run: ELECTRON_ENABLE_LOGGING=0 node_modules/.bin/electron dev/icon.cjs
const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="100" y="100" width="824" height="824" rx="180" fill="#22252c"/>
  <rect x="100" y="100" width="824" height="824" rx="180" fill="none" stroke="#3a3e47" stroke-width="6"/>
  <g fill="none" stroke="#686966" stroke-width="10">
    <rect x="200" y="230" width="330" height="560" rx="18"/>
    <rect x="560" y="230" width="264" height="265" rx="18"/>
    <rect x="560" y="525" width="264" height="265" rx="18"/>
  </g>
  <circle cx="240" cy="270" r="14" fill="#a6cdfa"/>
  <text x="235" y="420" font-family="Menlo, monospace" font-size="120" font-weight="700" fill="#dbded8">&gt;_</text>
  <circle cx="600" cy="565" r="14" fill="#f9eb77"/>
</svg>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:transparent">${svg}</body>`))
  await new Promise((r) => setTimeout(r, 300))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  writeFileSync(join(__dirname, '..', 'build', 'icon.png'), img.resize({ width: 1024, height: 1024 }).toPNG())
  app.quit()
})
