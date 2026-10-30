// Missing shell or cwd: tile shows error state (stays open); settings refuses to save a bad shell.
export const settings = { shell: '/nonexistent/bash' } // e.g. shell removed after it was set

export default async (ctx, h) => {
  await ctx.sleep(500)
  let t = (await h.list(ctx)).tiles[0]
  h.assert(t && t.error && t.error.includes('/nonexistent/bash'), `tile in error state: ${t?.error}`)
  h.assert(await ctx.page.isVisible('.tile-error .word'), 'error shown')
  await ctx.shot('tile-error')

  await ctx.page.evaluate(() => document.dispatchEvent(new CustomEvent('tie:settings')))
  await ctx.page.waitForSelector('.settings')
  await ctx.page.locator('nav button[data-page="terminal"]').click()
  await ctx.page.fill('#set-shell', 'no-such-shell-xyz -l')
  await ctx.page.locator('.save').click()
  await ctx.sleep(200)
  h.assert(await ctx.page.isVisible('.settings'), 'panel stays open on invalid shell')
  h.assert(await ctx.page.isVisible('.status.error'), 'error message shown')
  h.assert(await ctx.page.$('#set-shell.invalid'), 'field marked')
  await ctx.shot('save-blocked')
  // Error points to the right page even from another page.
  await ctx.page.locator('nav button[data-page="appearance"]').click()
  await ctx.page.locator('.save').click()
  await ctx.sleep(200)
  h.assert(await ctx.page.isVisible('#set-shell'), 'switched to Terminal page')
  // Editing clears; a valid shell saves.
  await ctx.page.fill('#set-shell', 'bash')
  h.assert(!(await ctx.page.isVisible('.status.error')), 'error cleared on edit')
  await ctx.page.locator('.save').click()
  await ctx.sleep(200)
  h.assert(!(await ctx.page.$('.settings')), 'saved')
  const ok = await ctx.tie('add', 'terminal')
  await ctx.sleep(500)
  t = (await h.list(ctx)).tiles.find((x) => x.id === ok.id)
  h.assert(t && !t.error && t.term.pty, 'new terminal works')

  // Missing working directory: error state, for shells and --cmd tiles alike.
  const sh = (await ctx.tie('add', 'terminal', '--cwd', '/nonexistent/dir')).id
  const cmd = (await ctx.tie('add', 'terminal', '--cwd', '/nonexistent/dir', '--cmd', 'true')).id
  await ctx.sleep(1500)
  for (const id of [sh, cmd]) {
    t = (await h.list(ctx)).tiles.find((x) => x.id === id)
    h.assert(t && t.error?.includes('/nonexistent/dir'), `${id} shows missing dir: ${t?.error}`)
  }
}
