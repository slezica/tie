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
