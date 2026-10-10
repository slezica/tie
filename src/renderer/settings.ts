// Settings panel: modal, opened from app menu (cmd+,).
import { S, tie } from './state'

let panel: HTMLElement | null = null

export function initSettings() {
  tie.settings.onOpen(toggleSettings)
  document.addEventListener('tie:settings', toggleSettings) // harness hook (menu accelerators can't be driven)
}

function close() {
  panel?.remove()
  panel = null
  const t = S.active ? S.tiles.get(S.active) : null
  t?.term.focus()
}

export async function toggleSettings() {
  if (panel) return close()
  const { settings, defaults, path } = await tie.settings.get()
  panel = document.createElement('div')
  panel.className = 'settings-backdrop'
  panel.innerHTML = `
    <div class="settings" role="dialog" aria-label="Settings">
      <h2>Settings</h2>
      <label for="set-shell">Shell command</label>
      <input id="set-shell" spellcheck="false" />
      <p class="hint">Used for new terminals. Empty uses the default: <code></code></p>
      <div class="actions">
        <span class="path"></span>
        <button class="cancel">Cancel</button>
        <button class="save">Save</button>
      </div>
    </div>`
  document.body.appendChild(panel)
  const input = panel.querySelector('#set-shell') as HTMLInputElement
  input.value = settings.shell
  input.placeholder = defaults.shell
  panel.querySelector('.hint code')!.textContent = defaults.shell
  panel.querySelector('.path')!.textContent = path

  const save = async () => {
    await tie.settings.set({ shell: input.value.trim() })
    close()
  }
  panel.querySelector('.save')!.addEventListener('click', save)
  panel.querySelector('.cancel')!.addEventListener('click', close)
  panel.addEventListener('pointerdown', (e) => e.target === panel && close())
  panel.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
    else if (e.key === 'Enter') save()
  })
  input.focus()
  input.select()
}
