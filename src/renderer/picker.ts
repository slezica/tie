// File picker (the file template, cmd+O): one line holding a path, fuzzy suggestions under it.
// Prefix (up to the last `/`) = the directory walked (main `doc:walk`, streamed); query (the rest)
// ranked over everything the walk found (`@core/picker`). Modal (`.dialog-backdrop`: shortcuts
// suspended, keys.ts). docs/2026-10-30-file-picker.md, INPUT.md "File picker".
import { tie, debug } from './state'
import { refocus } from './ops'
import { prefs } from './prefs'
import { tildePath, homeDir } from './tabs'
import { rank, merge, parseLine, joinPath, descendOf, type Hit } from '@core/picker'
import type { WalkChunk } from '../preload'

const ROWS = 8
const FIRST_PAINT_MS = 30

// Chunks of every walk land here; each dialog keeps only its current gen's.
let gens = 0
let sink: ((gen: number, chunk: WalkChunk) => void) | null = null
let listening = false
function listen() {
  if (listening) return
  listening = true
  tie.doc.onWalkChunk((gen, chunk) => sink?.(gen, chunk))
}

// Picked absolute path (as typed / as walked: no realpath), or null (dismissed).
export function pickPath(startDir: string): Promise<string | null> {
  listen()
  return new Promise((resolve) => {
    const back = document.createElement('div')
    back.className = 'dialog-backdrop picker-backdrop'
    back.innerHTML = `<div id="picker" class="picker" role="dialog" aria-label="Open file">
      <div class="picker-line"><input id="picker-input" spellcheck="false" autocomplete="off" /><button id="picker-native" title="System dialog">…</button></div>
      <div id="picker-list" role="listbox"></div>
      <div id="picker-status"></div>
    </div>`
    const box = back.querySelector('#picker') as HTMLElement
    const input = back.querySelector('#picker-input') as HTMLInputElement
    const list = back.querySelector('#picker-list') as HTMLElement
    const status = back.querySelector('#picker-status') as HTMLElement

    let gen = 0 // current walk
    let dir = '' // its directory (absolute, normalized)
    let all: string[] = [] // every path of the current walk
    let files = 0
    let top: Hit[] = []
    let sel = 0
    let moved = false // arrows used since the last edit: Enter acts on the row, not the typed text
    let walk: { done: boolean; partial?: string; waiting?: string[]; error?: string } = { done: false }
    let note = '' // Enter's last failure
    let closed = false
    let busy = false // native dialog open

    const text = () => input.value
    const line = () => parseLine(text(), homeDir())

    const close = (path: string | null) => {
      if (closed) return
      closed = true
      sink = null
      if (gen) tie.doc.stopWalk(gen)
      back.remove()
      refocus()
      debug('picker', 'closed', path === null ? 'cancel' : 'picked')
      resolve(path)
    }

    const renderStatus = () => {
      const parts = walk.error ? [walk.error] : [`${files} file${files === 1 ? '' : 's'}${walk.done ? '' : ' …'}`]
      if (walk.partial) parts.push('partial')
      if (walk.waiting?.length) parts.push(`waiting for permission: ${walk.waiting.map((w) => (w === '.' ? tildePath(dir) : w)).join(', ')}`)
      if (note) parts.push(note)
      status.textContent = parts.join(' · ')
      status.classList.toggle('error', !!(walk.error || note))
      status.classList.toggle('partial', !!walk.partial)
    }

    const renderRows = () => {
      list.replaceChildren(...top.map((hit, i) => row(hit, i === sel)))
      renderStatus()
    }

    // Path text with matched chars in <mark>; the parent part dimmed. Text nodes only (names are
    // the filesystem's, never markup).
    function row(hit: Hit, selected: boolean): HTMLElement {
      const el = document.createElement('div')
      el.className = 'picker-row' + (selected ? ' selected' : '') + (hit.path.endsWith('/') ? ' dir' : '')
      el.setAttribute('role', 'option')
      el.dataset.path = hit.path
      const cut = hit.path.lastIndexOf('/', hit.path.length - 2) + 1 // parent / name
      const marks = new Set(hit.positions)
      const part = (from: number, to: number, cls: string) => {
        const span = document.createElement('span')
        span.className = cls
        for (let i = from; i < to; ) {
          const m = marks.has(i)
          let j = i + 1
          while (j < to && marks.has(j) === m) j++
          const s = hit.path.slice(i, j)
          span.append(m ? Object.assign(document.createElement('mark'), { textContent: s }) : s)
          i = j
        }
        return span
      }
      if (cut) el.append(part(0, cut, 'parent'))
      el.append(part(cut, hit.path.length, 'name'))
      return el
    }

    // (Re)root the walk at the line's directory if it changed; re-rank the held list otherwise.
    const update = () => {
      const l = line()
      if (l.dir !== dir) {
        if (gen) tie.doc.stopWalk(gen)
        gen = ++gens
        dir = l.dir
        all = []
        files = 0
        top = []
        walk = { done: false }
        const g = gen
        tie.doc.walk(dir, { gen: g, gitignore: prefs.gitignore }).then((r) => {
          if (g !== gen || closed || !('error' in r)) return
          walk = { done: true, error: r.error }
          renderRows()
        })
      } else top = rank(l.query, all, ROWS)
      sel = 0
      moved = false
      note = ''
      renderRows()
    }

    sink = (g, chunk) => {
      if (g !== gen || closed) return
      all.push(...chunk.paths)
      for (const p of chunk.paths) if (!p.endsWith('/')) files++
      const keep = moved ? top[sel]?.path : undefined
      top = merge(top, rank(line().query, chunk.paths, ROWS), ROWS)
      sel = Math.max(0, keep ? top.findIndex((h) => h.path === keep) : 0)
      walk = { done: chunk.done, partial: chunk.partial, waiting: chunk.waiting }
      renderRows()
      show()
    }

    // Shown at the first chunk or after FIRST_PAINT_MS (no empty flash); typing works meanwhile.
    const show = () => box.classList.add('shown')
    setTimeout(show, FIRST_PAINT_MS)

    // The line becomes `prefix + rel` (a directory): the walk re-roots there.
    const descend = (rel: string) => {
      input.value = line().prefix + rel
      update()
    }

    const enter = async () => {
      const l = line()
      const hit = top[sel]
      // The typed text naming a file wins over the top row (unless arrows chose one): the walk may
      // not have reached it (or hides it: dot files, ignored).
      if (l.query && !(moved && hit) && hit?.path !== l.query) {
        const abs = joinPath(l.dir, l.query)
        const typed = text()
        const v = await tie.doc.viewer(abs)
        if (closed || text() !== typed) return // edited meanwhile
        if (!('error' in v)) return close(abs)
        if (!hit) {
          note = v.error
          return renderStatus()
        }
      }
      if (!hit) return
      if (hit.path.endsWith('/')) descend(hit.path)
      else close(joinPath(l.dir, hit.path))
    }

    const native = async () => {
      if (busy) return
      busy = true
      const p = await tie.doc.pick(dir || undefined)
      busy = false
      close(p) // null: the user cancelled the system dialog
    }

    input.addEventListener('input', update)
    back.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (busy || e.isComposing) return
      if (e.key === 'Escape') return close(null)
      if (e.target !== input) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (!top.length) return
        sel = Math.min(top.length - 1, Math.max(0, sel + (e.key === 'ArrowDown' ? 1 : -1)))
        moved = true
        renderRows()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        void enter()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const hit = top[sel]
        if (hit && !e.shiftKey) descend(descendOf(hit.path))
      }
    })
    list.addEventListener('pointerdown', (e) => e.preventDefault()) // keep the caret in the input
    list.addEventListener('click', (e) => {
      const r = (e.target as HTMLElement).closest('.picker-row') as HTMLElement | null
      const i = r ? top.findIndex((h) => h.path === r.dataset.path) : -1
      if (i < 0) return
      sel = i
      moved = true
      void enter()
    })
    back.querySelector('#picker-native')!.addEventListener('click', () => void native())
    back.addEventListener('pointerdown', (e) => e.target === back && !busy && close(null))

    const start = tildePath(startDir)
    input.value = start.endsWith('/') ? start : start + '/'
    document.body.appendChild(back)
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
    update()
  })
}
