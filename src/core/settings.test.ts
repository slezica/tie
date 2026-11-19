import { describe, it, expect } from 'vitest'
import { DEFAULTS, sanitize, parseCommand, validateSettings, parseSettings, fileChanged, type Settings } from './settings'

// A hand-edited file may hold anything: sanitize takes it as if typed.
const clean = (patch: Record<string, unknown>) => sanitize({ ...DEFAULTS, ...patch } as Settings)
const found = (cmd: string) => (cmd === 'zsh' || cmd === '/bin/zsh' ? '/bin/zsh' : null)

describe('sanitize', () => {
  it('keeps valid values', () => {
    const s = clean({ theme: 'nord', fontSize: 15, lineHeight: 1.3, cellWidth: 95, fontFamily: 'Menlo', borderless: true, toolbar: 'top', terminalTitle: 'directory', gitignore: false })
    expect(s).toMatchObject({ theme: 'nord', fontSize: 15, lineHeight: 1.3, cellWidth: 95, fontFamily: 'Menlo', borderless: true, toolbar: 'top', terminalTitle: 'directory', gitignore: false })
  })
  it('clamps numbers into range', () => {
    expect(clean({ fontSize: 200 }).fontSize).toBe(32)
    expect(clean({ fontSize: 3 }).fontSize).toBe(8)
    expect(clean({ lineHeight: 9 }).lineHeight).toBe(2)
    expect(clean({ lineHeight: 0.2 }).lineHeight).toBe(1)
    expect(clean({ cellWidth: 500 }).cellWidth).toBe(150)
    expect(clean({ cellWidth: 10 }).cellWidth).toBe(70)
  })
  it('numbers: not a number (or 0) → default; numeric strings count', () => {
    expect(clean({ fontSize: 'big' }).fontSize).toBe(DEFAULTS.fontSize)
    expect(clean({ lineHeight: null }).lineHeight).toBe(DEFAULTS.lineHeight)
    expect(clean({ fontSize: 0 }).fontSize).toBe(DEFAULTS.fontSize) // 0 reads as "unset", not as "below the minimum"
    expect(clean({ fontSize: '14' }).fontSize).toBe(14)
  })
  it('strings of the wrong type → default; font family trimmed', () => {
    expect(clean({ shell: 5 }).shell).toBe('')
    expect(clean({ theme: 7 }).theme).toBe(DEFAULTS.theme)
    expect(clean({ fontFamily: '  Menlo ' }).fontFamily).toBe('Menlo')
  })
  it('enums and booleans fall back', () => {
    expect(clean({ toolbar: 'left' }).toolbar).toBe('bottom')
    expect(clean({ terminalTitle: 'nope' }).terminalTitle).toBe(DEFAULTS.terminalTitle)
    expect(clean({ borderless: 'yes' }).borderless).toBe(false)
    expect(clean({ warnPasteControl: 0 }).warnPasteControl).toBe(true)
    expect(clean({ warnPasteRun: 'no' }).warnPasteRun).toBe(true)
    expect(clean({ confirmExternal: null }).confirmExternal).toBe(true)
    expect(clean({ gitignore: 'false' }).gitignore).toBe(true)
  })
  it('SECURITY: external control only on a real true', () => {
    expect(clean({ allowExternalControl: true }).allowExternalControl).toBe(true)
    for (const v of ['true', 1, 'yes', {}, [], null, undefined]) expect(clean({ allowExternalControl: v }).allowExternalControl).toBe(false)
  })
  it('SECURITY: the safety confirms stay on unless a real false', () => {
    for (const key of ['warnPasteControl', 'warnPasteRun', 'confirmExternal'] as const) {
      expect(clean({ [key]: false })[key]).toBe(false)
      for (const v of ['false', 0, null, undefined]) expect(clean({ [key]: v })[key]).toBe(true)
    }
  })
  it('bindings: unknown actions and bad chords dropped', () => {
    expect(clean({ bindings: { 'split-right': 'Ctrl+G', nope: 'Cmd+J', quit: null, 'new-tab': 'Escape' } }).bindings).toEqual({ 'split-right': 'Ctrl+G', quit: null })
    expect(clean({ bindings: 'x' }).bindings).toEqual({})
  })
})

describe('parseCommand', () => {
  it('splits on whitespace, quotes group', () => {
    expect(parseCommand('/bin/zsh -l')).toEqual(['/bin/zsh', '-l'])
    expect(parseCommand(`bash -c "echo hi there" 'a b'`)).toEqual(['bash', '-c', 'echo hi there', 'a b'])
    expect(parseCommand('  ')).toEqual([])
    expect(parseCommand('""')).toEqual([''])
  })
})

describe('validateSettings', () => {
  it('shell must resolve to an executable; empty = default', () => {
    expect(validateSettings({ shell: 'zsh -l' }, found)).toEqual([])
    expect(validateSettings({ shell: '  ' }, found)).toEqual([])
    expect(validateSettings({ shell: 'nope -l' }, found)).toEqual([{ field: 'shell', message: 'Shell not found or not executable: nope' }])
  })
  it('terminal title mode, gitignore type', () => {
    expect(validateSettings({ terminalTitle: 'x' as never }, found)[0].field).toBe('terminalTitle')
    expect(validateSettings({ gitignore: 'yes' as never }, found)[0].field).toBe('gitignore')
    expect(validateSettings({ terminalTitle: 'auto', gitignore: false }, found)).toEqual([])
  })
  it('bindings: each problem reported on the bindings field', () => {
    const errors = validateSettings({ bindings: { 'split-right': 'Escape', 'new-tab': 'J' } }, found)
    expect(errors.length).toBe(2)
    expect(errors.every((e) => e.field === 'bindings')).toBe(true)
  })
  it('absent keys are not checked', () => {
    expect(validateSettings({}, found)).toEqual([])
  })
})

describe('fileChanged (disk vs baseline)', () => {
  const t = (text: string) => ({ text })
  const missing = { missing: true as const }
  it('compares content, not identity', () => {
    expect(fileChanged(t('{"a":1}'), t('{"a":1}'))).toBe(false) // touch, identical rewrite
    expect(fileChanged(t('{"a":1}'), t('{"a":2}'))).toBe(true)
    expect(fileChanged(t('{"a":1}'), t('{"a":1}\n'))).toBe(true) // any byte counts
  })
  it('missing vs present is a change; missing vs missing is not', () => {
    expect(fileChanged(missing, missing)).toBe(false)
    expect(fileChanged(missing, t(''))).toBe(true)
    expect(fileChanged(t('{}'), missing)).toBe(true)
  })
  it('unreadable: same as another unreadable read, else a change', () => {
    expect(fileChanged({ unreadable: 'EACCES' }, { unreadable: 'EPERM' })).toBe(false)
    expect(fileChanged({ unreadable: 'EACCES' }, t('{}'))).toBe(true)
    expect(fileChanged({ unreadable: 'EACCES' }, missing)).toBe(true)
    expect(fileChanged(missing, { unreadable: 'EACCES' })).toBe(true)
  })
})

describe('parseSettings (startup and Reload: one parse, one trust level)', () => {
  it('syntax errors and non-objects are refused with a message', () => {
    const r = parseSettings('{ "theme": "nord", }')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.message).toBeTruthy()
    for (const text of ['null', '[]', '"nord"', '5']) expect(parseSettings(text)).toEqual({ ok: false, message: 'Not a JSON object' })
  })
  it('sanitizes over the defaults: clamps, allowExternalControl only on a real true, theme aliases', () => {
    const r = parseSettings('{ "fontSize": 200, "allowExternalControl": "true", "theme": "elegant-dark" }')
    expect(r.ok && r.settings).toMatchObject({ fontSize: 32, allowExternalControl: false, theme: 'tie-dark', lineHeight: DEFAULTS.lineHeight })
    const on = parseSettings('{ "allowExternalControl": true }')
    expect(on.ok && on.settings.allowExternalControl).toBe(true)
  })
})
