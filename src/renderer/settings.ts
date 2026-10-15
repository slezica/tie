// Settings panel: modal with left nav, opened from app menu (cmd+,).
// Pages: Appearance (app-wide look) | Terminal (tile-kind specific).
import { tie } from './state'
import { refocus } from './ops'
import { THEMES, theme } from './themes'
import { applyAppearance, appearance, fontInstalled, monospaceFonts } from './appearance'

let panel: HTMLElement | null = null
let page = 'appearance'

export function initSettings() {
  tie.settings.onOpen(toggleSettings)
  document.addEventListener('tie:settings', toggleSettings) // harness hook (menu accelerators can't be driven)
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

let opening = false

export async function toggleSettings() {
  if (panel) return cancel()
  if (opening) return // a second request while the first awaits settings
  opening = true
  const { settings, defaults, path, error } = await tie.settings.get().finally(() => (opening = false))
  const saved = appearance()

  panel = document.createElement('div')
  panel.className = 'settings-backdrop'
  panel.innerHTML = `
    <div class="settings" role="dialog" aria-label="Settings">
      <nav>
        <button data-page="appearance">Appearance</button>
        <hr />
        <button data-page="terminal">Terminal</button>
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
          <div class="row">
            <div>
              <label for="set-tab-bar">Tab bar</label>
              <select id="set-tab-bar"><option value="top">Top</option><option value="bottom">Bottom</option></select>
            </div>
            <div>
              <label for="set-shelf-style">Shelf</label>
              <select id="set-shelf-style"><option value="normal">Normal</option><option value="compact">Compact</option></select>
            </div>
          </div>
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
        <section data-page="terminal">
          <h2>Terminal</h2>
          <label for="set-shell">Shell command</label>
          <input id="set-shell" spellcheck="false" />
          <p class="hint">Used for new terminals.</p>
          <h3>Paste</h3>
          <label class="check"><input id="set-warn-control" type="checkbox" /> Confirm control characters <span class="scope">pastes and drops</span></label>
          <label class="check"><input id="set-warn-run" type="checkbox" /> Confirm pastes that would run commands <span class="scope">newlines, program without bracketed paste</span></label>
        </section>
        <div class="actions">
          <span class="status" title="${esc(path)}">${esc(path)}</span>
          <button class="cancel">Cancel</button>
          <button class="save">Save</button>
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
  const tabBar = $<HTMLSelectElement>('#set-tab-bar')
  const shelfStyle = $<HTMLSelectElement>('#set-shelf-style')
  const fontSize = $<HTMLInputElement>('#set-font-size')
  const shell = $<HTMLInputElement>('#set-shell')
  const warnControl = $<HTMLInputElement>('#set-warn-control')
  const warnRun = $<HTMLInputElement>('#set-warn-run')
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
  tabBar.value = settings.tabBar
  shelfStyle.value = settings.shelfStyle
  fontSize.value = String(settings.fontSize)
  shell.value = settings.shell
  warnControl.checked = settings.warnPasteControl
  warnRun.checked = settings.warnPasteRun
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
    tabBar: tabBar.value as 'top' | 'bottom',
    shelfStyle: shelfStyle.value as 'normal' | 'compact',
    warnPasteControl: warnControl.checked,
    warnPasteRun: warnRun.checked,
  })
  const preview = () => {
    swatches()
    $('.warn').hidden = fontInstalled(font.value.trim())
    applyAppearance(draft())
    tie.settings.previewBorderless(borderless.checked)
  }
  themeSel.addEventListener('change', preview)
  tabBar.addEventListener('change', preview)
  shelfStyle.addEventListener('change', preview)
  for (const el of [lineHeight, font, fontSize, cellWidth, borderless]) el.addEventListener('input', preview)
  swatches()

  const show = (p: string) => {
    page = p
    panel!.querySelectorAll<HTMLElement>('[data-page]').forEach((el) => el.classList.toggle('current', el.dataset.page === p))
    ;(p === 'terminal' ? shell : themeSel).focus()
  }
  panel.querySelectorAll<HTMLElement>('nav button').forEach((b) => b.addEventListener('click', () => show(b.dataset.page!)))

  // Cancel restores the look that was active when the panel opened.
  ;(panel as any)._revert = () => {
    applyAppearance(saved)
    tie.settings.previewBorderless(!!saved.borderless)
  }

  // Bottom status line: settings file path, or problems blocking save.
  const status = $('.status')
  const fields: Record<string, HTMLElement> = { shell }
  const pageOf: Record<string, string> = { shell: 'terminal' }
  const clearErrors = () => {
    status.textContent = path
    status.classList.remove('error')
    for (const f of Object.values(fields)) f.classList.remove('invalid')
  }
  for (const f of Object.values(fields)) f.addEventListener('input', clearErrors)

  const showErrors = (errors: { field: string; message: string }[]) => {
    clearErrors()
    status.textContent = errors.map((e) => e.message).join(' · ')
    status.classList.add('error')
    for (const e of errors) fields[e.field]?.classList.add('invalid')
    const first = errors[0]?.field
    if (first && pageOf[first]) show(pageOf[first])
  }
  const save = async () => {
    const res = await tie.settings.set({ ...draft(), shell: shell.value.trim() })
    if (res.ok) return close()
    showErrors(res.errors)
  }
  $('.save').addEventListener('click', save)
  $('.cancel').addEventListener('click', cancel)
  panel.addEventListener('pointerdown', (e) => e.target === panel && cancel())
  panel.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') cancel()
    else if (e.key === 'Enter' && !(e.target instanceof HTMLSelectElement)) save()
  })
  show(page)
  if (error) showErrors([{ field: 'file', message: error }])
}

function cancel() {
  ;(panel as any)?._revert?.()
  close()
}

function close() {
  panel?.remove()
  panel = null
  refocus()
}
