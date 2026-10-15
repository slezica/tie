// Security: every permission (notifications, clipboard read, media, external protocols...) is denied.
export default async (ctx, h) => {
  const r = await ctx.page.evaluate(async () => {
    const q = async (name) => (await navigator.permissions.query({ name }).catch((e) => ({ state: 'error ' + e.message }))).state
    return {
      notifyRequest: await Notification.requestPermission(),
      notifications: await q('notifications'),
      camera: await q('camera'),
      microphone: await q('microphone'),
      geolocation: await q('geolocation'),
      // Never return clipboard contents: only whether the read was allowed.
      clipboardRead: await navigator.clipboard.readText().then(() => 'granted', (e) => 'denied ' + e.name),
      midi: await q('midi'),
    }
  })
  ctx.log(r)
  for (const [k, v] of Object.entries(r)) h.assert(/^denied/.test(v), `${k}: ${v}`)
  // External protocol launch (scheme with no handler: nothing gets launched even if allowed).
  // (Top frame: the shell CSP already refuses iframes.)
  await ctx.page.evaluate(() => (location.href = 'x-tie-test://probe')).catch(() => {})
  await ctx.sleep(500)
  // Navigation guard may catch it first; either way it never launches.
  h.assert(/denied permission openExternal|blocked navigation main x-tie-test/.test(ctx.appLog()), 'external protocol launch denied')
}
