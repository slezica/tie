// PNG of the current state of a running instance.
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { connectPage, ROOT } from './lib.mjs'

const instance = process.env.TIE_INSTANCE || 'dev'
const out = process.argv[2] || join(ROOT, 'tmp/shots/current.png')
mkdirSync(dirname(out), { recursive: true })
const { browser, page } = await connectPage(instance)
await page.screenshot({ path: out, scale: 'css' })
await browser.close()
console.log(out)
