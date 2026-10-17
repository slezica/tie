// Small modal message box (HTML, drivable by the harness).
import { refocus } from './ops'

export function infoDialog(title: string, message: string): Promise<void> {
  return new Promise((resolve) => {
    const back = document.createElement('div')
    back.className = 'dialog-backdrop'
    back.innerHTML = `<div class="dialog" role="alertdialog"><h2></h2><p></p><div class="actions"><button class="ok">OK</button></div></div>`
    back.querySelector('h2')!.textContent = title
    back.querySelector('p')!.textContent = message
    const done = () => {
      back.remove()
      refocus()
      resolve()
    }
    back.querySelector('.ok')!.addEventListener('click', done)
    back.addEventListener('pointerdown', (e) => e.target === back && done())
    back.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Escape' || e.key === 'Enter') done()
    })
    document.body.appendChild(back)
    ;(back.querySelector('.ok') as HTMLElement).focus()
  })
}

// Modal question: resolves true for `confirm`, false for Cancel / Escape / backdrop. Cancel has
// focus (Enter cancels): confirming takes a deliberate click or Tab.
// SECURITY: `arm` ms (dialogs content can raise, e.g. an html page asking for the web): the confirm
// button stays disabled that long after the dialog appears, so a dialog timed to pop up under a
// click the user was already making can't be accepted by that click (Firefox's security delay).
export function confirmDialog(o: { cls?: string; title: string; body: Node[]; confirm: string; arm?: number }): Promise<boolean> {
  return new Promise((resolve) => {
    const back = document.createElement('div')
    back.className = 'dialog-backdrop'
    back.innerHTML = `<div class="dialog" role="alertdialog"><h2></h2><div class="dialog-body"></div><div class="actions"><button class="cancel secondary">Cancel</button><button class="confirm"></button></div></div>`
    const d = back.querySelector('.dialog')!
    if (o.cls) d.classList.add(o.cls)
    back.querySelector('h2')!.textContent = o.title
    back.querySelector('.dialog-body')!.append(...o.body)
    const confirm = back.querySelector('.confirm') as HTMLButtonElement
    confirm.textContent = o.confirm
    if (o.arm) {
      confirm.disabled = true
      setTimeout(() => (confirm.disabled = false), o.arm)
    }
    const done = (ok: boolean) => {
      back.remove()
      refocus()
      resolve(ok)
    }
    back.querySelector('.cancel')!.addEventListener('click', () => done(false))
    back.querySelector('.confirm')!.addEventListener('click', () => done(true))
    back.addEventListener('pointerdown', (e) => e.target === back && done(false))
    back.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Escape') done(false)
    })
    document.body.appendChild(back)
    ;(back.querySelector('.cancel') as HTMLElement).focus()
  })
}
