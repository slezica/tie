// Behaviour settings the renderer reads synchronously (kinds decide at open / click time): set at
// boot and after every save (settings.ts). Appearance settings live in appearance.ts.
import type { Settings } from '../preload'

export interface Prefs {
  htmlScripts: boolean // html tiles start with scripts on
  confirmExternal: boolean // confirm before opening a link in the system browser
}
export const prefs: Prefs = { htmlScripts: false, confirmExternal: true }

export function applyPrefs(s: Pick<Settings, 'htmlScripts' | 'confirmExternal'>) {
  prefs.htmlScripts = s.htmlScripts
  prefs.confirmExternal = s.confirmExternal
}
