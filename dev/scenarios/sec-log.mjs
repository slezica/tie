// Security: the security log is always on (no TIE_DEBUG here), and values that aren't Tie's own
// text are marked <untrusted>…</untrusted> and escaped in the file (control characters, `<`, `>`),
// while ctx.appLog() reads them plainly. Probe kind (dev): a permission request, a bad content URL
// and a junk port message from inside a frame produce refusals without any user gesture.
export const env = { TIE_DEBUG: '' }

export default async (ctx, h) => {
  const id = (await ctx.tie('add', 'probe')).id
  const f = await h.probeFrame(ctx, id)
  const token = new URL(f.url()).host
  await f.evaluate(async (t) => {
    await Notification.requestPermission().catch(() => {})
    await new Promise((r) => Object.assign(new Image(), { onload: r, onerror: r, src: `tie-content://${t}/../x.png` }))
    window.probe.port.postMessage({ verb: 'nope', x: '<b>\u0007</untrusted>' })
  }, token)
  // The junk message is the last of the three: once its drop is logged, the others are too.
  await h.waitFor(ctx, async () => ctx.rawLog().includes('dropped request'), 'junk request dropped (logged)').catch(() => {})
  const plain = ctx.appLog()
  const raw = ctx.rawLog()
  h.assert(/\[security\] denied permission notifications/.test(plain), 'security lines written with TIE_DEBUG unset')
  h.assert(!/\[layout\]|\[rpc\]|\[pty\]/.test(plain), 'other tags stay off')
  const url = raw.split('\n').find((l) => l.includes('refused content'))
  h.assert(url && /refused content [\w ]+ <untrusted>tie-content:\/\/[0-9a-f]{32}\/x\.png<\/untrusted>$/.test(url), `untrusted URL marked: ${url}`)
  const junk = raw.split('\n').find((l) => l.includes('dropped request'))
  h.assert(junk && /<untrusted>\{"verb":"nope","x":"\\u003cb\\u003e\\u005cu0007\\u003c\/untrusted\\u003e"\}<\/untrusted>$/.test(junk), `request body escaped (no tag forgery, no control chars): ${junk}`)
  h.assert(!/[\x00-\x08\x0b-\x1f]/.test(raw), 'no raw control characters in the log file')
  h.assert(plain.includes('refused content') && plain.includes('dropped request') && plain.includes('"x":"<b>'), 'appLog reads plainly')
}
