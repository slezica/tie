// Behaviour settings the renderer reads synchronously (kinds decide at open / click time): set at
// boot and after every save (settings.ts). Appearance settings live in appearance.ts.
import type { Settings } from '../preload'

export interface Prefs {
  confirmExternal: boolean // confirm before opening a link in the system browser
  terminalTitle: Settings['terminalTitle'] // what terminal titles show (kinds/terminal.ts)
  gitignore: boolean // file picker walks skip what git ignores (setting `gitignore`)
}
export const prefs: Prefs = { confirmExternal: true, terminalTitle: 'command', gitignore: true }

export function applyPrefs(s: Pick<Settings, 'confirmExternal' | 'terminalTitle' | 'gitignore'>) {
  prefs.confirmExternal = s.confirmExternal
  prefs.terminalTitle = s.terminalTitle
  prefs.gitignore = s.gitignore
}
