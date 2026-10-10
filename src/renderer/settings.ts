// Settings panel: modal with left nav, opened from app menu (cmd+,).
// Pages: Appearance (app-wide look) | Terminal (tile-kind specific).
import { S, tie } from './state'
import { THEMES, theme } from './themes'
import { applyAppearance, appearance } from './appearance'

let panel: HTMLElement | null = null
let page = 'appearance'

export function initSettings() {
  tie.settings.onOpen(toggleSettings)
  document.addEventListener('tie:settings', toggleSettings) // harness hook (menu accelerators can't be driven)
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

export async function toggleSettings() {
  if (panel) return cancel()
  const { settings, defaults, path } = await tie.settings.get()
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
          <h3>Text</h3>
          <label for="set-line-height">Line height</label>
          <input id="set-line-height" type="number" min="1" max="2" step="0.05" />
          <p class="hint">Inside tiles.</p>
        </section>
        <section data-page="terminal">
          <h2>Terminal</h2>
          <label for="set-shell">Shell command</label>
          <input id="set-shell" spellcheck="false" />
          <p class="hint">Used for new terminals.</p>
        </section>
        <div class="actions">
          <span class="path">${esc(path)}</span>
          <button class="cancel">Cancel</button>
          <button class="save">Save</button>
        </div>
      </div>
    </div>`
  document.body.appendChild(panel)

  const $ = <T extends HTMLElement>(sel: string) => panel!.querySelector(sel) as T
  const themeSel = $<HTMLSelectElement>('#set-theme')
  const lineHeight = $<HTMLInputElement>('#set-line-height')
  const shell = $<HTMLInputElement>('#set-shell')
  themeSel.value = theme(settings.theme) === THEMES[settings.theme] ? settings.theme : 'tie-dark'
  lineHeight.value = String(settings.lineHeight)
  shell.value = settings.shell
  shell.placeholder = defaults.shell

  const swatches = () => {
    $('.swatches').innerHTML = theme(themeSel.value)
      .palette.ansi.map((c) => `<span style="background:${c}"></span>`)
      .join('')
  }
  const draft = () => ({ theme: themeSel.value, lineHeight: Math.min(2, Math.max(1, Number(lineHeight.value) || 1.15)) })
  const preview = () => {
    swatches()
    applyAppearance(draft())
  }
  themeSel.addEventListener('change', preview)
  lineHeight.addEventListener('input', preview)
  swatches()

  const show = (p: string) => {
    page = p
    panel!.querySelectorAll<HTMLElement>('[data-page]').forEach((el) => el.classList.toggle('current', el.dataset.page === p))
    ;(p === 'terminal' ? shell : themeSel).focus()
  }
  panel.querySelectorAll<HTMLElement>('nav button').forEach((b) => b.addEventListener('click', () => show(b.dataset.page!)))

  // Cancel restores the look that was active when the panel opened.
  ;(panel as any)._revert = () => applyAppearance(saved)

  const save = async () => {
    await tie.settings.set({ ...draft(), shell: shell.value.trim() })
    close()
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
}

function cancel() {
  ;(panel as any)?._revert?.()
  close()
}

function close() {
  panel?.remove()
  panel = null
  const t = S.active ? S.tiles.get(S.active) : null
  t?.term.focus()
}
