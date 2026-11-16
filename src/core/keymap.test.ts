import { describe, it, expect } from 'vitest'
import { chord, actionFor, DEFAULT_KEYMAP, ACTIONS, isAction, parseChord, validBinding, resolveKeymap, conflicts, bindingErrors, cleanBindings, accelerator, captured, capturePasses, type Bindings, type KeyInput } from './keymap'

const k = (key: string, mods: Partial<{ meta: boolean; control: boolean; alt: boolean; shift: boolean }> = {}) => ({ key, meta: false, control: false, alt: false, shift: false, ...mods })

describe('chord', () => {
  it('modifiers in order, then key (letters upper, arrows named)', () => {
    expect(chord(k('d', { meta: true }))).toBe('Cmd+D')
    expect(chord(k('D', { meta: true, shift: true }))).toBe('Cmd+Shift+D')
    expect(chord(k('ArrowLeft', { meta: true }))).toBe('Cmd+Left')
    expect(chord(k('ArrowDown', { meta: true, shift: true }))).toBe('Cmd+Shift+Down')
    expect(chord(k('Tab', { control: true, shift: true }))).toBe('Ctrl+Shift+Tab')
    expect(chord(k('1', { meta: true }))).toBe('Cmd+1')
  })
})

describe('actionFor', () => {
  it('maps the default shortcuts', () => {
    expect(actionFor(k('d', { meta: true }))).toBe('split-right')
    expect(actionFor(k('D', { meta: true, shift: true }))).toBe('split-down')
    expect(actionFor(k('o', { meta: true }))).toBe('file-right')
    expect(actionFor(k('O', { meta: true, shift: true }))).toBe('file-down')
    expect(actionFor(k('ArrowUp', { meta: true }))).toBe('focus-up')
    expect(actionFor(k('ArrowLeft', { meta: true, shift: true }))).toBe('swap-left')
    expect(actionFor(k('ArrowRight', { meta: true, shift: true }))).toBe('swap-right')
    expect(actionFor(k('ArrowUp', { meta: true, shift: true }))).toBe('swap-up')
    expect(actionFor(k('ArrowDown', { meta: true, shift: true }))).toBe('swap-down')
    expect(actionFor(k('s', { meta: true }))).toBe('toggle-shelf')
    expect(actionFor(k('S', { meta: true, shift: true }))).toBe(undefined)
    expect(actionFor(k('=', { meta: true }))).toBe('zoom-in')
    expect(actionFor(k('+', { meta: true, shift: true }))).toBe('zoom-in')
    expect(actionFor(k('-', { meta: true }))).toBe('zoom-out')
    expect(actionFor(k('0', { meta: true }))).toBe('zoom-reset')
    expect(actionFor(k('ArrowLeft', { meta: true, alt: true }))).toBe(undefined)
    expect(actionFor(k('w', { meta: true }))).toBe('close-tile')
    expect(actionFor(k('Tab', { control: true }))).toBe('next-tab')
    expect(actionFor(k('9', { meta: true }))).toBe('tab-9')
    expect(actionFor(k('[', { meta: true }))).toBe('nav-back')
    expect(actionFor(k(']', { meta: true }))).toBe('nav-forward')
    expect(actionFor(k('r', { meta: true }))).toBe('nav-reload')
    expect(actionFor(k('l', { meta: true }))).toBe('nav-location')
    expect(actionFor(k('r', { meta: true, shift: true }))).toBe(undefined)
    expect(actionFor(k('q', { meta: true }))).toBe('quit')
  })
  it('never takes Esc, plain keys, or editing combos', () => {
    for (const x of [k('Escape'), k('d'), k('c', { meta: true }), k('v', { meta: true }), k('x', { meta: true }), k('a', { meta: true }), k('z', { meta: true }), k('Z', { meta: true, shift: true }), k('Enter')])
      expect(actionFor(x)).toBe(undefined)
  })
  it('has no prototype keys', () => {
    expect(actionFor(k('toString'))).toBe(undefined)
    expect(Object.keys(DEFAULT_KEYMAP).every((c) => c.includes('+'))).toBe(true)
  })
})

describe('ACTIONS', () => {
  it('unique ids, labels; defaults valid and conflict-free', () => {
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length)
    expect(ACTIONS.every((a) => a.label)).toBe(true)
    for (const a of ACTIONS) for (const c of [a.chord, ...(a.aliases ?? [])]) expect(parseChord(c), c).not.toBe(null)
    for (const a of ACTIONS) expect(validBinding(a.chord), a.chord).toBe(null)
    expect(conflicts({})).toEqual([])
    expect(ACTIONS.filter((a) => a.id.startsWith('tab-')).length).toBe(9)
  })
  it('DEFAULT_KEYMAP holds every chord and alias', () => {
    const n = ACTIONS.reduce((s, a) => s + 1 + (a.aliases?.length ?? 0), 0)
    expect(Object.keys(DEFAULT_KEYMAP).length).toBe(n)
    expect(DEFAULT_KEYMAP['Cmd++']).toBe('zoom-in')
    expect(DEFAULT_KEYMAP['Cmd+Shift++']).toBe('zoom-in')
    expect(isAction('quit')).toBe(true)
    expect(isAction('toString')).toBe(false)
    expect(isAction(3)).toBe(false)
  })
})

describe('chord', () => {
  it('names space', () => expect(chord(k(' ', { control: true }))).toBe('Ctrl+Space'))
})

describe('parseChord', () => {
  it('splits modifiers and key, + as key', () => {
    expect(parseChord('Cmd+Shift++')).toEqual({ mods: ['Cmd', 'Shift'], key: '+' })
    expect(parseChord('Cmd++')).toEqual({ mods: ['Cmd'], key: '+' })
    expect(parseChord('F5')).toEqual({ mods: [], key: 'F5' })
    expect(parseChord('Cmd+Ctrl+Alt+Shift+Left')).toEqual({ mods: ['Cmd', 'Ctrl', 'Alt', 'Shift'], key: 'Left' })
  })
  it('refuses malformed', () => {
    for (const c of ['', 'Cmd+', 'Cmd+d', 'Shift+Cmd+D', 'Cmd+Cmd+D', 'Meta+D', 'Cmd++D', 'Cmd+ArrowLeft', 'Cmd+F25', 'Cmd+F0', 'Cmd+DD', 'Cmd+Space+D', 'Cmd+\t', 'Cmd+ ', 'cmd+D'])
      expect(parseChord(c), c).toBe(null)
    expect(parseChord(3 as unknown as string)).toBe(null)
  })
  it('round-trips chord()', () => {
    for (const x of [k('d', { meta: true, shift: true }), k('ArrowUp', { control: true, alt: true }), k('F12'), k('+', { meta: true }), k(' ', { meta: true }), k('PageDown', { meta: true })])
      expect(parseChord(chord(x)), chord(x)).not.toBe(null)
  })
})

describe('validBinding', () => {
  it('accepts Cmd / Ctrl chords and bare function keys', () => {
    for (const c of ['Cmd+K', 'Ctrl+K', 'Cmd+Alt+Shift+Up', 'F5', 'Shift+F12', 'Alt+F1', 'Cmd+Space', 'Cmd+Delete'])
      expect(validBinding(c), c).toBe(null)
  })
  it('refuses bare keys, Alt / Shift only', () => {
    for (const c of ['K', 'Shift+K', 'Alt+K', 'Alt+Shift+Left', 'Space', 'Delete']) expect(validBinding(c), c).toMatch(/Needs Cmd or Ctrl/)
  })
  it('refuses reserved keys with any modifiers, editing combos, cmd+,', () => {
    for (const c of ['Escape', 'Cmd+Escape', 'Cmd+Tab', 'Alt+Tab', 'Cmd+Enter', 'Cmd+Shift+Backspace', 'Ctrl+Alt+Tab']) expect(validBinding(c), c).toMatch(/Reserved key/)
    for (const c of ['Cmd+C', 'Cmd+V', 'Cmd+X', 'Cmd+A', 'Cmd+Z', 'Cmd+Shift+Z', 'Cmd+,']) expect(validBinding(c), c).toMatch(/Reserved combination/)
  })
  it('keeps default chords bindable (Ctrl+Tab)', () => {
    expect(validBinding('Ctrl+Tab')).toBe(null)
    expect(validBinding('Ctrl+Shift+Tab')).toBe(null)
  })
  it('refuses malformed', () => expect(validBinding('Cmd+d')).toMatch(/Not a key combination/))
})

describe('resolveKeymap', () => {
  it('no overrides = defaults', () => expect(resolveKeymap({})).toEqual(DEFAULT_KEYMAP))
  it('override replaces the default chord', () => {
    const m = resolveKeymap({ 'split-right': 'Cmd+K' })
    expect(m['Cmd+K']).toBe('split-right')
    expect(m['Cmd+D']).toBe(undefined)
    expect(actionFor(k('k', { meta: true }), m)).toBe('split-right')
    expect(actionFor(k('d', { meta: true }), m)).toBe(undefined)
  })
  it('null unbinds', () => {
    const m = resolveKeymap({ quit: null })
    expect(Object.values(m).includes('quit')).toBe(false)
  })
  it('customized zoom-in drops its aliases', () => {
    const m = resolveKeymap({ 'zoom-in': 'Cmd+I' })
    expect(m['Cmd+I']).toBe('zoom-in')
    expect(m['Cmd+=']).toBe(undefined)
    expect(m['Cmd++']).toBe(undefined)
    expect(m['Cmd+Shift++']).toBe(undefined)
  })
  it('override equal to the default still counts', () => expect(resolveKeymap({ 'split-right': 'Cmd+D' })).toEqual(DEFAULT_KEYMAP))
  it('swap of two chords', () => {
    const m = resolveKeymap({ 'split-right': 'Cmd+Shift+D', 'split-down': 'Cmd+D' })
    expect(m['Cmd+D']).toBe('split-down')
    expect(m['Cmd+Shift+D']).toBe('split-right')
  })
  it('deterministic on conflicts: overrides first, ACTIONS order', () => {
    expect(resolveKeymap({ 'split-right': 'Cmd+T' })['Cmd+T']).toBe('split-right') // over new-tab's default
    expect(resolveKeymap({ 'new-tab': 'Cmd+K', 'split-right': 'Cmd+K' })['Cmd+K']).toBe('split-right')
  })
  it('ignores unknown actions, bad chords, wrong types', () => {
    const bad = { nope: 'Cmd+K', 'split-right': 'Cmd+d', 'split-down': 3, toString: 'Cmd+J', __proto__: { quit: null } } as unknown as Bindings
    expect(resolveKeymap(bad)).toEqual(DEFAULT_KEYMAP)
  })
})

describe('conflicts', () => {
  it('override on another default', () => expect(conflicts({ 'split-right': 'Cmd+T' })).toEqual([{ chord: 'Cmd+T', actions: ['split-right', 'new-tab'] }]))
  it('override on a default alias', () => expect(conflicts({ 'nav-reload': 'Cmd++' })).toEqual([{ chord: 'Cmd++', actions: ['nav-reload', 'zoom-in'] }]))
  it('two overrides', () => expect(conflicts({ 'split-right': 'Cmd+K', 'split-down': 'Cmd+K' })).toEqual([{ chord: 'Cmd+K', actions: ['split-right', 'split-down'] }]))
  it('resolved by unbinding the other', () => expect(conflicts({ 'split-right': 'Cmd+T', 'new-tab': null })).toEqual([]))
  it('same action twice is no conflict', () => expect(conflicts({ 'split-right': 'Cmd+D' })).toEqual([]))
})

describe('bindingErrors', () => {
  it('valid', () => {
    expect(bindingErrors({})).toEqual([])
    expect(bindingErrors({ quit: null, 'split-right': 'Cmd+K' })).toEqual([])
  })
  it('names the action', () => {
    expect(bindingErrors({ nope: 'Cmd+K' })).toEqual(['Unknown action: nope'])
    expect(bindingErrors({ 'split-right': 'Cmd+C' })).toEqual(['Split right: Reserved combination: Cmd+C'])
    expect(bindingErrors({ 'split-right': 'K' })[0]).toMatch(/^Split right: Needs Cmd or Ctrl/)
    expect(bindingErrors({ 'split-right': 5 })).toEqual(['Split right: not a key combination'])
    expect(bindingErrors({ 'split-right': 'Cmd+T' })).toEqual(['Split right and New tab both use Cmd+T'])
  })
  it('not an object', () => {
    for (const x of [null, 'x', [], 3]) expect(bindingErrors(x)).toEqual(['Bindings must be an object'])
  })
})

describe('cleanBindings', () => {
  it('keeps valid entries and null, drops the rest', () => {
    expect(cleanBindings({ quit: null, 'split-right': 'Cmd+K', 'split-down': 'Cmd+C', nope: 'Cmd+J', 'new-tab': 4 })).toEqual({ quit: null, 'split-right': 'Cmd+K' })
    for (const x of [null, undefined, 'x', [], 3]) expect(cleanBindings(x)).toEqual({})
    expect(Object.keys(cleanBindings(JSON.parse('{"__proto__": {"quit": null}}')))).toEqual([])
  })
})

describe('accelerator', () => {
  it('converts to Electron syntax', () => {
    expect(accelerator('Cmd+Q')).toBe('Cmd+Q')
    expect(accelerator('Cmd+Shift++')).toBe('Cmd+Shift+Plus')
    expect(accelerator('Ctrl+Alt+Left')).toBe('Ctrl+Alt+Left')
    expect(accelerator('Cmd+Space')).toBe('Cmd+Space')
    expect(accelerator('F5')).toBe('F5')
    expect(accelerator('Cmd+[')).toBe('Cmd+[')
  })
  it('null when unbound, malformed or not expressible', () => {
    expect(accelerator(undefined)).toBe(null)
    expect(accelerator('Cmd+q')).toBe(null)
    expect(accelerator('Cmd+Alt+∂')).toBe(null)
  })
})

describe('alt chords and capture', () => {
  const k = (key: string, o: Partial<KeyInput> = {}): KeyInput => ({ key, meta: false, control: false, alt: false, shift: false, ...o })
  it('names the key from its code while Alt is held', () => {
    expect(chord(k('∂', { alt: true, code: 'KeyD' }))).toBe('Alt+D')
    expect(chord(k('Dead', { alt: true, meta: true, code: 'KeyE' }))).toBe('Cmd+Alt+E')
    expect(chord(k('¡', { alt: true, code: 'Digit1' }))).toBe('Alt+1')
    expect(chord(k('“', { alt: true, control: true, code: 'BracketLeft' }))).toBe('Ctrl+Alt+[')
    expect(chord(k('ArrowLeft', { alt: true, code: 'ArrowLeft' }))).toBe('Alt+Left')
    expect(validBinding('Cmd+Alt+E')).toBeNull()
  })
  it('ignores the code without Alt', () => {
    expect(chord(k('d', { meta: true, code: 'KeyE' }))).toBe('Cmd+D')
  })
  it('captures chords, shows held modifiers', () => {
    expect(captured(k('d', { meta: true, shift: true }))).toEqual({ chord: 'Cmd+Shift+D', complete: true })
    expect(captured(k('Shift', { meta: true, shift: true }))).toEqual({ chord: 'Cmd+Shift+', complete: false })
    expect(captured(k('Meta'))).toEqual({ chord: '', complete: false })
  })
  it("passes the field's own keys, unless with Cmd / Ctrl / Alt", () => {
    for (const key of ['Escape', 'Tab', 'Enter', 'Backspace']) expect(capturePasses(k(key))).toBe(true)
    expect(capturePasses(k('Tab', { shift: true }))).toBe(true)
    expect(capturePasses(k('Tab', { control: true }))).toBe(false)
    expect(capturePasses(k('d'))).toBe(false)
  })
})
