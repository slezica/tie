import { describe, it, expect } from 'vitest'
import { chord, actionFor, DEFAULT_KEYMAP } from './keymap'

const k = (key: string, mods: Partial<{ meta: boolean; control: boolean; alt: boolean; shift: boolean }> = {}) => ({ key, meta: false, control: false, alt: false, shift: false, ...mods })

describe('chord', () => {
  it('modifiers in order, then key (letters upper, arrows named)', () => {
    expect(chord(k('d', { meta: true }))).toBe('Cmd+D')
    expect(chord(k('D', { meta: true, shift: true }))).toBe('Cmd+Shift+D')
    expect(chord(k('ArrowLeft', { meta: true }))).toBe('Cmd+Left')
    expect(chord(k('Tab', { control: true, shift: true }))).toBe('Ctrl+Shift+Tab')
    expect(chord(k('1', { meta: true }))).toBe('Cmd+1')
  })
})

describe('actionFor', () => {
  it('maps the default shortcuts', () => {
    expect(actionFor(k('d', { meta: true }))).toBe('split-right')
    expect(actionFor(k('D', { meta: true, shift: true }))).toBe('split-down')
    expect(actionFor(k('ArrowUp', { meta: true }))).toBe('focus-up')
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
