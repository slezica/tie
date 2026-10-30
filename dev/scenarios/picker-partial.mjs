// File picker: a walk over its entry cap (TIE_WALK_CAP, dev) says "partial"; a typed path past the cap still opens.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const env = { TIE_WALK_CAP: '5' }

export default async (ctx, h) => {
  const R = realpathSync(mkdtempSync(join(tmpdir(), 'tie-picker-partial-')))
  for (let d = 0; d < 3; d++) {
    mkdirSync(join(R, `d${d}`))
    for (let i = 0; i < 4; i++) writeFileSync(join(R, `d${d}`, `f${i}.txt`), `${d}.${i}\n`)
  }
  try {
    const a = (await h.list(ctx)).tiles[0].id
    const t = (await ctx.tie('add', 'terminal', '--cwd', R, '--at', a, '--side', 'r', '--focus')).id
    await h.waitShell(ctx, t)
    await h.waitActive(ctx, t)
    await h.press(ctx, 'Meta+o')
    await ctx.page.waitForSelector('#picker.shown')
    const status = await h.waitFor(ctx, async () => { const s = await ctx.page.textContent('#picker-status'); return s.includes('partial') && s }, 'partial marker')
    const rows = await ctx.page.$$eval('.picker-row', (rs) => rs.length)
    h.assert(rows === 5 && /^\d+ files? · partial$/.test(status), `5 entries held, status "${status}"`)
    await ctx.shot('partial')
    await h.pick(ctx, join(R, 'd2/f3.txt'))
    await h.waitFor(ctx, async () => (await h.list(ctx)).tiles.find((x) => x.doc?.path === join(R, 'd2/f3.txt')), 'typed path past the cap opened')
  } finally {
    rmSync(R, { recursive: true, force: true })
  }
}
