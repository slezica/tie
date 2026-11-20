// Settings panel: modal with left nav, opened from app menu (cmd+,).
// Pages: Appearance (app-wide look) | Bindings (keys: bindings.ts) | Terminal | Files (picker) | Security (socket callers, links out) | About (versions, paths; read-only).
import { S, tie } from './state'
import { refreshTitle } from './tile'
import type { Settings, SettingsInfo } from '../preload'
import { refocus } from './ops'
import { THEMES, theme } from './themes'
import { applyAppearance, appearance, fontInstalled, monospaceFonts } from './appearance'
import { applyPrefs } from './prefs'
import { bindingsPage } from './bindings'
import { tildePath } from './tabs'
import { choiceDialog, infoDialog } from './dialog'

let panel: HTMLElement | null = null
let page = 'appearance'
let banner: ((changed: boolean) => void) | null = null // the open panel's

export function initSettings() {
  tie.settings.onOpen(toggleSettings)
  document.addEventListener('tie:settings', toggleSettings) // harness hook (menu accelerators can't be driven)
  // The file changed on disk (main's watcher): only the open panel shows it; nothing is applied.
  tie.settings.onFile(({ changed }) => banner?.(changed))
}

// The UI's side of applying settings: after a Save, a Reload, a Recreate (main applies its own).
export function applySettings(s: Settings) {
  applyAppearance(s)
  applyPrefs(s)
  for (const t of S.tiles.values()) refreshTitle(t) // titles may depend on settings (terminalTitle)
}

// Startup: the file didn't load (Tie runs on defaults, the file untouched). Close (focused: Enter
// must not destroy a file) keeps it; Recreate backs it up to `.bak`, then writes defaults.
export async function settingsLoadDialog(info: SettingsInfo) {
  const e = info.loadError
  if (!e) return
  const para = (text: string, cls?: string) => {
    const p = document.createElement('p')
    p.textContent = text // path and parser message: file content, never markup
    if (cls) p.className = cls
    return p
  }
  const where = tildePath(info.path)
  const syntax = e.kind === 'syntax'
  const choice = await choiceDialog({
    cls: 'settings-load',
    title: 'Settings file',
    body: [para(syntax ? `Syntax errors in your settings file, at ${where}.` : `Can't read your settings file, at ${where}.`), para(e.message, 'reason')],
    choices: [
      { label: 'Close', value: 'close' as const },
      ...(syntax ? [{ label: 'Recreate with defaults', value: 'recreate' as const, secondary: true, title: `The file is first copied to ${tildePath(info.backup)}` }] : []),
    ],
  })
  if (choice !== 'recreate') return
  const r = await tie.settings.recreate()
  if (r.ok) applySettings(r.settings)
  else await infoDialog("Couldn't recreate the settings file", r.message)
}

// Inputs Enter is done with (settings panel keydown); checkboxes, buttons: not these.
const TEXT_INPUTS = new Set(['text', 'number', 'search', 'url', 'email', 'password', 'tel'])

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

let opening = false

export async function toggleSettings() {
  if (panel) return cancel()
  if (opening) return // a second request while the first awaits settings
  opening = true
  const info = await tie.settings.get().finally(() => (opening = false))
  if (!panel) build(info)
}

// About rows: values are Tie's own (versions, its paths); escaped anyway. Paths: `~` shown, full in the tooltip.
const aboutRows = (rows: [string, string][], paths = false) =>
  rows.map(([k, v]) => `<dt>${k}</dt><dd data-about="${k.toLowerCase()}"${paths ? ` title="${esc(v)}"` : ''}>${esc(paths ? tildePath(v) : v)}</dd>`).join('')

function build(info: SettingsInfo) {
  const { settings, defaults, path, error, about } = info
  const saved = appearance()

  panel = document.createElement('div')
  panel.className = 'settings-backdrop'
  panel.innerHTML = `
    <div class="settings" role="dialog" aria-label="Settings" tabindex="-1">
      <div class="settings-banner" role="alert" hidden>
        <div class="text"><p class="msg"></p><p class="reason" hidden></p></div>
        <button class="ignore">Ignore</button>
        <button class="reload">Reload</button>
      </div>
      <div class="settings-main">
      <nav>
        <button data-page="appearance">Appearance</button>
        <button data-page="bindings">Bindings</button>
        <hr />
        <button data-page="terminal">Terminal</button>
        <button data-page="files">Files</button>
        <button data-page="security">Security</button>
        <hr />
        <button data-page="about">About</button>
      </nav>
      <div class="pages">
        <section data-page="appearance">
          <h2>Appearance</h2>
          <h3>Colors</h3>
          <label for="set-theme">Theme</label>
          <select id="set-theme">
            ${Object.entries(THEMES).map(([id, t]) => `<option value="${id}">${esc(t.label)}</option>`).join('')}
          </select>
          <div class="swatches"></div>
          <h3>Window</h3>
          <label class="check"><input id="set-borderless" type="checkbox" /> Borderless <span class="scope">no window controls, square corners</span></label>
          <p class="hint">Corners change on next launch.</p>
          <h3>Text <span class="scope">inside tiles</span></h3>
          <label for="set-font">Font</label>
          <select id="set-font"></select>
          <p class="hint warn" hidden>Font not installed, using fallback.</p>
          <div class="row">
            <div>
              <label for="set-font-size">Size</label>
              <input id="set-font-size" type="number" min="8" max="32" step="1" />
            </div>
            <div>
              <label for="set-line-height">Line height</label>
              <input id="set-line-height" type="number" min="1" max="2" step="0.05" />
            </div>
            <div>
              <label for="set-cell-width">Char width %</label>
              <input id="set-cell-width" type="number" min="70" max="150" step="1" />
            </div>
          </div>
        </section>
        <section data-page="bindings"></section>
        <section data-page="terminal">
          <h2>Terminal</h2>
          <label for="set-shell">Shell command</label>
          <input id="set-shell" spellcheck="false" />
          <p class="hint">Used for new terminals.</p>
          <label for="set-terminal-title">Terminal title</label>
          <select id="set-terminal-title">
            <option value="auto">Automatic</option>
            <option value="command">Command</option>
            <option value="directory">Directory</option>
          </select>
          <p class="hint">Automatic: the title the program sets, else the command.</p>
          <h3>Paste</h3>
          <label class="check"><input id="set-warn-control" type="checkbox" /> Confirm control characters <span class="scope">pastes and drops</span></label>
          <label class="check"><input id="set-warn-run" type="checkbox" /> Confirm pastes that would run commands <span class="scope">newlines, program without bracketed paste</span></label>
        </section>
        <section data-page="files">
          <h2>Files</h2>
          <h3>Picker</h3>
          <label class="check"><input id="set-gitignore" type="checkbox" /> Respect .gitignore <span class="scope">skip what git ignores when listing files</span></label>
        </section>
        <section data-page="security">
          <h2>Security</h2>
          <h3>Control</h3>
          <label class="check"><input id="set-allow-external" type="checkbox" /> Allow external programs to control Tie <span class="scope">processes not started in a Tie terminal: scripts, other apps</span></label>
          <h3>Links</h3>
          <label class="check"><input id="set-confirm-external" type="checkbox" /> Confirm before opening links in the browser <span class="scope">files, html pages, terminals</span></label>
        </section>
        <section data-page="about" tabindex="-1">
          <h2>About</h2>
          <h3>Versions</h3>
          <dl class="about">${aboutRows([['Tie', about.version], ['Instance', about.instance], ['Electron', about.electron], ['Chromium', about.chrome], ['Node', about.node]])}</dl>
          <h3>Files</h3>
          <dl class="about">${aboutRows([['Settings', path], ['Log', about.log]], true)}</dl>
        </section>
        <div class="actions">
          <span class="status" title="${esc(path)}">${esc(tildePath(path))}</span>
          <button class="cancel">Cancel</button>
          <button class="save">Save</button>
        </div>
      </div>
      </div>
    </div>`
  document.body.appendChild(panel)

  const $ = <T extends HTMLElement>(sel: string) => panel!.querySelector(sel) as T
  const themeSel = $<HTMLSelectElement>('#set-theme')
  const lineHeight = $<HTMLInputElement>('#set-line-height')
  const font = $<HTMLSelectElement>('#set-font')
  const cellWidth = $<HTMLInputElement>('#set-cell-width')
  const borderless = $<HTMLInputElement>('#set-borderless')
  const fontSize = $<HTMLInputElement>('#set-font-size')
  const shell = $<HTMLInputElement>('#set-shell')
  const terminalTitle = $<HTMLSelectElement>('#set-terminal-title')
  const warnControl = $<HTMLInputElement>('#set-warn-control')
  const warnRun = $<HTMLInputElement>('#set-warn-run')
  const confirmExternal = $<HTMLInputElement>('#set-confirm-external')
  const allowExternal = $<HTMLInputElement>('#set-allow-external')
  const gitignore = $<HTMLInputElement>('#set-gitignore')
  let refreshSave = () => {} // set below, once the fields exist
  const bindings = bindingsPage($('section[data-page="bindings"]'), settings.bindings, {
    change: () => refreshSave(),
    message: (text) => (text ? showErrors([{ field: 'bindings', message: text }]) : clearErrors()),
  })
  themeSel.value = theme(settings.theme) === THEMES[settings.theme] ? settings.theme : 'tie-dark'
  lineHeight.value = String(settings.lineHeight)
  // Font list arrives async (system font query can be slow); fields never wait on it.
  const fillFonts = (fonts: string[]) => {
    const selected = font.value || settings.fontFamily
    const list = selected && !fonts.includes(selected) ? [selected, ...fonts] : fonts
    font.innerHTML =
      `<option value="">Default monospace</option>` + list.map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join('')
    font.value = selected
  }
  fillFonts([])
  monospaceFonts().then((fonts) => panel && fillFonts(fonts))
  cellWidth.value = String(settings.cellWidth)
  borderless.checked = settings.borderless
  fontSize.value = String(settings.fontSize)
  shell.value = settings.shell
  terminalTitle.value = settings.terminalTitle
  warnControl.checked = settings.warnPasteControl
  warnRun.checked = settings.warnPasteRun
  confirmExternal.checked = settings.confirmExternal
  allowExternal.checked = settings.allowExternalControl
  gitignore.checked = settings.gitignore
  shell.placeholder = defaults.shell

  const swatches = () => {
    $('.swatches').innerHTML = theme(themeSel.value)
      .palette.ansi.map((c) => `<span style="background:${c}"></span>`)
      .join('')
  }
  const draft = () => ({
    theme: themeSel.value,
    lineHeight: Math.min(2, Math.max(1, Number(lineHeight.value) || 1.15)),
    fontFamily: font.value.trim(),
    fontSize: Math.min(32, Math.max(8, Number(fontSize.value) || 12)),
    cellWidth: Math.min(150, Math.max(70, Number(cellWidth.value) || 100)),
    borderless: borderless.checked,
    terminalTitle: terminalTitle.value as Settings['terminalTitle'],
    warnPasteControl: warnControl.checked,
    warnPasteRun: warnRun.checked,
    confirmExternal: confirmExternal.checked,
    allowExternalControl: allowExternal.checked,
    gitignore: gitignore.checked,
  })
  const preview = () => {
    swatches()
    $('.warn').hidden = fontInstalled(font.value.trim())
    applyAppearance({ ...saved, ...draft() }) // the layout (bars) stays the active one: file-only for now
    tie.settings.previewBorderless(borderless.checked)
  }
  themeSel.addEventListener('change', preview)
  for (const el of [lineHeight, font, fontSize, cellWidth, borderless]) el.addEventListener('input', preview)
  swatches()

  const show = (p: string) => {
    page = p
    panel!.querySelectorAll<HTMLElement>('[data-page]').forEach((el) => el.classList.toggle('current', el.dataset.page === p))
    if (p === 'bindings') return bindings.focus()
    if (p === 'about') return $('section[data-page="about"]').focus() // nothing to edit: keys stay in the panel
    ;(p === 'terminal' ? shell : p === 'files' ? gitignore : p === 'security' ? allowExternal : themeSel).focus()
  }
  panel.querySelectorAll<HTMLElement>('nav button').forEach((b) => b.addEventListener('click', () => show(b.dataset.page!)))

  // Cancel restores the look that was active when the panel opened.
  ;(panel as any)._revert = () => {
    applyAppearance(saved)
    tie.settings.previewBorderless(!!saved.borderless)
  }

  // Bottom status line: settings file path, or problems blocking save.
  const status = $('.status')
  const fields: Record<string, HTMLElement> = { shell, terminalTitle, bindings: $('.bind-table') }
  const pageOf: Record<string, string> = { shell: 'terminal', terminalTitle: 'terminal', bindings: 'bindings' }
  const clearErrors = () => {
    status.textContent = tildePath(path)
    status.classList.remove('error')
    for (const f of Object.values(fields)) f.classList.remove('invalid')
  }
  for (const f of Object.values(fields)) f.addEventListener('input', clearErrors)

  const showErrors = (errors: { field: string; message: string }[]) => {
    clearErrors()
    status.textContent = errors.map((e) => e.message.replaceAll(path, tildePath(path))).join(' · ') // main's messages name the full path
    status.classList.add('error')
    for (const e of errors) fields[e.field]?.classList.add('invalid')
    const first = errors[0]?.field
    if (first && pageOf[first]) show(pageOf[first])
  }
  const patch = () => ({ ...draft(), shell: shell.value.trim(), bindings: bindings.value() })
  const save = async () => {
    const res = await tie.settings.set(patch())
    if (res.ok) {
      applySettings(res.settings)
      return close()
    }
    showErrors(res.errors)
  }
  $('.save').addEventListener('click', save)

  // Changed on disk since loaded (SETTINGS.md "File"): banner on every page, Save disabled until
  // Ignore (keep the panel's values; a Save overwrites the file) or Reload (adopt the file).
  const saveBtn = $<HTMLButtonElement>('.save')
  const bar = $('.settings-banner')
  const reason = $('.settings-banner .reason')
  $('.settings-banner .msg').textContent = `Settings changed in ${tildePath(path)}` // path: textContent
  banner = (changed) => {
    if (!changed && bar.contains(document.activeElement)) show(page) // focus stays in the panel
    bar.hidden = !changed
    refreshSave()
    if (!changed) reason.hidden = true
  }
  // Save is enabled only with something to save: a value that differs from the active settings
  // (edited and put back: disabled again), or after Ignore (the file differs; Save overwrites it).
  let overwrite = false
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const dirty = () => {
    const { bindings: b, ...rest } = patch()
    const keys = (o: Settings['bindings']) => Object.entries(o).sort(([x], [y]) => x.localeCompare(y))
    return !same(keys(b), keys(settings.bindings)) || Object.entries(rest).some(([k, v]) => !same(v, settings[k as keyof Settings]))
  }
  refreshSave = () => (saveBtn.disabled = !bar.hidden || !(overwrite || dirty()))
  for (const ev of ['input', 'change']) panel.addEventListener(ev, () => refreshSave())
  banner(info.changed)
  $('.settings-banner .ignore').addEventListener('click', async () => {
    const now = await tie.settings.ignore()
    if (!panel) return
    overwrite = true
    banner?.(false)
    if (!now.error) clearErrors() // a load error (unparseable at startup) is lifted too
  })
  $('.settings-banner .reload').addEventListener('click', async () => {
    const r = await tie.settings.reload()
    if (!panel) return
    if (!r.ok) {
      reason.textContent = r.message // parser message: textContent
      reason.hidden = false
      return
    }
    // Applied as after a Save; the panel shows the file's values (unsaved edits dropped).
    applySettings(r.settings)
    const info = await tie.settings.get()
    if (!panel) return
    remove()
    build(info)
  })
  $('.cancel').addEventListener('click', cancel)
  panel.addEventListener('pointerdown', (e) => e.target === panel && cancel())
  panel.addEventListener('keydown', (e) => {
    e.stopPropagation()
    // Enter never saves: only the Save button does (Enter on a focused button presses that button).
    if (e.key === 'Escape') return cancel()
    // Enter in a text / number field or a select: done with it ("I set the value"). Focus goes to
    // the panel itself, which keeps its keys (Escape) and suspends shortcuts. Capture fields: their own.
    const t = e.target as HTMLElement
    const field = t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && TEXT_INPUTS.has(t.type) && !t.classList.contains('capture-field'))
    if (e.key === 'Enter' && !e.isComposing && field) {
      e.preventDefault()
      $('.settings').focus()
    }
  })
  show(page)
  if (error) showErrors([{ field: 'file', message: error }])
}

function cancel() {
  ;(panel as any)?._revert?.()
  close()
}

function remove() {
  panel?.remove()
  panel = null
  banner = null
}

function close() {
  remove()
  refocus()
}
