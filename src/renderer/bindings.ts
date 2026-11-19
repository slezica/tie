// Settings → Bindings page: filter row (name, key, only customized, clear) and the actions table
// (binding edit in a capture field, back to default). Edits a draft only: the panel saves it whole
// (`bindings`) or drops it. docs/SETTINGS.md "Bindings page".
import { ACTIONS, chordsOf, conflicts, validBinding, type Action, type ActionSpec, type Bindings } from '@core/keymap'
import { captureField } from './capture'
import { confirmDialog } from './dialog'
import { ICON } from './icons'

export interface BindingsPage {
  value(): Bindings // the draft (sparse overrides)
  focus(): void
}

const SPECS = new Map(ACTIONS.map((a) => [a.id, a]))
const p = (text: string) => {
  const el = document.createElement('p')
  el.textContent = text
  return el
}

// `change`: the draft may have changed (the panel's Save state). `message`: a refused edit (null clears it), shown by the panel's status line.
export function bindingsPage(section: HTMLElement, initial: Bindings, on: { message(text: string | null): void; change?(): void }): BindingsPage {
  const draft: Bindings = { ...initial }
  const custom = (a: Action) => Object.hasOwn(draft, a)
  // One chord per action in the table: the override, else the default (hidden aliases not shown).
  const shown = (a: Action) => chordsOf(a, draft)[0] ?? ''

  section.innerHTML = `
    <h2>Bindings</h2>
    <div class="bind-filters">
      <input id="bind-name" placeholder="Search by name" spellcheck="false" />
      <input id="bind-key" placeholder="Search by key" />
      <button class="bind-btn bind-custom" title="Only customized" aria-pressed="false">${ICON.edit}</button>
      <button class="bind-btn bind-clear" title="Clear filters">${ICON.close}</button>
    </div>
    <div class="bind-table">
      <div class="bind-head"><span>Action</span><span>Binding</span><span></span></div>
      <div class="bind-rows"></div>
    </div>`
  const $ = <T extends HTMLElement>(sel: string) => section.querySelector(sel) as T
  const name = $<HTMLInputElement>('#bind-name')
  const key = $<HTMLInputElement>('#bind-key')
  const onlyCustom = $<HTMLButtonElement>('.bind-custom')
  const table = $('.bind-table')
  const list = $('.bind-rows')

  const rows = new Map<Action, HTMLElement>()
  for (const a of ACTIONS) {
    const row = document.createElement('div')
    row.className = 'bind-row'
    row.dataset.action = a.id
    row.innerHTML = `<span class="label"></span><span class="cell"><span class="chord"></span></span><span class="bind-btns"><button class="bind-btn edit" title="Edit">${ICON.edit}</button><button class="bind-btn reset" title="Back to default">${ICON.close}</button></span>`
    row.querySelector('.label')!.textContent = a.label
    row.querySelector('.edit')!.addEventListener('click', () => edit(a.id))
    row.querySelector('.reset')!.addEventListener('click', () => {
      on.message(null)
      void commit(a)
    })
    rows.set(a.id, row)
    list.append(row)
  }

  const paint = (a: Action) => {
    const row = rows.get(a)!
    const c = shown(a)
    const chordEl = row.querySelector('.chord') as HTMLElement
    chordEl.textContent = c || '—'
    chordEl.classList.toggle('unbound', !c)
    row.classList.toggle('custom', custom(a))
    ;(row.querySelector('.reset') as HTMLButtonElement).disabled = !custom(a)
  }

  // Binding column: widest text over all rows (defaults and current, bold), never the filtered
  // ones, so filtering never moves it. Re-measured only when a binding changes.
  const measure = () => {
    const probe = document.createElement('span')
    probe.className = 'chord bind-measure'
    section.closest('.settings')!.append(probe) // the page may be hidden (display: none)
    let w = 0
    for (const t of new Set([...ACTIONS.map((a) => a.chord), ...ACTIONS.map((a) => shown(a.id))])) {
      probe.textContent = t
      w = Math.max(w, probe.getBoundingClientRect().width)
    }
    probe.remove()
    table.style.setProperty('--bind-w', `${Math.ceil(w) + 12}px`)
  }

  // Name: case-insensitive substring of the label. Key: exact chord, any the action answers to
  // (hidden default aliases included: `Cmd++` finds Zoom in). Only customized: present in draft.
  let keyFilter = ''
  const filter = () => {
    const q = name.value.trim().toLowerCase()
    const mine = onlyCustom.getAttribute('aria-pressed') === 'true'
    for (const a of ACTIONS) {
      const ok = (!q || a.label.toLowerCase().includes(q)) && (!keyFilter || chordsOf(a.id, draft).includes(keyFilter)) && (!mine || custom(a.id))
      rows.get(a.id)!.hidden = !ok
    }
  }
  const changed = () => {
    for (const a of ACTIONS) paint(a.id)
    measure()
    filter()
    on.change?.()
  }

  // Filters. Using one search clears the other.
  name.addEventListener('input', () => {
    if (name.value && (key.value || keyFilter)) key.value = keyFilter = ''
    filter()
  })
  captureField(key, {
    change: (v) => {
      keyFilter = v
      if (v) name.value = ''
      filter()
    },
  })
  onlyCustom.addEventListener('click', () => {
    onlyCustom.setAttribute('aria-pressed', String(onlyCustom.getAttribute('aria-pressed') !== 'true'))
    filter()
  })
  $('.bind-clear').addEventListener('click', () => {
    name.value = key.value = keyFilter = ''
    onlyCustom.setAttribute('aria-pressed', 'false')
    filter()
    name.focus()
  })

  // Edit: the binding cell becomes a focused capture field. Enter / blur accept, Escape cancels.
  let editing: Action | null = null
  function edit(a: Action) {
    if (editing) return
    editing = a
    on.message(null)
    const row = rows.get(a)!
    const cell = row.querySelector('.cell') as HTMLElement
    const input = document.createElement('input')
    input.className = 'chord'
    input.value = shown(a)
    input.placeholder = 'Unbound'
    cell.replaceChildren(input)
    const done = (value?: string) => {
      const chordEl = document.createElement('span')
      chordEl.className = 'chord'
      cell.replaceChildren(chordEl)
      editing = null
      paint(a)
      // Enter / Escape leave focus nowhere: back to the row, inside the panel (its keys).
      setTimeout(() => {
        if (!document.activeElement || document.activeElement === document.body) focusRow(a)
      })
      if (value !== undefined) void commit(SPECS.get(a)!, value)
    }
    captureField(input, { accept: (v) => done(v), cancel: () => done() })
    input.focus()
  }
  const focusRow = (a: Action) => (rows.get(a)!.querySelector('.edit') as HTMLElement).focus()

  // `v`: '' = unbound; the default chord (or undefined: row X) = not customized (aliases back).
  // A chord another action answers to: dialog; Replace unbinds that one (null: customized).
  async function commit(spec: ActionSpec, v?: string) {
    const next: Bindings = { ...draft }
    if (v === undefined || v === spec.chord) delete next[spec.id]
    else next[spec.id] = v || null
    if (Object.hasOwn(next, spec.id) === custom(spec.id) && next[spec.id] === draft[spec.id]) return
    if (v) {
      const err = validBinding(v)
      if (err) return on.message(`${spec.label}: ${err}`)
    }
    const clashes = conflicts(next).filter((c) => c.actions.includes(spec.id))
    if (clashes.length) {
      const others = clashes.map((c) => ({ chord: c.chord, other: SPECS.get(c.actions[0] === spec.id ? c.actions[1] : c.actions[0])! }))
      const ok = await confirmDialog({
        cls: 'binding-conflict',
        title: 'Key already in use',
        body: others.map(({ chord, other }) => p(`${chord} is bound to “${other.label}”.`)),
        confirm: 'Replace',
      })
      if (section.isConnected) focusRow(spec.id) // the dialog's refocus() went to the active tile
      if (!ok) return
      for (const { other } of others) next[other.id] = null
    }
    for (const k of Object.keys(draft) as Action[]) delete draft[k]
    Object.assign(draft, next)
    changed()
  }

  changed()
  return {
    value: () => ({ ...draft }),
    focus: () => name.focus(),
  }
}
