// Quit asks, always (⌘Q, menu Quit, red button, Dock: main's before-quit → app:ask-quit). Busy
// terminals in every tab (shelf included) listed, grouped by tab when there are several; then
// browser pages' beforeunload, one by one (Stay aborts). Confirmed: main quits (killAll).
// One question at a time: ⌘Q while any dialog is open does nothing. docs/ARCHITECTURE.md "Quit".
import { S, tie } from './state'
import { confirmDialog } from './dialog'
import { runningIn, runningList, tilesOf, unloadAll } from './close'
import { tabTitle } from './tabs'

const dialogOpen = () => !!document.querySelector('.dialog-backdrop')
const para = (text: string, cls = '') => Object.assign(document.createElement('p'), { textContent: text, className: cls })

let asking = false
export async function askQuit() {
  if (asking || dialogOpen()) return
  asking = true
  try {
    const ids = S.spaces.flatMap(tilesOf)
    const running = await runningIn(ids)
    if (dialogOpen()) return // another question came up meanwhile
    const body: Node[] = []
    if (running.length) {
      body.push(para('Currently running:'))
      if (S.spaces.length === 1) body.push(runningList(running))
      else
        for (const sp of S.spaces) {
          const mine = running.filter((r) => tilesOf(sp).includes(r.id))
          if (mine.length) body.push(para(tabTitle(sp), 'group'), runningList(mine))
        }
    }
    const ok = await confirmDialog({ cls: 'quit', title: 'Quit Tie?', body, confirm: 'Quit', focus: 'confirm' })
    if (!ok || !(await unloadAll(ids))) return
    tie.quit()
  } finally {
    asking = false
  }
}
