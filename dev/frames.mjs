// Frame tree of an instance's window: url, origin, process, out-of-process (content frames: yes).
import { tie } from './lib.mjs'

const instance = process.env.TIE_INSTANCE || 'dev'
const frames = await tie(instance, 'frames')
for (const f of frames)
  console.log(`${'  '.repeat(f.depth)}${f.url}  origin=${f.origin}  pid=${f.pid}${f.depth ? `  out-of-process=${f.outOfProcess ? 'yes' : 'NO'}` : ''}`)
